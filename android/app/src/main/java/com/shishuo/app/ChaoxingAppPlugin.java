package com.shishuo.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 打开手机版学习通 App。
 *
 * 优先把原链接交给学习通 App（ACTION_VIEW + 指定包名），
 * 不支持时退回 App 首页；都没装/没处理则返回 opened=false，由网页回退浏览器。
 */
@CapacitorPlugin(name = "ChaoxingApp")
public class ChaoxingAppPlugin extends Plugin {

    private static final String PACKAGE_NAME = "com.chaoxing.mobile";

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        PackageManager pm = getContext().getPackageManager();

        if (url != null && !url.isEmpty()) {
            Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            view.setPackage(PACKAGE_NAME);
            if (view.resolveActivity(pm) != null) {
                start(view);
                resolveOpened(call, true);
                return;
            }
        }

        Intent launch = pm.getLaunchIntentForPackage(PACKAGE_NAME);
        if (launch != null) {
            start(launch);
            resolveOpened(call, true);
            return;
        }

        for (String scheme : new String[] { "chaoxing://", "mobilelearn://" }) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(scheme));
                if (intent.resolveActivity(pm) != null) {
                    start(intent);
                    resolveOpened(call, true);
                    return;
                }
            } catch (Exception ignored) {
                // 继续尝试下一个 scheme。
            }
        }

        resolveOpened(call, false);
    }

    private void start(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private void resolveOpened(PluginCall call, boolean opened) {
        JSObject ret = new JSObject();
        ret.put("opened", opened);
        call.resolve(ret);
    }
}
