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
    /** the GovMap picture taken for printing (JSON for the GOV page), handed over when this screen closes */
    static String printData = null;
    private boolean autoPrint = false, printing = false;
    private Runnable printStep = null;        // runs when the map has loaded and stopped moving (print mode)
    private TextView banner;
    private WebView web;
    private String startUrl;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private float pinX = -1, pinY = -1;      // point position in WebView pixels
    private float downX, downY;
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
                    if (printStep != null) { final Runnable r = printStep; ui.postDelayed(() -> waitThen(s, r, 0), 2000); }
                    else ui.postDelayed(() -> tapCentre(s), 2500);
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
    private int[] lastFrame = null;
    private int stableCount = 0;

    /** tiny snapshot of the map, to know when GovMap has finished moving/drawing */
    private int[] frame() {
        int w = Math.max(1, web.getWidth() / 10), h = Math.max(1, web.getHeight() / 10);
        Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bm); c.scale(0.1f, 0.1f); c.translate(-web.getScrollX(), -web.getScrollY()); web.draw(c);
        int[] px = new int[w * h]; bm.getPixels(px, 0, w, 0, 0, w, h); bm.recycle(); return px;
    }

    /** GovMap opens centred on the coordinate, but it keeps animating/zooming for a moment.
     *  Tap only after the picture has stopped changing, so the tap lands on the coordinate itself. */
    private void tapCentre(final int s) { lastFrame = null; stableCount = 0; waitStable(s, 0); }

    private void waitStable(final int s, final int tries) {
        if (s != session || web == null || mapR <= mapL) return;
        int[] f = null; try { f = frame(); } catch (Throwable ignored) { }
        if (f != null && lastFrame != null && f.length == lastFrame.length) {
            long diff = 0; for (int i = 0; i < f.length; i++) { int a = f[i], b = lastFrame[i];
                diff += Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255)); }
            stableCount = diff / (double) f.length < 2.0 ? stableCount + 1 : 0;
        }
        lastFrame = f;
        if (stableCount >= 2 || tries > 25) {
            centreCross();
            pinX = cx(); pinY = cy(); tapPoint();
            return;
        }
        ui.postDelayed(() -> waitStable(s, tries + 1), 600);
    }
    private float cx() { return (mapL + mapR) / 2f; }
    private float cy() { return (mapT + mapB) / 2f; }

    /* red + white crosshair exactly on the coordinate (a backup marker, like the old app) */
    private View cross;
    private void centreCross() {
        if (cross == null) return;
        cross.setTranslationX(cx() - cross.getWidth() / 2f); cross.setTranslationY(cy() - cross.getHeight() / 2f);
        cross.setVisibility(View.VISIBLE);
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


    /* ================= طباعة صورة GovMap ================= */
    /** hides GovMap's own buttons, search box, panels and popups over the map, so only the map is captured */
    private static final String HIDE_JS = "(function(){try{window.__ph=[];var best=null,ba=0;"
        + "var els=document.querySelectorAll('canvas,.esri-view-surface,.esri-view-root,.ol-viewport,.leaflet-container,#map,#mapDiv,.map');"
        + "for(var i=0;i<els.length;i++){var r=els[i].getBoundingClientRect();var a=r.width*r.height;if(r.width>innerWidth*0.45&&r.height>innerHeight*0.35&&a>ba){ba=a;best=els[i];}}"
        + "if(!best)return 0;var all=document.body.querySelectorAll('*');"
        + "for(var j=0;j<all.length;j++){var e=all[j];if(e.contains(best)||best.contains(e)&&e.tagName==='CANVAS')continue;"
        + "var t=e.tagName,hit=/^(BUTTON|INPUT|TEXTAREA|SELECT|A|LABEL|H1|H2|H3|P|SPAN|LI)$/.test(t)||e.getAttribute('role')==='button'||e.getAttribute('role')==='dialog';"
        + "if(!hit){for(var k=0;k<e.childNodes.length;k++){var n=e.childNodes[k];if(n.nodeType===3&&n.textContent.trim()){hit=true;break;}}}"
        + "if(!hit)continue;var r2=e.getBoundingClientRect();if(r2.width<1||r2.height<1)continue;"
        + "var top=e;while(top.parentElement&&top.parentElement!==document.body&&!top.parentElement.contains(best))top=top.parentElement;"
        + "if(top.contains(best)||top.__phd)continue;top.__phd=1;window.__ph.push([top,top.style.visibility]);top.style.visibility='hidden';}"
        + "return window.__ph.length;}catch(e){return -1;}})()";
    private static final String SHOW_JS = "(function(){try{(window.__ph||[]).forEach(function(p){p[0].style.visibility=p[1];p[0].__phd=0;});window.__ph=[];}catch(e){}})()";
    private static final String IW_JS = "(function(){return innerWidth;})()";

    private double pcx, pcy, pz, pD, pRes0, pk;
    private Bitmap shotA;
    private float[] aCrop;
    private String infoText = "";
    private float markX = -1, markY = -1;

    private static double scaleOf(double z) {   // GovMap zoom levels (1:… at 96 dpi)
        double[] sc = {2000000, 1000000, 500000, 250000, 100000, 50000, 25000, 10000, 5000, 2500, 1250, 625, 312.5, 156.25};
        int i = (int) Math.floor(z); if (i < 0) return sc[0]; if (i >= sc.length - 1) return sc[sc.length - 1];
        double f = z - i; return sc[i] * Math.pow(sc[i + 1] / sc[i], f);
    }
    private String urlAt(double x, double y) {
        Uri u = Uri.parse(printBase != null ? printBase : startUrl); Uri.Builder b = u.buildUpon().clearQuery();
        for (String n : u.getQueryParameterNames()) {
            if (n.equals("c")) b.appendQueryParameter("c", String.format(java.util.Locale.US, "%.2f,%.2f", x, y));
            else if (n.equals("z")) b.appendQueryParameter("z", String.format(java.util.Locale.US, pz == Math.rint(pz) ? "%.0f" : "%.2f", pz));
            else b.appendQueryParameter(n, u.getQueryParameter(n));
        }
        return b.build().toString().replace("%2C", ",");
    }
    private void say(String t) { banner.setText(t); banner.setVisibility(t == null ? View.GONE : View.VISIBLE); }

    private String printBase;     // GovMap address with the layers that are on now
    private void startPrint() {
        if (printing) return;
        printing = true; if (cross != null) cross.setVisibility(View.GONE);
        web.evaluateJavascript("(function(){return location.href;})()", hj -> {
            String href = null; try { href = new JSONObject("{\"v\":" + hj + "}").getString("v"); } catch (Exception ignored) { }
            double[] c = cz(href); printBase = href;
            if (c == null) { c = cz(web.getUrl()); printBase = web.getUrl(); }
            if (c == null) { c = cz(startUrl); printBase = startUrl; }
            if (c == null) { printing = false; toastMsg("تعذّر معرفة موقع الخارطة"); return; }
            pcx = c[0]; pcy = c[1]; pz = c[2];
            // 1) the picture exactly as it is on the screen now
            web.evaluateJavascript(FIND_JS, v -> {
                try { String j = v; if (j != null && j.startsWith("\"")) j = new JSONObject("{\"v\":" + j + "}").getString("v");
                    JSONObject o = new JSONObject(j);
                    if (o.optInt("ok") == 1) { float k = web.getWidth() / (float) o.getDouble("w");
                        mapL = (float) o.getDouble("l") * k; mapT = (float) o.getDouble("t") * k; mapR = (float) o.getDouble("r") * k; mapB = (float) o.getDouble("b") * k; }
                } catch (Exception ignored) { }
                if (mapR <= mapL) { mapL = 0; mapT = 0; mapR = web.getWidth(); mapB = web.getHeight(); }
                printShotA();
            });
        });
    }
    private static double[] cz(String url) {
        try { Uri u = Uri.parse(url); String c = u.getQueryParameter("c"), z = u.getQueryParameter("z");
            if (c == null || !c.contains(",")) return null; String[] p = c.split(",");
            return new double[]{Double.parseDouble(p[0].trim()), Double.parseDouble(p[1].trim()), z == null ? 9 : Double.parseDouble(z)}; }
        catch (Exception e) { return null; }
    }
    private void printLoad(String url, Runnable then) {
        session++; locating = false; pinX = pinY = -1; mapR = mapL = 0;
        printStep = then;
        web.loadUrl(url);
    }
    /** waits until the picture has stopped changing, then runs r */
    private void waitThen(final int s, final Runnable r, final int tries) {
        if (s != session || web == null) return;
        if (tries == 0) { lastFrame = null; stableCount = 0; cropL = mapL; cropT = mapT; cropR = mapR; cropB = mapB; }
        screenCopy(mapRectInWindow(), 10, bm -> {
            if (s != session) return;
            int[] f = null;
            if (bm != null) { f = new int[bm.getWidth() * bm.getHeight()]; bm.getPixels(f, 0, bm.getWidth(), 0, 0, bm.getWidth(), bm.getHeight()); bm.recycle(); }
            if (f != null && lastFrame != null && f.length == lastFrame.length) {
                long diff = 0; for (int i = 0; i < f.length; i++) { int a = f[i], b = lastFrame[i];
                    diff += Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255)); }
                stableCount = diff / (double) f.length < 1.5 ? stableCount + 1 : 0;
            }
            lastFrame = f;
            if ((stableCount >= 3 && tries >= 4) || tries > 40) { printStep = null; r.run(); return; }
            ui.postDelayed(() -> waitThen(s, r, tries + 1), 600);
        });
    }
    /** what is really on the screen inside the map rectangle (PixelCopy sees GPU-drawn map layers; web.draw does not) */
    private android.graphics.Rect mapRectInWindow() {
        int[] loc = new int[2]; web.getLocationInWindow(loc);
        int L = Math.max(0, (int) cropL), T = Math.max(0, (int) cropT), R = Math.min(web.getWidth(), (int) cropR), B = Math.min(web.getHeight(), (int) cropB);
        if (R - L < 50 || B - T < 50) { L = 0; T = 0; R = web.getWidth(); B = web.getHeight(); }
        return new android.graphics.Rect(loc[0] + L, loc[1] + T, loc[0] + R, loc[1] + B);
    }
    private void screenCopy(android.graphics.Rect r, int div, java.util.function.Consumer<Bitmap> got) {
        try {
            Bitmap bm = Bitmap.createBitmap(Math.max(1, r.width() / div), Math.max(1, r.height() / div), Bitmap.Config.ARGB_8888);
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                android.view.PixelCopy.request(getWindow(), r, bm, res -> got.accept(res == android.view.PixelCopy.SUCCESS ? bm : null), ui);
            } else {
                Canvas c = new Canvas(bm); c.scale(1f / div, 1f / div); int[] loc = new int[2]; web.getLocationInWindow(loc);
                c.translate(-(r.left - loc[0]) - web.getScrollX(), -(r.top - loc[1]) - web.getScrollY()); web.draw(c); got.accept(bm);
            }
        } catch (Throwable e) { got.accept(null); }
    }
    private float cropL, cropT, cropR, cropB;
    /** hide GovMap's controls, find the clear part of the map, take the picture, show them again */
    private static final String CROP_JS = "(function(){try{var best=null,ba=0;"
        + "var els=document.querySelectorAll('canvas,.esri-view-surface,.esri-view-root,.ol-viewport,.leaflet-container,#map,#mapDiv,.map');"
        + "for(var i=0;i<els.length;i++){var r=els[i].getBoundingClientRect();var a=r.width*r.height;if(r.width>innerWidth*0.45&&r.height>innerHeight*0.35&&a>ba){ba=a;best=els[i];}}"
        + "if(!best)return JSON.stringify({ok:0});var m=best.getBoundingClientRect(),t=Math.max(0,m.top),b=Math.min(innerHeight,m.bottom),l=Math.max(0,m.left),rr=Math.min(innerWidth,m.right),H=b-t;"
        + "var all=document.body.querySelectorAll('*');for(var j=0;j<all.length;j++){var e=all[j];if(e.contains(best)||e.tagName==='CANVAS')continue;"
        + "var cs=getComputedStyle(e);if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0)continue;"
        + "var q=e.getBoundingClientRect();if(q.width<(rr-l)*0.5||q.height<4||q.height>H*0.3||q.bottom<=t||q.top>=b)continue;"
        + "var txt=(e.innerText||'').trim();if(!txt&&!e.querySelector('button,input,svg'))continue;"
        + "var c=(q.top+q.bottom)/2;if(c<t+H*0.35)t=Math.max(t,q.bottom);else if(c>b-H*0.35)b=Math.min(b,q.top);}"
        + "return JSON.stringify({ok:1,l:l,t:t,r:rr,b:b,w:innerWidth});}catch(e){return JSON.stringify({ok:0});}})()";
    private void hiddenShot(int div, java.util.function.Consumer<Bitmap> got) {
        web.evaluateJavascript(HIDE_JS, v -> ui.postDelayed(() -> web.evaluateJavascript(CROP_JS, cj -> {
            cropL = mapL; cropT = mapT; cropR = mapR; cropB = mapB;
            try { String j = cj; if (j != null && j.startsWith("\"")) j = new JSONObject("{\"v\":" + j + "}").getString("v");
                JSONObject o = new JSONObject(j);
                if (o.optInt("ok") == 1) { float k = web.getWidth() / (float) o.getDouble("w");
                    cropL = Math.max(mapL, (float) o.getDouble("l") * k); cropT = Math.max(mapT, (float) o.getDouble("t") * k);
                    cropR = Math.min(mapR, (float) o.getDouble("r") * k); cropB = Math.min(mapB, (float) o.getDouble("b") * k); }
            } catch (Exception ignored) { }
            banner.setVisibility(View.INVISIBLE);
            ui.postDelayed(() -> screenCopy(mapRectInWindow(), div, b -> {
                banner.setVisibility(View.VISIBLE);
                web.evaluateJavascript(SHOW_JS, null);
                got.accept(b);
            }), 120);
        }), 450));
    }
    private float ccxA, ccyA;            // map centre inside the printed picture (pixels)
    private double fCx, fCy, fRes;       // final: ITM of the picture centre, metres per pixel
    private boolean fCal;
    private int[] pxA;
    private static int[] pixels(Bitmap b) { int[] p = new int[b.getWidth() * b.getHeight()]; b.getPixels(p, 0, b.getWidth(), 0, 0, b.getWidth(), b.getHeight()); return p; }
    private double resTable(double z) { return scaleOf(z) * 0.0254 / 96.0 / pk; }

    private void printShotA() {
        web.evaluateJavascript(IW_JS, iw -> {
            double cssW = 0; try { cssW = Double.parseDouble(iw); } catch (Exception ignored) { }
            pk = cssW > 0 ? web.getWidth() / cssW : getResources().getDisplayMetrics().density;
            hiddenShot(1, b -> {
                if (b == null) { printFail("تعذّر أخذ صورة الخارطة"); return; }
                shotA = b; aCrop = new float[]{cropL, cropT, cropR, cropB}; pxA = pixels(b);
                ccxA = (mapL + mapR) / 2f - cropL; ccyA = (mapT + mapB) / 2f - cropT;
                // step 1: a wider view around the last known place, to find roughly where (and how big) the picture is
                final double z0 = Math.max(0, Math.floor(pz) - 1);
                say("…جاري تحديد موقع الصورة (1 من 3)");
                pz = z0;
                printLoad(urlAt(pcx, pcy), () -> refShot(r0 -> {
                    if (r0 == null) { printFail("تعذّر أخذ صورة المعايرة"); return; }
                    final int[] p0 = pixels(r0); r0.recycle();
                    final double res0 = resTable(z0);
                    new Thread(() -> {
                        double[] c = null; try { c = Reg.coarse(pxA, p0, shotA.getWidth(), shotA.getHeight()); } catch (Throwable ignored) { }
                        final double[] fc = c;
                        ui.post(() -> {
                            if (fc == null || fc[3] < 0.15) { printFail("لم أستطع تحديد موقع الصورة. اضغط «تمركز» ثم اطبع مرة أخرى."); return; }
                            double qx = fc[0] * ccxA + fc[1], qy = fc[0] * ccyA + fc[2];
                            final double w0x = pcx + (qx - ccxA) * res0, w0y = pcy - (qy - ccyA) * res0, resAe = res0 * fc[0];
                            // step 2: the GovMap zoom level nearest to the picture, centred on it, twice (to measure the scale exactly)
                            double bz = 0, bd = 1e9; for (int L = 0; L <= 13; L++) { double d = Math.abs(Math.log(resTable(L) / resAe)); if (d < bd) { bd = d; bz = L; } }
                            final double zf = bz;
                            pz = zf; pcx = w0x; pcy = w0y;
                            pD = Math.max(1, Math.round(shotA.getWidth() * resTable(zf) * 0.3));
                            say("…جاري معايرة المقياس (2 من 3)");
                            printLoad(urlAt(w0x, w0y), () -> refShot(r1 -> {
                                if (r1 == null) { printFail("تعذّر أخذ صورة المعايرة"); return; }
                                final int[] p1 = pixels(r1); r1.recycle();
                                say("…جاري معايرة المقياس (3 من 3)");
                                printLoad(urlAt(w0x + pD, w0y), () -> refShot(r2 -> {
                                    if (r2 == null) { printFail("تعذّر أخذ صورة المعايرة"); return; }
                                    final int[] p2 = pixels(r2); r2.recycle();
                                    say("…جاري حساب الإحداثيات");
                                    final double sEst = resAe / resTable(zf);
                                    new Thread(() -> {
                                        int W = shotA.getWidth(), H = shotA.getHeight();
                                        double sh = -1; double[] f = null;
                                        try { sh = Reg.shiftX(p1, p2, W, H); f = Reg.fine(pxA, p1, W, H, sEst); } catch (Throwable ignored) { }
                                        final double fsh = sh; final double[] ff = f;
                                        ui.post(() -> {
                                            double resR = fsh > 0 ? pD / fsh : resTable(zf);
                                            boolean ok = fsh > 0 && ff != null && ff[3] > 0.4 && Math.abs(resR / resTable(zf) - 1) < 0.5;
                                            double s1 = ff != null ? ff[0] : sEst, tx = ff != null ? ff[1] : 0, ty = ff != null ? ff[2] : 0;
                                            double qx1 = s1 * ccxA + tx, qy1 = s1 * ccyA + ty;
                                            fCx = w0x + (qx1 - ccxA) * resR; fCy = w0y - (qy1 - ccyA) * resR; fRes = s1 * resR; fCal = ok;
                                            markX = ccxA; markY = ccyA;
                                            readInfo(resR);
                                        });
                                    }).start();
                                }));
                            }));
                        });
                    }).start();
                }));
            });
        });
    }
    /** a reference picture with the same window as the printed one */
    private void refShot(java.util.function.Consumer<Bitmap> got) {
        web.evaluateJavascript(HIDE_JS, v -> ui.postDelayed(() -> {
            cropL = aCrop[0]; cropT = aCrop[1]; cropR = aCrop[2]; cropB = aCrop[3];
            banner.setVisibility(View.INVISIBLE);
            ui.postDelayed(() -> screenCopy(mapRectInWindow(), 1, b -> {
                banner.setVisibility(View.VISIBLE);
                web.evaluateJavascript(SHOW_JS, null);
                got.accept(b);
            }), 120);
        }, 450));
    }
    /** taps the GOV point so GovMap opens its own information (גוש / חלקה …), and reads its text */
    private static final String TEXT_JS = "(function(){try{return (document.body.innerText||'').slice(0,6000);}catch(e){return '';}})()";
    private void readInfo(final double res) {
        say("…جاري قراءة معلومات GovMap");
        double[] g = cz(startUrl); double gx = g != null ? g[0] : pcx, gy = g != null ? g[1] : pcy;
        float px = (mapL + mapR) / 2f + (float) ((gx - (pcx + pD)) / res), py = (mapT + mapB) / 2f - (float) ((gy - pcy) / res);
        web.evaluateJavascript(TEXT_JS, before -> {
            boolean in = px > mapL + dp(10) && px < mapR - dp(10) && py > mapT + dp(10) && py < mapB - dp(10);
            if (in) { pinX = px; pinY = py; tapPoint(); }
            ui.postDelayed(() -> web.evaluateJavascript(TEXT_JS, after -> {
                String t = ""; try { t = new JSONObject("{\"v\":" + after + "}").getString("v"); } catch (Exception ignored) { }
                String t0 = ""; try { t0 = new JSONObject("{\"v\":" + before + "}").getString("v"); } catch (Exception ignored) { }
                infoText = t.equals(t0) ? "" : t;
                finishPrint();
            }), in ? 3500 : 10);
        });
    }
    /** how many pixels the picture moved to the left between a and b (moving the centre east) */
    private static double shift(Bitmap a, Bitmap b) {
        final int f = 4; int w = a.getWidth() / f, h = a.getHeight() / f;
        float[] ga = gray(a, f, w, h), gb = gray(b, f, w, h);
        int y0 = h / 5, y1 = h * 4 / 5, best = -1, bdy = 0; double bs = 1e18, second = 1e18;
        for (int dy = -2; dy <= 2; dy++) for (int s = Math.max(3, w / 25); s < w * 0.8; s++) {
            double sum = 0; int n = 0;
            for (int y = y0; y < y1; y += 2) { int yb = y + dy; if (yb < 0 || yb >= h) continue;
                for (int x = s; x < w; x += 2) { sum += Math.abs(ga[y * w + x] - gb[yb * w + x - s]); n++; } }
            if (n < 200) continue; double m = sum / n;
            if (m < bs) { if (best < 0 || Math.abs(s - best) > 3) second = bs; bs = m; best = s; bdy = dy; }
            else if (Math.abs(s - best) > 3 && m < second) second = m;
        }
        if (best < 0 || bs > 0.7 * second) return -1;            // no clear match
        // refine at full size around the coarse answer
        int W = a.getWidth(), H = a.getHeight(); float[] fa = gray(a, 1, W, H), fb = gray(b, 1, W, H);
        int fy = bdy * f; double[] sc = new double[2 * f + 3]; int c0 = best * f - f - 1;
        for (int i = 0; i < sc.length; i++) { int s = c0 + i; double sum = 0; int n = 0;
            for (int y = H / 5; y < H * 4 / 5; y += 3) { int yb = y + fy; if (yb < 0 || yb >= H) continue;
                for (int x = Math.max(s, 0); x < W; x += 3) { if (x - s >= W) continue; sum += Math.abs(fa[y * W + x] - fb[yb * W + x - s]); n++; } }
            sc[i] = n > 0 ? sum / n : 1e18; }
        int bi = 1; for (int i = 1; i < sc.length - 1; i++) if (sc[i] < sc[bi]) bi = i;
        double den = sc[bi - 1] - 2 * sc[bi] + sc[bi + 1], off = den > 1e-9 ? 0.5 * (sc[bi - 1] - sc[bi + 1]) / den : 0;
        return c0 + bi + Math.max(-0.5, Math.min(0.5, off));
    }
    private static float[] gray(Bitmap bm, int f, int w, int h) {
        Bitmap s = f == 1 ? bm : Bitmap.createScaledBitmap(bm, w, h, true);
        int[] px = new int[w * h]; s.getPixels(px, 0, w, 0, 0, w, h); if (s != bm) s.recycle();
        float[] g = new float[w * h]; for (int i = 0; i < px.length; i++) { int p = px[i]; g[i] = ((p >> 16) & 255) * .3f + ((p >> 8) & 255) * .59f + (p & 255) * .11f; }
        return g;
    }
    private void finishPrint() {
        try {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            shotA.compress(Bitmap.CompressFormat.JPEG, 90, out);
            String b64 = android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP);
            JSONObject o = new JSONObject();
            o.put("img", "data:image/jpeg;base64," + b64); o.put("w", shotA.getWidth()); o.put("h", shotA.getHeight());
            o.put("cx", fCx); o.put("cy", fCy); o.put("mx", markX); o.put("my", markY); o.put("res", fRes); o.put("cal", fCal); o.put("z", pz); o.put("info", infoText);
            printData = o.toString();
            shotA.recycle(); shotA = null;
            printing = false; say(null);
            finish();
        } catch (Throwable e) { printFail("تعذّر تجهيز الصورة"); }
    }
    private void printFail(String m) {
        printing = false; printStep = null; say(null); toastMsg(m);
        if (shotA != null) { shotA.recycle(); shotA = null; }
        web.loadUrl(urlAt(pcx, pcy));
    }

    private void toastMsg(String t) { android.widget.Toast.makeText(this, t, android.widget.Toast.LENGTH_LONG).show(); }

    private void loadPoint() {
        session++;
        locating = false;
        pinX = pinY = -1;
        if (cross != null) cross.setVisibility(View.GONE);
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
        if (startUrl.endsWith("#almassah-print")) { autoPrint = true; startUrl = startUrl.substring(0, startUrl.length() - 15); }

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

        cross = new View(this) {
            final Paint w = new Paint(Paint.ANTI_ALIAS_FLAG), r = new Paint(Paint.ANTI_ALIAS_FLAG);
            { w.setColor(Color.WHITE); w.setStrokeWidth(dp(6)); w.setStrokeCap(Paint.Cap.SQUARE); r.setColor(Color.parseColor("#e11d2a")); r.setStrokeWidth(dp(3)); }
            @Override protected void onDraw(Canvas c) {
                float m = getWidth() / 2f, a = dp(22), g = dp(5);
                for (Paint p : new Paint[]{w, r}) { c.drawLine(m - a, m, m - g, m, p); c.drawLine(m + g, m, m + a, m, p); c.drawLine(m, m - a, m, m - g, p); c.drawLine(m, m + g, m, m + a, p); }
                c.drawCircle(m, m, dp(2.5f), r);
            }
        };
        cross.setVisibility(View.GONE);
        root.addView(cross, new FrameLayout.LayoutParams(dp(50), dp(50)));

        LinearLayout tools = new LinearLayout(this);
        tools.setOrientation(LinearLayout.HORIZONTAL);
        tools.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        tools.setPadding(dp(6), dp(6), dp(6), dp(6));
        tools.setBackgroundColor(Color.parseColor("#f8f2e2"));
        View[] pills = {
            greenPill("ℹ معلومات", v -> { if (printing) return; if (mapR > mapL) { pinX = cx(); pinY = cy(); if (cross.getVisibility() == View.VISIBLE) tapPoint(); else loadPoint(); } }),
            greenPill("🎯 تمركز", v -> { if (!printing) loadPoint(); }),
            greenPill("🖨 طباعة", v -> startPrint()),
            greenPill("🌐 المتصفح", v -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(web.getUrl() != null ? web.getUrl() : startUrl))); } catch (Exception ignored) { } })
        };
        for (View pv : pills) {
            TextView tv = (TextView) pv; tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13); tv.setPadding(dp(6), dp(8), dp(6), dp(8)); tv.setGravity(Gravity.CENTER); tv.setSingleLine(true); tv.setElevation(dp(2));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1f); lp.setMarginStart(dp(3)); lp.setMarginEnd(dp(3));
            tools.addView(pv, lp);
        }
        page.addView(tools, new LinearLayout.LayoutParams(-1, -2));
        banner = new TextView(this);
        banner.setTextColor(Color.parseColor("#fff6d6"));
        banner.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        banner.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        banner.setGravity(Gravity.CENTER);
        banner.setPadding(dp(16), dp(12), dp(16), dp(12));
        GradientDrawable bb = new GradientDrawable(); bb.setColor(Color.parseColor("#e60c3b26")); bb.setCornerRadius(dp(16)); bb.setStroke(dp(2), GOLD);
        banner.setBackground(bb); banner.setVisibility(View.GONE);
        FrameLayout.LayoutParams bp = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        root.addView(banner, bp);
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

        web.setOnTouchListener((v, e) -> {
            if (printing && !autoTapping) return true;
            if (autoTapping || cross == null) return false;
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { downX = e.getX(); downY = e.getY(); }
            else if (e.getActionMasked() == MotionEvent.ACTION_POINTER_DOWN) cross.setVisibility(View.GONE);
            else if (e.getActionMasked() == MotionEvent.ACTION_MOVE && Math.hypot(e.getX() - downX, e.getY() - downY) > dp(10)) cross.setVisibility(View.GONE);
            return false;
        });
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
        else if (autoPrint) ui.postDelayed(this::startPrint, 300);
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
