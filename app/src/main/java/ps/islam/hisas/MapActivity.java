package ps.islam.hisas;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Outline;
import android.view.ViewOutlineProvider;
import android.widget.ImageView;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import org.json.JSONObject;

/** Shows GovMap inside the app, in its own WebView (no AndroidBridge exposed to the site). */
public class MapActivity extends Activity {
    private WebView web;
    private String startUrl;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private float pinX = -1, pinY = -1;      // point position in WebView pixels
    private boolean autoTapping = false, locating = false;
    private int session = 0;                  // bumps on every (re)load so old timers are ignored

    /** finds the map surface (largest canvas / map container) and returns its centre in CSS px + the page width */
    private static final String FIND_JS = "(function(){try{var best=null,ba=0;"
        + "var els=document.querySelectorAll('canvas,.esri-view-surface,.esri-view-root,.ol-viewport,.leaflet-container,#map,#mapDiv,.map');"
        + "for(var i=0;i<els.length;i++){var r=els[i].getBoundingClientRect();var a=r.width*r.height;"
        + "if(r.width>innerWidth*0.45&&r.height>innerHeight*0.35&&a>ba){ba=a;best=r;}}"
        + "if(!best||document.readyState!=='complete')return JSON.stringify({ok:0});"
        + "return JSON.stringify({ok:1,l:Math.max(0,best.left),t:Math.max(0,best.top),r:Math.min(innerWidth,best.right),b:Math.min(innerHeight,best.bottom),w:innerWidth});}catch(e){return JSON.stringify({ok:0});}})()";

    private float mapL, mapT, mapR, mapB;     // visible map surface in WebView pixels

    private void locatePoint(final int s, final int tries) {
        if (s != session || web == null) return;
        web.evaluateJavascript(FIND_JS, v -> {
            if (s != session) return;
            try {
                String j = v;
                if (j != null && j.startsWith("\"")) j = new JSONObject("{\"v\":" + j + "}").getString("v");
                JSONObject o = new JSONObject(j);
                if (o.optInt("ok") == 1 && o.optDouble("w") > 0) {
                    float k = web.getWidth() / (float) o.getDouble("w");
                    mapL = (float) o.getDouble("l") * k; mapT = (float) o.getDouble("t") * k;
                    mapR = (float) o.getDouble("r") * k; mapB = (float) o.getDouble("b") * k;
                    // give GovMap time to draw its own marker and the layers, then find the marker and tap it
                    ui.postDelayed(() -> tapCentre(s), 2500);
                    return;
                }
            } catch (Exception ignored) { }
            if (tries < 60) ui.postDelayed(() -> locatePoint(s, tries + 1), 500); else locating = false;
        });
    }

