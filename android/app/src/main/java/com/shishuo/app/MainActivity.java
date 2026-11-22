package com.shishuo.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.WebViewListener;
import java.util.Locale;
import org.json.JSONObject;

/**
 * 沉浸式壳层：
 * - 页面铺到状态栏/手势条后面，安全区以 CSS 变量注入给网页；
 * - 键盘弹出时只缩小 WebView，避免输入框被挡；
 * - 返回键先交给网页处理（关弹窗 / 回首页），网页说没处理才退出；
 * - 接管系统通知点击、桌面小组件点击、App Shortcuts 与系统“分享到师说”(ACTION_SEND)；
 * - 断网兜底页自动注入动态 serverUrl 与离线课表缓存。
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
    private String pendingThreadId;
    private String pendingNotificationId;
    private JSONObject pendingNativeAction;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(PhotoAccessPlugin.class);
        registerPlugin(ChaoxingAppPlugin.class);
        registerPlugin(ScheduleBridgePlugin.class);
        registerPlugin(AppSystemPlugin.class);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);
        NotificationPollScheduler.ensureScheduled(getApplicationContext());
        handleIncomingIntent(getIntent());

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
                    injectOfflineContextIfNeeded(view, url);
                    view.postDelayed(MainActivity.this::dispatchPendingAll, 1000);
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

    private void injectOfflineContextIfNeeded(WebView webView, String url) {
        if (url == null) return;
        // 仅在加载本地断网兜底页时注入 serverUrl 与离线课表，避免污染线上远程页。
        boolean isLocalShell =
            url.startsWith("http://localhost") ||
            url.startsWith("https://localhost") ||
            url.startsWith("file://") ||
            url.startsWith("capacitor://");
        if (!isLocalShell) return;
        String serverUrl = ShellConfig.getServerUrl(getApplicationContext());
        SharedPreferences prefs = getSharedPreferences(
            ScheduleWidgetProvider.PREFS,
            MODE_PRIVATE
        );
        String scheduleJson = prefs.getString(ScheduleWidgetProvider.PAYLOAD_KEY, "");
        String script =
            "try{window.__shishuoOffline={serverUrl:" +
            JSONObject.quote(serverUrl) +
            ",scheduleJson:" +
            JSONObject.quote(scheduleJson) +
            "};window.dispatchEvent(new CustomEvent('shishuo:offline-ready'));}catch(e){}";
        webView.post(() -> webView.evaluateJavascript(script, null));
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
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.postDelayed(this::dispatchPendingAll, 350);
        }
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;

        // 1. 后台系统通知点击
        String threadId = intent.getStringExtra("shishuo_thread_id");
        String notificationId = intent.getStringExtra("shishuo_notification_id");
        if (threadId != null && !threadId.isEmpty()) pendingThreadId = threadId;
        if (notificationId != null && !notificationId.isEmpty()) {
            pendingNotificationId = notificationId;
        }

        // 2. 桌面小组件 / App Shortcuts
        String openView = intent.getStringExtra("shishuo_open_view");
        String shortcut = intent.getStringExtra("shishuo_shortcut");
        if (shortcut != null && !shortcut.isEmpty()) {
            try {
                JSONObject action = new JSONObject();
                action.put("type", "shortcut");
                action.put("target", shortcut);
                pendingNativeAction = action;
            } catch (Exception ignored) {
                // ignore
            }
            return;
        }
        if (openView != null && !openView.isEmpty()) {
            try {
                JSONObject action = new JSONObject();
                action.put("type", "navigate");
                action.put("view", openView);
                pendingNativeAction = action;
            } catch (Exception ignored) {
                // ignore
            }
            return;
        }

        // 3. 系统“分享到师说”(ACTION_SEND)
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String mime = intent.getType() == null ? "" : intent.getType();
            if (mime.startsWith("text/")) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null && !sharedText.trim().isEmpty()) {
                    try {
                        JSONObject action = new JSONObject();
                        action.put("type", "share");
                        action.put("text", sharedText.trim());
                        pendingNativeAction = action;
                    } catch (Exception ignored) {
                        // ignore
                    }
                }
            } else if (mime.startsWith("image/")) {
                Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                    : intent.getParcelableExtra(Intent.EXTRA_STREAM);
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (uri != null) {
                    new Thread(() -> {
                        try {
                            JSObject file = PhotoAccessPlugin.readImageStatic(
                                getApplicationContext(),
                                uri,
                                null
                            );
                            JSONObject action = new JSONObject();
                            action.put("type", "share");
                            if (sharedText != null && !sharedText.trim().isEmpty()) {
                                action.put("text", sharedText.trim());
                            }
                            action.put("image", file);
                            pendingNativeAction = action;
                            runOnUiThread(this::dispatchPendingNativeAction);
                        } catch (Exception ignored) {
                            // 读取分享图片失败时静默忽略，不崩溃。
                        }
                    })
                        .start();
                }
            }
        }
    }

    private void dispatchPendingAll() {
        dispatchPendingOpen();
        dispatchPendingNativeAction();
    }

    /** 把系统通知点击带到网页；同时保留全局变量，供 React 尚未挂载时补发。 */
    private void dispatchPendingOpen() {
        if (pendingThreadId == null && pendingNotificationId == null) return;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        String threadId = pendingThreadId == null ? "" : pendingThreadId;
        String notificationId = pendingNotificationId == null ? "" : pendingNotificationId;
        pendingThreadId = null;
        pendingNotificationId = null;
        String script =
            "try{" +
            "window.__shishuoPendingOpen={threadId:" +
            JSONObject.quote(threadId) +
            ",notificationId:" +
            JSONObject.quote(notificationId) +
            "};" +
            "window.dispatchEvent(new CustomEvent('shishuo:open-thread',{detail:window.__shishuoPendingOpen}));" +
            "}catch(e){}";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    /** 把小组件 / 桌面快捷方式 / 系统分享事件派发给网页。 */
    private void dispatchPendingNativeAction() {
        if (pendingNativeAction == null) return;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        String payload = pendingNativeAction.toString();
        pendingNativeAction = null;
        String script =
            "try{" +
            "window.__shishuoPendingAction=JSON.parse(" +
            JSONObject.quote(payload) +
            ");" +
            "window.dispatchEvent(new CustomEvent('shishuo:native-action',{detail:window.__shishuoPendingAction}));" +
            "}catch(e){}";
        webView.post(() -> webView.evaluateJavascript(script, null));
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
