/*
 * حاسبة حصص سند الملكية
 * صاحب ومطور التطبيق: إسلام دويكات (Islam Dweikat) - هاتف: 0598161862
 * © 2026 Islam Dweikat. جميع الحقوق محفوظة.
 */
package ps.islam.hisas;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.database.Cursor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.speech.RecognizerIntent;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;

public class MainActivity extends Activity {

    private static final String START_URL = "https://appassets.androidplatform.net/assets/home.html";
    private static final String HISAS_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final int REQ_FILE = 1;
    private static final int REQ_VOICE = 2;
    private static final int REQ_GEO = 3;
    private android.webkit.GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private String voiceId;
    private WebView printWeb;
    private File sharedDir;
    private boolean pageReady = false;
    private String pendingShared = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setGeolocationEnabled(true);

        sharedDir = new File(getCacheDir(), "shared");
        sharedDir.mkdirs();
        cleanShared();
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/shared/", new WebViewAssetLoader.InternalStoragePathHandler(this, sharedDir))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageReady = false;   // only the deed page calls jsReady()
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                if (MapActivity.isGovmap(u)) { openMapActivity(u.toString()); return true; }
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback callback) {
                if (!origin.contains("appassets.androidplatform.net")) { callback.invoke(origin, false, false); return; }
                if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    geoCallback = callback; geoOrigin = origin;
                    requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_GEO);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean capture = params != null && params.isCaptureEnabled();
                boolean multiple = params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                boolean wantsPdf = false, wantsImg = false, wantsOther = false;
                String[] acc = params != null ? params.getAcceptTypes() : null;
                if (acc != null) {
                    for (String a : acc) {
                        if (a == null) continue;
                        for (String t : a.split(",")) {
                            t = t.trim().toLowerCase();
                            if (t.equals("application/pdf") || t.equals(".pdf")) wantsPdf = true;
                            else if (t.startsWith("image") || t.startsWith(".jp") || t.startsWith(".png")) wantsImg = true;
                            else if (!t.isEmpty()) wantsOther = true;
                        }
                    }
                }
                // DXF, CSV or no filter at all (the cut/fill and subdivision tools): any file, no camera
                if (wantsOther || (!wantsPdf && !wantsImg)) { openAnyFile(multiple); return true; }
                openChooser(capture, multiple, wantsImg, wantsPdf);
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
        if (savedInstanceState == null) handleShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent);
    }

    /* ---------- files shared into the app ---------- */

    private void cleanShared() {
        File[] old = sharedDir.listFiles();
        if (old == null) return;
        long limit = System.currentTimeMillis() - 24L * 3600 * 1000;
        for (File f : old) if (f.lastModified() < limit) f.delete();
    }

    @SuppressWarnings("deprecation")
    private void handleShareIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        final ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            uris.add(intent.getData());
        }
        if (uris.isEmpty()) return;
        intent.setAction(null);   // handle each share only once
        new Thread(() -> {
            JSONArray arr = new JSONArray();
            for (int i = 0; i < uris.size(); i++) {
                Uri u = uris.get(i);
                try {
                    String mime = getContentResolver().getType(u);
                    String name = null;
                    try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                        if (c != null && c.moveToFirst()) name = c.getString(0);
                    } catch (Exception ignored) { }
                    if (name == null) name = "deed_" + (i + 1);
                    String lower = name.toLowerCase();
                    if (mime == null) mime = lower.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
                    String ext = mime.contains("pdf") ? ".pdf" : mime.contains("png") ? ".png" : mime.contains("webp") ? ".webp" : ".jpg";
                    File out = new File(sharedDir, System.currentTimeMillis() + "_" + i + ext);
                    try (InputStream in = getContentResolver().openInputStream(u); FileOutputStream os = new FileOutputStream(out)) {
                        if (in == null) continue;
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                    }
                    JSONObject o = new JSONObject();
                    o.put("url", "https://appassets.androidplatform.net/shared/" + out.getName());
                    o.put("name", name);
                    o.put("mime", mime);
                    arr.put(o);
                } catch (Exception e) {
                    toast("تعذّر استلام أحد الملفات");
                }
            }
            if (arr.length() == 0) return;
            final String json = arr.toString();
            runOnUiThread(() -> {
                String cur = web.getUrl();
                if (pageReady && cur != null && cur.startsWith(HISAS_URL)) deliverShared(json);
                else { pendingShared = json; if (cur == null || !cur.startsWith(HISAS_URL)) web.loadUrl(HISAS_URL); }
            });
        }).start();
    }

    private void deliverShared(String json) {
        web.evaluateJavascript("window.onSharedFiles && window.onSharedFiles(" + json + ")", null);
    }

    /* ---------- image picker / camera ---------- */

    private void openChooser(boolean capture, boolean multiple, boolean wantsImg, boolean wantsPdf) {
        Intent camera = null;
        cameraUri = null;
        if (wantsImg) try {
            File dir = new File(getCacheDir(), "cam");
            dir.mkdirs();
            File f = new File(dir, "deed_" + System.currentTimeMillis() + ".jpg");
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
            camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            camera.setClipData(ClipData.newRawUri("", cameraUri));
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception e) {
            cameraUri = null;
            camera = null;
        }

        Intent intent;
        if (capture && camera != null) {
            intent = camera;
        } else {
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            if (wantsImg && wantsPdf) {
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "application/pdf"});
            } else if (wantsPdf) {
                pick.setType("application/pdf");
            } else {
                pick.setType("image/*");
            }
            if (multiple) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            intent = Intent.createChooser(pick, wantsPdf && !wantsImg ? "اختر ملف PDF" : "اختر صور السند");
            if (camera != null) intent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        }

        try {
            startActivityForResult(intent, REQ_FILE);
        } catch (ActivityNotFoundException e) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = null;
            toast("لا يوجد تطبيق لاختيار الصور على هذا الجهاز");
        }
    }

    private void openAnyFile(boolean multiple) {
        cameraUri = null;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("*/*");
        if (multiple) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try {
            startActivityForResult(Intent.createChooser(pick, "اختر الملف"), REQ_FILE);
        } catch (ActivityNotFoundException e) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = null;
            toast("لا يوجد تطبيق لاختيار الملفات على هذا الجهاز");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQ_FILE) {
            if (fileCallback == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                ArrayList<Uri> list = new ArrayList<>();
                if (data != null && data.getClipData() != null) {
                    ClipData cd = data.getClipData();
                    for (int i = 0; i < cd.getItemCount(); i++) {
                        Uri u = cd.getItemAt(i).getUri();
                        if (u != null) list.add(u);
                    }
                } else if (data != null && data.getData() != null) {
                    list.add(data.getData());
                } else if (cameraUri != null) {
                    list.add(cameraUri);
                }
                if (!list.isEmpty()) result = list.toArray(new Uri[0]);
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;

        } else if (requestCode == REQ_VOICE) {
            String id = voiceId;
            voiceId = null;
            if (id == null) return;
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> m = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (m != null && !m.isEmpty()) {
                    js("window.onNativeVoice(" + JSONObject.quote(id) + "," + JSONObject.quote(m.get(0)) + ")");
                    return;
                }
            }
            js("window.onNativeVoiceError(" + JSONObject.quote(id) + ",\"cancel\")");
        }
    }

    /* ---------- helpers ---------- */

    private void js(final String code) {
        runOnUiThread(() -> web.evaluateJavascript(code, null));
    }

    private void toast(final String text) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show());
    }

    private void share(final Uri uri, final String mime) {
        runOnUiThread(() -> {
            Intent s = new Intent(Intent.ACTION_SEND);
            s.setType(mime);
            s.putExtra(Intent.EXTRA_STREAM, uri);
            s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try { startActivity(Intent.createChooser(s, "مشاركة الملف")); } catch (Exception ignored) { }
        });
    }

    private static String readAll(InputStream is) throws Exception {
        try (InputStream in = is; ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /* ---------- JavaScript bridge ---------- */

    private class Bridge {

        @JavascriptInterface
        public void startVoice(final String id) {
            runOnUiThread(() -> {
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-JO");
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ar-JO");
                i.putExtra(RecognizerIntent.EXTRA_PROMPT, "تكلّم الآن");
                i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                voiceId = id;
                try {
                    startActivityForResult(i, REQ_VOICE);
                } catch (ActivityNotFoundException e) {
                    voiceId = null;
                    js("window.onNativeVoiceError(" + JSONObject.quote(id) + ",\"unavailable\")");
                }
            });
        }

        @JavascriptInterface
        public void printHtml(final String html, final String jobName) {
            runOnUiThread(() -> {
                final WebView pw = new WebView(MainActivity.this);
                printWeb = pw;
                pw.setWebViewClient(new WebViewClient() {
                    private boolean done = false;
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        if (done) return;
                        done = true;
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        String name = (jobName == null || jobName.isEmpty()) ? "islam-dweikat" : jobName;
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(name);
                        PrintAttributes attrs = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .build();
                        if (pm != null) pm.print(name, adapter, attrs);
                        else toast("خدمة الطباعة غير متاحة على هذا الجهاز");
                    }
                });
                pw.loadDataWithBaseURL("https://appassets.androidplatform.net/", html, "text/html", "UTF-8", null);
            });
        }

        @JavascriptInterface
        public void httpPost(final String id, final String url, final String headersJson, final String body) {
            new Thread(() -> {
                int code;
                String text;
                HttpURLConnection c = null;
                try {
                    if (!url.startsWith("https://")) throw new Exception("https only");
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestMethod("POST");
                    c.setDoOutput(true);
                    c.setConnectTimeout(30000);
                    c.setReadTimeout(180000);
                    JSONObject h = new JSONObject(headersJson);
                    Iterator<String> it = h.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        c.setRequestProperty(k, h.getString(k));
                    }
                    try (OutputStream os = c.getOutputStream()) {
                        os.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                    code = c.getResponseCode();
                    InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    text = is == null ? "" : readAll(is);
                } catch (Exception e) {
                    code = -1;
                    text = String.valueOf(e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                js("window.onNativeHttp(" + JSONObject.quote(id) + "," + code + "," + JSONObject.quote(text) + ")");
            }).start();
        }

        @JavascriptInterface
        public void httpGet(final String id, final String url, final boolean asBase64) {
            new Thread(() -> {
                int code;
                String text;
                HttpURLConnection c = null;
                try {
                    if (!url.startsWith("https://")) throw new Exception("https only");
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestMethod("GET");
                    c.setConnectTimeout(30000);
                    c.setReadTimeout(120000);
                    code = c.getResponseCode();
                    InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (is == null) {
                        text = "";
                    } else if (asBase64 && code < 400) {
                        try (InputStream in = is; ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
                            byte[] buf = new byte[8192];
                            int n;
                            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                            text = Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                        }
                    } else {
                        text = readAll(is);
                    }
                } catch (Exception e) {
                    code = -1;
                    text = String.valueOf(e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                js("window.onNativeHttp(" + JSONObject.quote(id) + "," + code + "," + JSONObject.quote(text) + ")");
            }).start();
        }

        @JavascriptInterface
        public void openMap(final String url, final boolean external) {
            runOnUiThread(() -> {
                Uri u = Uri.parse(url);
                if (!MapActivity.isGovmap(u)) return;
                if (external) { try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { } }
                else openMapActivity(url);
            });
        }

        @JavascriptInterface
        public void jsReady() {
            runOnUiThread(() -> {
                pageReady = true;
                if (pendingShared != null) {
                    String json = pendingShared;
                    pendingShared = null;
                    deliverShared(json);
                }
            });
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("حصص", text));
        }

        @JavascriptInterface
        public void saveFile(String name, String base64, String mime) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new Exception("insert failed");
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os == null) throw new Exception("no stream");
                        os.write(bytes);
                    }
                    toast("حُفظ الملف في التنزيلات: " + name);
                    share(uri, mime);
                } else {
                    File dir = new File(getCacheDir(), "exports");
                    dir.mkdirs();
                    File f = new File(dir, name);
                    try (FileOutputStream os = new FileOutputStream(f)) {
                        os.write(bytes);
                    }
                    share(FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f), mime);
                }
            } catch (Exception e) {
                toast("تعذّر حفظ الملف");
            }
        }
    }

    private void openMapActivity(String url) {
        Intent i = new Intent(this, MapActivity.class);
        i.setData(Uri.parse(url));
        startActivity(i);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_GEO && geoCallback != null) {
            boolean ok = false;
            for (int g : grantResults) if (g == android.content.pm.PackageManager.PERMISSION_GRANTED) ok = true;
            geoCallback.invoke(geoOrigin, ok, false);
            geoCallback = null;
        }
    }

    /* ---------- lifecycle ---------- */

    @Override
    protected void onResume() {
        super.onResume();
        if (MapActivity.printRequested && web != null) {
            MapActivity.printRequested = false;
            web.postDelayed(() -> web.evaluateJavascript("window.govPrint && govPrint()", null), 400);
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
                "(function(){return window.__back ? window.__back() : 0;})()",
                value -> {
                    if ("1".equals(value)) return;
                    if (web.canGoBack()) web.goBack(); else finish();
                });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }
}
