package com.panel.webview;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.AlphaAnimation;
import android.view.animation.Animation;
import android.view.animation.ScaleAnimation;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final int REQ_FILE = 11;
    private static final int REQ_WEBPERM = 12;
    private static final int REQ_GEO = 13;
    private static final int REQ_BOOT = 14;

    private FrameLayout root;
    private WebView web;
    private SwipeRefreshLayout swipe;
    private ProgressBar topBar;
    private View splashView;

    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingWebPerm;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long startTime;
    private long lastBack;
    private boolean pageReady;
    private boolean hideScheduled;
    private boolean splashGone;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startTime = System.currentTimeMillis();

        if (AppConfig.ORIENTATION == 1) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else if (AppConfig.ORIENTATION == 2) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        }

        Window window = getWindow();
        if (AppConfig.FULLSCREEN) {
            window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        }
        if (AppConfig.KEEP_ON) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
        if (Build.VERSION.SDK_INT >= 21) {
            window.setStatusBarColor(AppConfig.STATUS_BAR);
            window.setNavigationBarColor(AppConfig.NAV_BAR);
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(AppConfig.SPLASH_BG);

        web = new WebView(this);
        swipe = new SwipeRefreshLayout(this);
        swipe.addView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        swipe.setEnabled(AppConfig.PULL_REFRESH);
        swipe.setOnRefreshListener(new SwipeRefreshLayout.OnRefreshListener() {
            @Override
            public void onRefresh() {
                web.reload();
            }
        });
        root.addView(swipe, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        topBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        topBar.setMax(100);
        topBar.setVisibility(View.GONE);
        topBar.getProgressDrawable().setColorFilter(AppConfig.PROGRESS_COLOR, PorterDuff.Mode.SRC_IN);
        root.addView(topBar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        if (AppConfig.SPLASH) {
            splashView = buildSplash();
            root.addView(splashView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            // Pengaman: splash tetap ditutup walau halaman tidak pernah selesai dimuat
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    hideSplash();
                }
            }, Math.max(AppConfig.SPLASH_MS, 12000L));
        }

        setContentView(root);
        setupWebView();
        requestBootPermissions();
        web.loadUrl(AppConfig.START_URL);
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private boolean has(String perm) {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    /* ---------------- WebView ---------------- */

    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(AppConfig.JS);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(AppConfig.ZOOM);
        s.setBuiltInZoomControls(AppConfig.ZOOM);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setGeolocationEnabled(AppConfig.PERM_LOCATION);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(AppConfig.MIXED ? WebSettings.MIXED_CONTENT_ALWAYS_ALLOW : WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
        if (AppConfig.CACHE == 1) {
            s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        } else if (AppConfig.CACHE == 2) {
            s.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        } else {
            s.setCacheMode(WebSettings.LOAD_DEFAULT);
        }
        if (AppConfig.USER_AGENT.length() > 0) {
            s.setUserAgentString(AppConfig.USER_AGENT);
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) {
            cm.setAcceptThirdPartyCookies(web, true);
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (AppConfig.TOP_PROGRESS) {
                    topBar.setProgress(5);
                    topBar.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                swipe.setRefreshing(false);
                topBar.setVisibility(View.GONE);
                pageReady = true;
                scheduleHideSplash();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            showError();
                        }
                    });
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                topBar.setProgress(newProgress);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!AppConfig.FILE_UPLOAD) {
                    callback.onReceiveValue(null);
                    return true;
                }
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        handleWebPermission(request);
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!AppConfig.PERM_LOCATION) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (has(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    callback.invoke(origin, true, false);
                    return;
                }
                geoCallback = callback;
                geoOrigin = origin;
                requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_GEO);
            }
        });

        web.setDownloadListener(new android.webkit.DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                startDownload(url, userAgent, contentDisposition, mimeType);
            }
        });
    }

    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if (scheme.equals("panel")) {
            web.loadUrl(AppConfig.START_URL);
            return true;
        }
        if (scheme.equals("http") || scheme.equals("https")) {
            if (AppConfig.EXTERNAL_BROWSER && !isAllowedHost(uri.getHost())) {
                openExternal(uri);
                return true;
            }
            return false;
        }
        if (scheme.equals("file") || scheme.equals("about") || scheme.equals("data")
                || scheme.equals("blob") || scheme.equals("javascript")) {
            return false;
        }
        openExternal(uri);
        return true;
    }

    private boolean isAllowedHost(String host) {
        if (host == null) {
            return false;
        }
        String start = Uri.parse(AppConfig.START_URL).getHost();
        if (start != null && sameHost(host, start)) {
            return true;
        }
        for (String h : AppConfig.ALLOWED_HOSTS) {
            if (sameHost(host, h)) {
                return true;
            }
        }
        return false;
    }

    private boolean sameHost(String host, String allowed) {
        return host.equalsIgnoreCase(allowed) || host.toLowerCase().endsWith("." + allowed.toLowerCase());
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Tidak ada aplikasi untuk membuka tautan ini", Toast.LENGTH_SHORT).show();
        }
    }

    private void startDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        if (!AppConfig.DOWNLOADS) {
            openExternal(Uri.parse(url));
            return;
        }
        try {
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            if (mimeType != null) {
                req.setMimeType(mimeType);
            }
            if (userAgent != null) {
                req.addRequestHeader("User-Agent", userAgent);
            }
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) {
                req.addRequestHeader("Cookie", cookie);
            }
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            req.setTitle(name);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            dm.enqueue(req);
            Toast.makeText(this, "Mengunduh " + name, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            openExternal(Uri.parse(url));
        }
    }

    private void showError() {
        String bg = String.format("#%06X", 0xFFFFFF & AppConfig.SPLASH_BG);
        String fg = String.format("#%06X", 0xFFFFFF & AppConfig.SPLASH_FG);
        String page = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;"
                + "justify-content:center;text-align:center;font-family:sans-serif;box-sizing:border-box;padding:24px;"
                + "background:" + bg + ";color:" + fg + "'>"
                + "<h2 style='margin:0 0 8px'>" + AppConfig.ERR_TITLE + "</h2>"
                + "<p style='margin:0 0 24px;opacity:.75'>" + AppConfig.ERR_MESSAGE + "</p>"
                + "<a href='panel://retry' style='padding:12px 28px;border-radius:10px;font-weight:bold;"
                + "text-decoration:none;background:" + fg + ";color:" + bg + "'>" + AppConfig.ERR_BUTTON + "</a>"
                + "</body></html>";
        web.loadDataWithBaseURL(null, page, "text/html", "UTF-8", null);
    }

    /* ---------------- Izin ---------------- */

    private void requestBootPermissions() {
        List<String> need = new ArrayList<String>();
        if (AppConfig.PERM_NOTIF && Build.VERSION.SDK_INT >= 33 && !has("android.permission.POST_NOTIFICATIONS")) {
            need.add("android.permission.POST_NOTIFICATIONS");
        }
        if (AppConfig.PERM_STORAGE && Build.VERSION.SDK_INT < 29 && !has(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
            need.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        }
        if (!need.isEmpty() && Build.VERSION.SDK_INT >= 23) {
            requestPermissions(need.toArray(new String[0]), REQ_BOOT);
        }
    }

    private void handleWebPermission(PermissionRequest request) {
        List<String> need = new ArrayList<String>();
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
                if (!AppConfig.PERM_CAMERA) {
                    request.deny();
                    return;
                }
                if (!has(Manifest.permission.CAMERA)) {
                    need.add(Manifest.permission.CAMERA);
                }
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                if (!AppConfig.PERM_MIC) {
                    request.deny();
                    return;
                }
                if (!has(Manifest.permission.RECORD_AUDIO)) {
                    need.add(Manifest.permission.RECORD_AUDIO);
                }
            } else {
                request.deny();
                return;
            }
        }
        if (need.isEmpty()) {
            request.grant(request.getResources());
            return;
        }
        pendingWebPerm = request;
        requestPermissions(need.toArray(new String[0]), REQ_WEBPERM);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean ok = grantResults.length > 0;
        for (int r : grantResults) {
            if (r != PackageManager.PERMISSION_GRANTED) {
                ok = false;
            }
        }
        if (requestCode == REQ_WEBPERM && pendingWebPerm != null) {
            if (ok) {
                pendingWebPerm.grant(pendingWebPerm.getResources());
            } else {
                pendingWebPerm.deny();
            }
            pendingWebPerm = null;
        } else if (requestCode == REQ_GEO && geoCallback != null) {
            geoCallback.invoke(geoOrigin, ok, false);
            geoCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /* ---------------- Splash ---------------- */

    private TextView label(String text, int sp, boolean bold, int color, float alpha) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        t.setAlpha(alpha);
        if (bold) {
            t.setTypeface(Typeface.DEFAULT_BOLD);
        }
        return t;
    }

    private View buildSplash() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(AppConfig.SPLASH_BG);
        box.setClickable(true);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        logo.setAdjustViewBounds(true);
        content.addView(logo, new LinearLayout.LayoutParams(dp(112), dp(112)));

        LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        np.topMargin = dp(18);
        content.addView(label(AppConfig.APP_NAME, 22, true, AppConfig.SPLASH_FG, 1f), np);

        if (AppConfig.TAGLINE.length() > 0) {
            LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            tp.topMargin = dp(6);
            content.addView(label(AppConfig.TAGLINE, 14, false, AppConfig.SPLASH_FG, 0.75f), tp);
        }

        View loader = null;
        LinearLayout.LayoutParams lp = null;
        if (AppConfig.SPLASH_LOADER == 1) {
            ProgressBar pb = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
            pb.setIndeterminate(true);
            pb.getIndeterminateDrawable().setColorFilter(AppConfig.SPLASH_FG, PorterDuff.Mode.SRC_IN);
            loader = pb;
            lp = new LinearLayout.LayoutParams(dp(160), dp(4));
        } else if (AppConfig.SPLASH_LOADER == 2) {
            ProgressBar pb = new ProgressBar(this);
            pb.setIndeterminate(true);
            pb.getIndeterminateDrawable().setColorFilter(AppConfig.SPLASH_FG, PorterDuff.Mode.SRC_IN);
            loader = pb;
            lp = new LinearLayout.LayoutParams(dp(36), dp(36));
        } else if (AppConfig.SPLASH_LOADER == 3) {
            LinearLayout dots = new LinearLayout(this);
            dots.setOrientation(LinearLayout.HORIZONTAL);
            for (int i = 0; i < 3; i++) {
                View d = new View(this);
                GradientDrawable g = new GradientDrawable();
                g.setShape(GradientDrawable.OVAL);
                g.setColor(AppConfig.SPLASH_FG);
                d.setBackground(g);
                LinearLayout.LayoutParams dpm = new LinearLayout.LayoutParams(dp(9), dp(9));
                dpm.leftMargin = dp(5);
                dpm.rightMargin = dp(5);
                dots.addView(d, dpm);
                AlphaAnimation a = new AlphaAnimation(0.2f, 1f);
                a.setDuration(450);
                a.setRepeatCount(Animation.INFINITE);
                a.setRepeatMode(Animation.REVERSE);
                a.setStartOffset(i * 150L);
                d.startAnimation(a);
            }
            loader = dots;
            lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        if (loader != null) {
            lp.topMargin = dp(28);
            lp.gravity = Gravity.CENTER_HORIZONTAL;
            content.addView(loader, lp);
        }

        if (AppConfig.SHOW_VERSION) {
            LinearLayout.LayoutParams vp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            vp.topMargin = dp(20);
            content.addView(label("v" + AppConfig.VERSION_NAME, 12, false, AppConfig.SPLASH_FG, 0.5f), vp);
        }

        box.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        animateIn(content);
        return box;
    }

    private void animateIn(View v) {
        switch (AppConfig.SPLASH_ANIM) {
            case 1:
                v.setAlpha(0f);
                v.animate().alpha(1f).setDuration(700).start();
                break;
            case 2:
                v.setAlpha(0f);
                v.setScaleX(0.6f);
                v.setScaleY(0.6f);
                v.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(700).start();
                break;
            case 3:
                v.setAlpha(0f);
                v.setTranslationY(dp(48));
                v.animate().alpha(1f).translationY(0f).setDuration(700).start();
                break;
            case 4:
                ScaleAnimation sa = new ScaleAnimation(1f, 1.08f, 1f, 1.08f,
                        Animation.RELATIVE_TO_SELF, 0.5f, Animation.RELATIVE_TO_SELF, 0.5f);
                sa.setDuration(800);
                sa.setRepeatCount(Animation.INFINITE);
                sa.setRepeatMode(Animation.REVERSE);
                v.startAnimation(sa);
                break;
            default:
                break;
        }
    }

    private void scheduleHideSplash() {
        if (splashView == null || splashGone || hideScheduled || !pageReady) {
            return;
        }
        hideScheduled = true;
        long wait = AppConfig.SPLASH_MS - (System.currentTimeMillis() - startTime);
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                hideSplash();
            }
        }, Math.max(0L, wait));
    }

    private void hideSplash() {
        if (splashGone || splashView == null) {
            return;
        }
        splashGone = true;
        final View v = splashView;
        v.animate().alpha(0f).setDuration(350).withEndAction(new Runnable() {
            @Override
            public void run() {
                root.removeView(v);
            }
        }).start();
    }

    /* ---------------- Siklus hidup ---------------- */

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
            return;
        }
        if (AppConfig.EXIT_CONFIRM && System.currentTimeMillis() - lastBack > 2000) {
            lastBack = System.currentTimeMillis();
            Toast.makeText(this, "Tekan sekali lagi untuk keluar", Toast.LENGTH_SHORT).show();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }
}
