package com.shishuo.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

/**
 * 沉浸式壳层：
 * - 页面铺到状态栏/手势条后面，安全区以 CSS 变量注入给网页；
 * - 键盘弹出时只缩小 WebView，避免输入框被挡；
 * - 返回键先交给网页处理（关弹窗 / 回首页），网页说没处理才退出。
 */
public class MainActivity extends BridgeActivity {

    private int safeTop = 0;
    private int safeRight = 0;
    private int safeBottom = 0;
    private int safeLeft = 0;
    private int imeBottom = 0;
    /**
     * 新版网页带 viewport-fit=cover，自己消费安全区；旧版线上网页没有，
     * 需要回退成原生 padding，否则内容会钻到状态栏/手势条下面。
     */
    private boolean edgeToEdgeWeb = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(PhotoAccessPlugin.class);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }

        View decor = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            safeTop = bars.top;
            safeRight = bars.right;
            safeBottom = bars.bottom;
            safeLeft = bars.left;
            imeBottom = ime.bottom;
            applyLayout();
            return windowInsets;
        });

        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    super.onPageCommitVisible(view, url);
                    detectPageMode(view);
                }
            });
        }
        ViewCompat.requestApplyInsets(decor);
    }

    private void applyLayout() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        if (edgeToEdgeWeb) {
            // 键盘只压缩 WebView，不遮住输入框；系统栏区域由网页自己绘制。
            webView.setPadding(0, 0, 0, imeBottom);
        } else {
            // 旧版网页：退回原生 padding，系统栏区域显示壳层底色。
            webView.setPadding(safeLeft, safeTop, safeRight, safeBottom + imeBottom);
        }
        injectSafeArea();
    }

    private void detectPageMode(WebView webView) {
        webView.evaluateJavascript(
            "(function(){try{const m=document.querySelector('meta[name=\"viewport\"]');" +
                "return !!(m&&m.content&&m.content.indexOf('viewport-fit=cover')>=0)}catch(e){return false}})()",
            value -> {
                edgeToEdgeWeb = "true".equals(value);
                applyLayout();
            }
        );
    }

    private void injectSafeArea() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        float density = getResources().getDisplayMetrics().density;
        int top = Math.round(safeTop / density);
        int right = Math.round(safeRight / density);
        int bottom = Math.round(safeBottom / density);
        int left = Math.round(safeLeft / density);
        String script = String.format(
            Locale.US,
            "try{document.documentElement.style.setProperty('--safe-area-inset-top','%dpx');" +
                "document.documentElement.style.setProperty('--safe-area-inset-right','%dpx');" +
                "document.documentElement.style.setProperty('--safe-area-inset-bottom','%dpx');" +
                "document.documentElement.style.setProperty('--safe-area-inset-left','%dpx');}catch(e){}",
            top,
            right,
            bottom,
            left
        );
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void finishFromBack() {
        super.onBackPressed();
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            finishFromBack();
            return;
        }
        // 先让网页关弹窗/回首页；网页说没处理，再走历史或退出。
        webView.evaluateJavascript(
            "(function(){try{return window.__shishuoNativeBack?window.__shishuoNativeBack():false}catch(e){return false}})()",
            value -> {
                if ("true".equals(value)) return;
                runOnUiThread(() -> {
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        finishFromBack();
                    }
                });
            }
        );
    }
}