    /** GovMap draws a blue marker exactly on the coordinate; find it on screen and return its tip */
    private float[] findMarker() {
        int W = web.getWidth(), H = web.getHeight();
        if (W <= 0 || H <= 0) return null;
        final int sc = 2;                                  // analyse at half resolution
        int w = W / sc, h = H / sc;
        Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bm);
        c.scale(1f / sc, 1f / sc);
        c.translate(-web.getScrollX(), -web.getScrollY());
        web.draw(c);
        int[] px = new int[w * h];
        bm.getPixels(px, 0, w, 0, 0, w, h);
        bm.recycle();
        int x0 = Math.max(0, (int) (mapL / sc)), x1 = Math.min(w, (int) (mapR / sc));
        int y0 = Math.max(0, (int) (mapT / sc)), y1 = Math.min(h, (int) (mapB / sc));
        boolean[] m = new boolean[w * h];
        for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) {
            int p = px[y * w + x], r = (p >> 16) & 255, g = (p >> 8) & 255, b = p & 255;
            m[y * w + x] = b > 200 && g > 110 && g < 210 && r < 130 && b - r > 100;
        }
        // largest connected blob of marker blue
        int[] stack = new int[w * h];
        int bestN = 0, bMinX = 0, bMaxX = 0, bMinY = 0, bMaxY = 0;
        for (int i = 0; i < m.length; i++) {
            if (!m[i]) continue;
            int sp = 0, n = 0, mnx = w, mxx = 0, mny = h, mxy = 0;
            stack[sp++] = i; m[i] = false;
            while (sp > 0) {
                int q = stack[--sp], qx = q % w, qy = q / w; n++;
                if (qx < mnx) mnx = qx; if (qx > mxx) mxx = qx; if (qy < mny) mny = qy; if (qy > mxy) mxy = qy;
                int[] nb = {q - 1, q + 1, q - w, q + w};
                for (int t : nb) if (t >= 0 && t < m.length && m[t] && Math.abs(t % w - qx) <= 1) { m[t] = false; stack[sp++] = t; }
            }
            if (n > bestN) { bestN = n; bMinX = mnx; bMaxX = mxx; bMinY = mny; bMaxY = mxy; }
        }
        float bw = bMaxX - bMinX + 1, bh = bMaxY - bMinY + 1;
        // a marker is a compact blob taller than wide, a few dp in size
        if (bestN < dp(40) || bw > dp(40) || bh > dp(60) || bh < bw * 0.9f) return null;
        return new float[]{(bMinX + bMaxX) / 2f * sc, (bMaxY + bh * 0.08f) * sc};
    }

    /** GovMap opens the map centred on the coordinate: tap the centre so GovMap shows its information.
     *  GovMap then draws its blue marker where it understood the tap; if that is off the centre,
     *  tap again corrected by the difference so the marker and the information are for the coordinate. */
    private void tapCentre(final int s) {
        if (s != session || web == null || mapR <= mapL) return;
        final float cx = (mapL + mapR) / 2f, cy = (mapT + mapB) / 2f;
        pinX = cx; pinY = cy; tapPoint();
        ui.postDelayed(() -> checkMarker(s, cx, cy, 0), 1200);
    }

    private void checkMarker(final int s, final float cx, final float cy, final int tries) {
        if (s != session || web == null) return;
        float[] t = null;
        try { t = findMarker(); } catch (Throwable ignored) { }
        if (t == null) { if (tries < 6) ui.postDelayed(() -> checkMarker(s, cx, cy, tries + 1), 500); return; }
        float dx = t[0] - cx, dy = t[1] - cy;
        if (Math.hypot(dx, dy) <= dp(6)) return;            // GovMap took the tap exactly on the coordinate
        float nx = cx - dx, ny = cy - dy;
        if (nx < mapL || nx > mapR || ny < mapT || ny > mapB) return;
        pinX = nx; pinY = ny; tapPoint();
    }

    /** real touch on the point, exactly like a finger tap, so GovMap opens its information popup */
    /** a finger-like touch event: screen (raw) coordinates are set correctly, then shifted into the WebView */
    private MotionEvent touch(long down, long at, int action, float x, float y) {
        int[] loc = new int[2];
        web.getLocationOnScreen(loc);
        MotionEvent.PointerProperties[] pp = { new MotionEvent.PointerProperties() };
        pp[0].id = 0; pp[0].toolType = MotionEvent.TOOL_TYPE_FINGER;
        MotionEvent.PointerCoords[] pc = { new MotionEvent.PointerCoords() };
        pc[0].x = x + loc[0]; pc[0].y = y + loc[1]; pc[0].pressure = 1f; pc[0].size = 0.05f;
        pc[0].touchMajor = dp(8); pc[0].touchMinor = dp(8);
        MotionEvent e = MotionEvent.obtain(down, at, action, 1, pp, pc, 0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
        e.offsetLocation(-loc[0], -loc[1]);
        return e;
    }

    /** real touch on the point, exactly like a finger tap, so GovMap opens its information popup */
    private void tapPoint() {
        if (pinX < 0 || web == null) return;
        autoTapping = true;
        final long t = SystemClock.uptimeMillis();
        final float x = pinX, y = pinY;
        MotionEvent d = touch(t, t, MotionEvent.ACTION_DOWN, x, y);
        web.dispatchTouchEvent(d); d.recycle();
        ui.postDelayed(() -> {
            MotionEvent u = touch(t, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y);
            web.dispatchTouchEvent(u); u.recycle(); autoTapping = false;
        }, 90);
    }

    private void toastMsg(String t) { android.widget.Toast.makeText(this, t, android.widget.Toast.LENGTH_LONG).show(); }

    private void loadPoint() {
        session++;
        locating = false;
        pinX = pinY = -1;
        web.loadUrl(startUrl);
    }

    static boolean isGovmap(Uri u) {
        String h = u == null ? null : u.getHost();
        return h != null && (h.equals("govmap.gov.il") || h.endsWith(".govmap.gov.il"));
    }

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    private static final int GREEN_DARK = Color.parseColor("#0c3b26");
    private static final int GREEN = Color.parseColor("#155a3a");
    private static final int GOLD = Color.parseColor("#c99a2e");
    private static final int GOLD_LIGHT = Color.parseColor("#f3dc93");

    /** gold pill like the "الرئيسية" button of the web pages */
    private TextView goldPill(String text, View.OnClickListener l) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.parseColor("#4a2e00"));
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        b.setPadding(dp(14), dp(7), dp(14), dp(7));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.parseColor("#fff1b8"), Color.parseColor("#f0cf6a"), GOLD});
        bg.setCornerRadius(dp(999));
        b.setBackground(bg);
        b.setElevation(dp(3));
        b.setOnClickListener(l);
        return b;
    }

    /** green pill with gold ring, like the main buttons of the web pages */
    private TextView greenPill(String text, View.OnClickListener l) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.parseColor("#fff6d6"));
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        b.setPadding(dp(18), dp(10), dp(18), dp(10));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.parseColor("#1b7049"), Color.parseColor("#114d32"), GREEN_DARK});
        bg.setCornerRadius(dp(999));
        bg.setStroke(dp(2), Color.parseColor("#e6c35f"));
        b.setBackground(bg);
        b.setElevation(dp(6));
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMarginStart(dp(5)); lp.setMarginEnd(dp(5));
        b.setLayoutParams(lp);
        return b;
    }

    private View topBar(String xy) {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        bar.setPadding(dp(12), dp(8), dp(12), dp(8));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{GREEN, GREEN_DARK});
        bar.setBackground(bg);
        bar.setElevation(dp(6));

        ImageView icon = new ImageView(this);
        try { Bitmap bm = BitmapFactory.decodeStream(getAssets().open("img/t-govmap.png")); icon.setImageBitmap(bm); } catch (Exception ignored) { }
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable ring = new GradientDrawable();
        ring.setCornerRadius(dp(10)); ring.setStroke(dp(2), Color.parseColor("#e6c35f")); ring.setColor(GOLD_LIGHT);
        icon.setBackground(ring);
        icon.setPadding(dp(2), dp(2), dp(2), dp(2));
        icon.setOutlineProvider(new ViewOutlineProvider() {
            @Override public void getOutline(View v, Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), dp(10)); }
        });
        icon.setClipToOutline(true);
        bar.addView(icon, new LinearLayout.LayoutParams(dp(40), dp(40)));

        LinearLayout txt = new LinearLayout(this);
        txt.setOrientation(LinearLayout.VERTICAL);
        txt.setPadding(dp(10), 0, dp(10), 0);
        TextView t = new TextView(this);
        t.setText("GOV إسلام");
        t.setTextColor(Color.parseColor("#f0cf6a"));
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        t.setShadowLayer(1.5f, 0, dp(1), Color.parseColor("#99000000"));
        txt.addView(t);
        if (xy != null) {
            TextView sub = new TextView(this);
            sub.setText(xy);
            sub.setTextColor(Color.parseColor("#e7efe1"));
            sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            sub.setTypeface(android.graphics.Typeface.MONOSPACE);
            sub.setTextDirection(View.TEXT_DIRECTION_LTR);
            txt.addView(sub);
        }
        bar.addView(txt, new LinearLayout.LayoutParams(0, -2, 1f));
        bar.addView(goldPill("‹ رجوع", v -> finish()));

        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        View line = new View(this);
        line.setBackgroundColor(GOLD);
        wrap.addView(line, new LinearLayout.LayoutParams(-1, dp(2)));
        return wrap;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startUrl = getIntent().getDataString();
        if (startUrl == null) { finish(); return; }

        getWindow().setStatusBarColor(GREEN);
        String xy = null;
        try {
            String c = Uri.parse(startUrl).getQueryParameter("c");
            if (c != null && c.contains(",")) { String[] p = c.split(","); xy = "X " + p[0] + "   Y " + p[1]; }
        } catch (Exception ignored) { }

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(Color.parseColor("#f8f2e2"));
        page.addView(topBar(xy), new LinearLayout.LayoutParams(-1, -2));

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#f8f2e2"));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));

        final ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(android.content.res.ColorStateList.valueOf(GOLD));
        root.addView(bar, new FrameLayout.LayoutParams(-1, dp(4), Gravity.TOP));

        LinearLayout tools = new LinearLayout(this);
        tools.setOrientation(LinearLayout.HORIZONTAL);
        tools.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        tools.addView(greenPill("↺ النقطة", v -> loadPoint()));
        tools.addView(greenPill("المتصفح", v -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(web.getUrl() != null ? web.getUrl() : startUrl))); } catch (Exception ignored) { }
        }));
        FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        tp.bottomMargin = dp(18);
        root.addView(tools, tp);
        page.addView(root, new LinearLayout.LayoutParams(-1, 0, 1f));
        setContentView(page);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (pinX < 0 && !locating) { locating = true; final int sid = session; ui.postDelayed(() -> locatePoint(sid, 0), 800); }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (isGovmap(u)) return false;
                String sc = u.getScheme();
                if ("https".equals(sc) || "http".equals(sc)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                    return true;
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                bar.setProgress(p);
                bar.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else loadPoint();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else finish();
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.stopLoading(); web.destroy(); }
        super.onDestroy();
    }
}
