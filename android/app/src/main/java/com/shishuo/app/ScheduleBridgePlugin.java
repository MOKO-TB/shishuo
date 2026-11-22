package com.shishuo.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * 课表离线缓存与桌面小组件桥接：
 * - syncSchedule：保存课表到原生 SharedPreferences 并立即刷新桌面小组件；
 * - requestPinWidget：在 Android 8.0+ 一键引导把课表小组件钉到手机桌面。
 */
@CapacitorPlugin(name = "ScheduleBridge")
public class ScheduleBridgePlugin extends Plugin {

    @PluginMethod
    public void syncSchedule(PluginCall call) {
        String payload = call.getString("payload", "");
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(
            ScheduleWidgetProvider.PREFS,
            Context.MODE_PRIVATE
        );
        prefs.edit().putString(ScheduleWidgetProvider.PAYLOAD_KEY, payload).apply();
        ScheduleWidgetProvider.updateAll(context);
        ScheduleWidgetStaticProvider.updateAll(context);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getCachedSchedule(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(
            ScheduleWidgetProvider.PREFS,
            Context.MODE_PRIVATE
        );
        JSObject ret = new JSObject();
        ret.put("payload", prefs.getString(ScheduleWidgetProvider.PAYLOAD_KEY, ""));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPinWidget(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("manufacturer", Build.MANUFACTURER);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            ret.put("supported", false);
            ret.put("requested", false);
            call.resolve(ret);
            return;
        }
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        if (manager == null || !manager.isRequestPinAppWidgetSupported()) {
            ret.put("supported", false);
            ret.put("requested", false);
            call.resolve(ret);
            return;
        }

        ComponentName mainProvider = new ComponentName(getContext(), ScheduleWidgetProvider.class);
        ComponentName compatProvider = new ComponentName(
            getContext(),
            ScheduleWidgetStaticProvider.class
        );
        // OPPO / ColorOS / realme 桌面优先请求普通 RemoteViews 兼容版，避免集合小组件被桌面拒绝。
        boolean oppoLike = isOppoLike();
        ComponentName provider = oppoLike ? compatProvider : mainProvider;
        boolean requested = manager.requestPinAppWidget(provider, null, null);
        if (!requested && oppoLike) {
            requested = manager.requestPinAppWidget(mainProvider, null, null);
            if (requested) provider = mainProvider;
        }
        ret.put("supported", true);
        ret.put("requested", requested);
        ret.put("provider", provider.getClassName());
        call.resolve(ret);
    }

    private static boolean isOppoLike() {
        String manufacturer = Build.MANUFACTURER == null
            ? ""
            : Build.MANUFACTURER.toLowerCase(Locale.ROOT);
        String brand = Build.BRAND == null ? "" : Build.BRAND.toLowerCase(Locale.ROOT);
        return manufacturer.contains("oppo") ||
            manufacturer.contains("realme") ||
            manufacturer.contains("oneplus") ||
            manufacturer.contains("oplus") ||
            brand.contains("oppo") ||
            brand.contains("realme") ||
            brand.contains("oneplus") ||
            brand.contains("oplus");
    }
}
