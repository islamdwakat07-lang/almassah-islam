package ps.islam.hisas;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.IntentSender;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
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
import androidx.exifinterface.media.ExifInterface;
import androidx.webkit.WebViewAssetLoader;

import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AwraqActivity extends Activity {

    private static final String APP_URL = "https://appassets.androidplatform.net/assets/awraq/index.html";
    private static final int REQ_FILES = 1;
    private static final int REQ_CAMERA = 2;
    private static final int REQ_SPEECH = 3;
    private static final int REQ_PICK = 4;
    private static final int REQ_PHOTO = 5;
    private static final int REQ_SCAN = 6;
    private static final int REQ_PDF = 7;
    private static final int MAX_PDF_PAGES = 80;
    private static final int MAX_SIDE = 2400;
    private static final Object LOCK = new Object();

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private String speechTarget;
    private SharedPreferences prefs;
    private File pickedDir;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private int seq = 0;
    private final ArrayList<Uri> multi = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("awraq", MODE_PRIVATE);
        pickedDir = new File(getCacheDir(), "picked");
        pickedDir.mkdirs();

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/picked/", new WebViewAssetLoader.InternalStoragePathHandler(this, pickedDir))
                .build();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                openExternal(u.toString());
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean anyFile = false;
                String[] at = params.getAcceptTypes();
                if (at != null) for (String t : at) if (t != null && !t.isEmpty() && !t.startsWith("image")) anyFile = true;
                if (anyFile) openAnyForChooser();
                else if (params.isCaptureEnabled()) openCameraForChooser();
                else openGalleryForChooser(params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                return true;
            }
        });

        String start = getIntent() != null ? getIntent().getStringExtra("url") : null;
        webView.loadUrl(start != null && start.startsWith("https://appassets.androidplatform.net/assets/awraq/") ? start : APP_URL);
    }

    /* زر الرجوع في الهاتف: يرجع داخل التطبيق، ويغلقه فقط من الشاشة الرئيسية */
    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("(window.appBack && window.appBack()) ? 'yes' : 'no'", result -> {
            if (result == null || !result.contains("yes")) finish();
        });
    }

    /* ============ اختيار الصور (الطريقة الجديدة عبر الجسر) ============ */

    private void launchGallery() {
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("image/*");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try {
            startActivityForResult(Intent.createChooser(i, "اختر الصور"), REQ_PICK);
        } catch (ActivityNotFoundException e) {
            deliver(new JSONArray(), false, 0, "لا يوجد معرض صور على الجهاز");
        }
    }

    private void launchCamera() {
        try {
            File dir = new File(getCacheDir(), "camera");
            dir.mkdirs();
            File f = new File(dir, "IMG_" + System.currentTimeMillis() + ".jpg");
            prefs.edit().putString("camPath", f.getAbsolutePath()).commit();
            Uri u = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(MediaStore.EXTRA_OUTPUT, u);
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(i, REQ_PHOTO);
        } catch (Exception e) {
            deliver(new JSONArray(), false, 0, "تعذّر فتح الكاميرا");
        }
    }

    /* ماسح المستندات من Google: يكشف حواف الورقة ويقصها ويحسّنها، وإن لم يتوفر نفتح الكاميرا العادية */
    private void launchPdf() {
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("application/pdf");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try {
            startActivityForResult(Intent.createChooser(i, "اختر ملف PDF"), REQ_PDF);
        } catch (ActivityNotFoundException e) {
            deliver(new JSONArray(), true, 0, "لا يوجد تطبيق ملفات لاختيار PDF");
        }
    }

    /* كل صفحة من ملف PDF تتحول إلى صورة واضحة، وتُضاف كصفحة في البند */
    private void preparePdfAndDeliver(final List<Uri> uris) {
        webView.evaluateJavascript("window.nativeBusy && nativeBusy(true, 'جاري قراءة ملف PDF…')", null);
        io.execute(() -> {
            JSONArray names = new JSONArray();
            int expected = 0;
            String error = null;
            for (Uri u : uris) {
                ParcelFileDescriptor pfd = null;
                PdfRenderer r = null;
                try {
                    pfd = getContentResolver().openFileDescriptor(u, "r");
                    if (pfd == null) throw new Exception("no file");
                    r = new PdfRenderer(pfd);
                    int count = Math.min(r.getPageCount(), MAX_PDF_PAGES - expected);
                    for (int i = 0; i < count; i++) {
                        expected++;
                        try (PdfRenderer.Page page = r.openPage(i)) {
                            int w = page.getWidth(), h = page.getHeight();
                            float sc = 2000f / Math.max(w, h);
                            int bw = Math.max(1, Math.round(w * sc)), bh = Math.max(1, Math.round(h * sc));
                            Bitmap bm = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888);
                            bm.eraseColor(Color.WHITE);
                            page.render(bm, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                            File out = new File(pickedDir, "D" + System.currentTimeMillis() + "_" + (seq++) + ".jpg");
                            try (FileOutputStream fo = new FileOutputStream(out)) {
                                bm.compress(Bitmap.CompressFormat.JPEG, 90, fo);
                            }
                            bm.recycle();
                            if (out.length() > 0) names.put(out.getName());
                        } catch (Throwable t) {
                            // نكمل بباقي الصفحات
                        }
                    }
                    if (expected >= MAX_PDF_PAGES) break;
                } catch (SecurityException se) {
                    error = "ملف PDF محمي بكلمة سر، لا يمكن فتحه";
                } catch (Throwable t) {
                    error = "تعذّرت قراءة ملف PDF";
                } finally {
                    try { if (r != null) r.close(); } catch (Throwable ignored) { }
                    try { if (pfd != null) pfd.close(); } catch (Throwable ignored) { }
                }
            }
            deliver(names, true, expected, names.length() == 0 ? (error != null ? error : "لم تُقرأ أي صفحة من الملف") : null);
        });
    }

    private void launchScanner() {
        try {
            GmsDocumentScannerOptions opts = new GmsDocumentScannerOptions.Builder()
                    .setGalleryImportAllowed(true)
                    .setPageLimit(30)
                    .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
                    .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                    .build();
            GmsDocumentScanning.getClient(opts).getStartScanIntent(this)
                    .addOnSuccessListener(sender -> {
                        try {
                            startIntentSenderForResult(sender, REQ_SCAN, null, 0, 0, 0);
                        } catch (IntentSender.SendIntentException e) {
                            launchCamera();
                        }
                    })
                    .addOnFailureListener(e -> launchCamera());
        } catch (Throwable t) {
            launchCamera();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQ_PDF) {
            if (resultCode != RESULT_OK || data == null) return;
            ArrayList<Uri> uris = new ArrayList<>();
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int k = 0; k < clip.getItemCount(); k++) uris.add(clip.getItemAt(k).getUri());
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
            if (uris.isEmpty()) return;
            preparePdfAndDeliver(uris);
            return;
        }

        if (requestCode == REQ_PICK || requestCode == REQ_PHOTO || requestCode == REQ_SCAN) {
            if (resultCode != RESULT_OK) return;
            ArrayList<Uri> uris = new ArrayList<>();
            boolean scanned = false;
            if (requestCode == REQ_PICK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    for (int k = 0; k < clip.getItemCount(); k++) uris.add(clip.getItemAt(k).getUri());
                } else if (data.getData() != null) {
                    uris.add(data.getData());
                }
            } else if (requestCode == REQ_PHOTO) {
                String path = prefs.getString("camPath", null);
                if (path != null) {
                    File f = new File(path);
                    if (f.exists() && f.length() > 0) uris.add(Uri.fromFile(f));
                }
            } else if (requestCode == REQ_SCAN) {
                scanned = true;
                GmsDocumentScanningResult r = GmsDocumentScanningResult.fromActivityResultIntent(data);
                if (r != null && r.getPages() != null) {
                    for (GmsDocumentScanningResult.Page p : r.getPages()) uris.add(p.getImageUri());
                }
            }
            prepareAndDeliver(uris, scanned);
            return;
        }

        if (requestCode == REQ_FILES) {
            if (fileCallback == null) return;
            ArrayList<Uri> uris = new ArrayList<>();
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    for (int k = 0; k < clip.getItemCount(); k++) uris.add(clip.getItemAt(k).getUri());
                } else if (data.getData() != null) {
                    uris.add(data.getData());
                }
            }
            fileCallback.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
            fileCallback = null;
        } else if (requestCode == REQ_CAMERA) {
            if (fileCallback == null) return;
            fileCallback.onReceiveValue(resultCode == RESULT_OK && cameraUri != null ? new Uri[]{cameraUri} : null);
            fileCallback = null;
        } else if (requestCode == REQ_SPEECH) {
            String text = "";
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (r != null && !r.isEmpty()) text = r.get(0);
            }
            String js = "window.onNativeSpeech && onNativeSpeech(" + JSONObject.quote(speechTarget == null ? "" : speechTarget)
                    + "," + JSONObject.quote(text) + ")";
            webView.evaluateJavascript(js, null);
        }
    }

    /* تجهيز الصور: تصغيرها، تدويرها حسب الكاميرا، وتحويل HEIC إلى JPEG، ثم حفظها لتقرأها الصفحة.
       النتيجة تُحفظ أولاً، فلو أعاد أندرويد تشغيل التطبيق لا تضيع الصور */
    private void prepareAndDeliver(final List<Uri> uris, final boolean scanned) {
        if (uris.isEmpty()) {
            deliver(new JSONArray(), scanned, 0, "لم تصل أي صورة");
            return;
        }
        webView.evaluateJavascript("window.nativeBusy && nativeBusy(true, 'جاري تجهيز الصور…')", null);
        final int expected = uris.size();
        io.execute(() -> {
            JSONArray names = new JSONArray();
            for (Uri u : uris) {
                try {
                    String n = prepare(u);
                    if (n != null) names.put(n);
                } catch (Throwable t) {
                    // نكمل بباقي الصور
                }
            }
            String cam = prefs.getString("camPath", null);
            if (cam != null) {
                new File(cam).delete();
                prefs.edit().remove("camPath").commit();
            }
            deliver(names, scanned, expected, names.length() == 0 ? "تعذّرت قراءة الصور" : null);
        });
    }

    private void deliver(JSONArray names, boolean scanned, int expected, String error) {
        try {
            JSONObject o = new JSONObject();
            o.put("files", names);
            o.put("scanned", scanned);
            o.put("expected", expected);
            if (error != null) o.put("error", error);
            synchronized (LOCK) {
                prefs.edit().putString("pending", o.toString()).commit();
            }
        } catch (Exception e) {
            return;
        }
        runOnUiThread(() -> webView.evaluateJavascript("window.checkNativeFiles && checkNativeFiles()", null));
    }

    private String prepare(Uri u) throws Exception {
        Bitmap bmp = decodeScaled(u);
        if (bmp == null) return null;
        if (bmp.hasAlpha()) {
            Bitmap flat = Bitmap.createBitmap(bmp.getWidth(), bmp.getHeight(), Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(flat);
            c.drawColor(Color.WHITE);
            c.drawBitmap(bmp, 0, 0, null);
            bmp.recycle();
            bmp = flat;
        }
        File out = new File(pickedDir, "P" + System.currentTimeMillis() + "_" + (seq++) + ".jpg");
        try (FileOutputStream fo = new FileOutputStream(out)) {
            bmp.compress(Bitmap.CompressFormat.JPEG, 92, fo);
        }
        bmp.recycle();
        return out.length() > 0 ? out.getName() : null;
    }

    private Bitmap decodeScaled(Uri u) {
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                ImageDecoder.Source src = ImageDecoder.createSource(getContentResolver(), u);
                return ImageDecoder.decodeBitmap(src, (decoder, info, source) -> {
                    int w = info.getSize().getWidth(), h = info.getSize().getHeight();
                    float sc = Math.min(1f, (float) MAX_SIDE / Math.max(w, h));
                    if (sc < 1f) decoder.setTargetSize(Math.max(1, Math.round(w * sc)), Math.max(1, Math.round(h * sc)));
                    decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                });
            } catch (Throwable t) {
                // نجرب الطريقة القديمة
            }
        }
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream in = getContentResolver().openInputStream(u)) {
                BitmapFactory.decodeStream(in, null, bounds);
            }
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2;
            BitmapFactory.Options opt = new BitmapFactory.Options();
            opt.inSampleSize = sample;
            Bitmap b;
            try (InputStream in = getContentResolver().openInputStream(u)) {
                b = BitmapFactory.decodeStream(in, null, opt);
            }
            if (b == null) return null;
            int rot = 0;
            try (InputStream in = getContentResolver().openInputStream(u)) {
                if (in != null) {
                    int or = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                    rot = or == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : or == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : or == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
                }
            } catch (Exception ignored) {
            }
            float sc = Math.min(1f, (float) MAX_SIDE / Math.max(b.getWidth(), b.getHeight()));
            Matrix m = new Matrix();
            if (sc < 1f) m.postScale(sc, sc);
            if (rot != 0) m.postRotate(rot);
            if (!m.isIdentity()) {
                Bitmap r = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
                if (r != b) b.recycle();
                b = r;
            }
            return b;
        } catch (Throwable t) {
            return null;
        }
    }

    /* ============ الطريقة القديمة (احتياطية) عبر حقل الملفات ============ */

    private void openGalleryForChooser(boolean multiple) {
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("image/*");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        try {
            startActivityForResult(Intent.createChooser(i, "اختر الصور"), REQ_FILES);
        } catch (ActivityNotFoundException e) {
            cancelFiles();
        }
    }

    /* اختيار أي ملف (مثل ملف النسخة الاحتياطية) */
    private void openAnyForChooser() {
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("*/*");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        try {
            startActivityForResult(Intent.createChooser(i, "اختر ملف النسخة الاحتياطية"), REQ_FILES);
        } catch (ActivityNotFoundException e) {
            cancelFiles();
        }
    }

    /* حفظ ملف كبير على دفعات في مجلد التنزيلات (النسخة الاحتياطية) */
    private OutputStream bkOut;
    private Uri bkUri;
    private String bkMime;

    private boolean bkBegin(String name, String mime) {
        bkClose();
        try {
            bkMime = mime;
            String safe = name.replaceAll("[\\\\/:*?\"<>|]", "-");
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                bkUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (bkUri == null) return false;
                bkOut = getContentResolver().openOutputStream(bkUri);
            } else {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File f = new File(dir, safe);
                bkOut = new FileOutputStream(f);
                bkUri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
            }
            return bkOut != null;
        } catch (Exception e) {
            bkClose();
            return false;
        }
    }

    private void bkClose() {
        try { if (bkOut != null) bkOut.close(); } catch (Exception ignored) { }
        bkOut = null;
    }

    private void openCameraForChooser() {
        try {
            File dir = new File(getCacheDir(), "camera");
            dir.mkdirs();
            File f = new File(dir, "IMG_" + System.currentTimeMillis() + ".jpg");
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(i, REQ_CAMERA);
        } catch (Exception e) {
            Toast.makeText(this, "تعذّر فتح الكاميرا", Toast.LENGTH_SHORT).show();
            cancelFiles();
        }
    }

    private void cancelFiles() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = null;
    }

    private void openExternal(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "لا يوجد تطبيق لفتح الرابط", Toast.LENGTH_SHORT).show();
        }
    }

    /* الجسر بين صفحة التطبيق والأندرويد */
    private class Bridge {

        @JavascriptInterface
        public void pickImages() {
            runOnUiThread(() -> launchGallery());
        }

        @JavascriptInterface
        public void takePhoto() {
            runOnUiThread(() -> launchCamera());
        }

        @JavascriptInterface
        public void pickPdf() {
            runOnUiThread(() -> launchPdf());
        }

        @JavascriptInterface
        public void scanDocs() {
            runOnUiThread(() -> launchScanner());
        }

        @JavascriptInterface
        public String takePending() {
            synchronized (LOCK) {
                String v = prefs.getString("pending", null);
                prefs.edit().remove("pending").commit();
                return v;
            }
        }

        @JavascriptInterface
        public void cleanupPicked(String json) {
            try {
                JSONArray a = new JSONArray(json);
                for (int i = 0; i < a.length(); i++) {
                    File f = new File(pickedDir, new File(a.getString(i)).getName());
                    f.delete();
                }
            } catch (Exception ignored) {
            }
        }

        /* إرسال عدة ملفات مرة واحدة: نبدأ قائمة جديدة، نضيف الملفات واحداً واحداً، ثم نرسلها معاً */
        @JavascriptInterface
        public void shareReset() {
            synchronized (multi) {
                multi.clear();
                File dir = new File(getCacheDir(), "multi");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
            }
        }

        @JavascriptInterface
        public boolean shareAdd(String base64, String name) {
            try {
                File dir = new File(getCacheDir(), "multi");
                dir.mkdirs();
                File f = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "-"));
                try (FileOutputStream out = new FileOutputStream(f)) {
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                }
                synchronized (multi) {
                    multi.add(FileProvider.getUriForFile(AwraqActivity.this, getPackageName() + ".files", f));
                }
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void shareSendAll(String title) {
            final ArrayList<Uri> uris;
            synchronized (multi) {
                uris = new ArrayList<>(multi);
            }
            if (uris.isEmpty()) return;
            Intent i = new Intent(Intent.ACTION_SEND_MULTIPLE);
            i.setType("application/pdf");
            i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            i.putExtra(Intent.EXTRA_SUBJECT, title);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            runOnUiThread(() -> {
                try {
                    startActivity(Intent.createChooser(i, "إرسال " + title));
                } catch (Exception e) {
                    Toast.makeText(AwraqActivity.this, "تعذّر إرسال الملفات", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void shareFile(String base64, String name, String mime) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File f = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "-"));
                try (FileOutputStream out = new FileOutputStream(f)) {
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                }
                Uri uri = FileProvider.getUriForFile(AwraqActivity.this, getPackageName() + ".files", f);
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_STREAM, uri);
                i.putExtra(Intent.EXTRA_SUBJECT, name);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(i, "إرسال " + name)));
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(AwraqActivity.this, "تعذّر إرسال الملف", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public boolean saveBegin(String name, String mime) {
            return bkBegin(name, mime);
        }

        @JavascriptInterface
        public boolean saveChunk(String base64) {
            try {
                if (bkOut == null) return false;
                bkOut.write(Base64.decode(base64, Base64.DEFAULT));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void saveEnd(String title) {
            bkClose();
            final Uri u = bkUri;
            if (u == null) return;
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(bkMime == null ? "application/octet-stream" : bkMime);
            i.putExtra(Intent.EXTRA_STREAM, u);
            i.putExtra(Intent.EXTRA_SUBJECT, title);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            runOnUiThread(() -> {
                Toast.makeText(AwraqActivity.this, "حُفظت النسخة في مجلد التنزيلات (Download)", Toast.LENGTH_LONG).show();
                try {
                    startActivity(Intent.createChooser(i, "إرسال أو حفظ النسخة"));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void close() {
            runOnUiThread(() -> finish());
        }

        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> openExternal(url));
        }

        @JavascriptInterface
        public void startSpeech(String targetId) {
            speechTarget = targetId;
            runOnUiThread(() -> {
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-PS");
                i.putExtra(RecognizerIntent.EXTRA_PROMPT, "تكلّم الآن");
                try {
                    startActivityForResult(i, REQ_SPEECH);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(AwraqActivity.this, "الإدخال الصوتي غير متوفر على هذا الجهاز", Toast.LENGTH_SHORT).show();
                    webView.evaluateJavascript("window.onNativeSpeech && onNativeSpeech('', '')", null);
                }
            });
        }
    }
}
