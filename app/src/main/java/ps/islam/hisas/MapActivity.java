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
import android.view.Gravity;
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

/** Shows GovMap inside the app, in its own WebView (no AndroidBridge exposed to the site). */
public class MapActivity extends Activity {
    private WebView web;
    private String startUrl;

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
        t.setText("إحداثيات GovMap");
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
        tools.addView(greenPill("↺ النقطة", v -> web.loadUrl(startUrl)));
        tools.addView(greenPill("فتح في المتصفح", v -> {
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
        else web.loadUrl(startUrl);
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
