# 保留注解与泛型签名（Capacitor 插件反射 @CapacitorPlugin / @PluginMethod / @ActivityCallback 必需）
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions

# Capacitor 核心与原生插件（反射注册与注解回调必须保留）
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @android.webkit.JavascriptInterface <methods>;
}

# 师说原生壳、插件、桌面小组件与后台通知 Worker
-keep class com.shishuo.app.** { *; }

# AndroidX WorkManager / AppWidget 反射构造保留
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }
-keep class * extends android.appwidget.AppWidgetProvider { *; }
-keep class * extends android.widget.RemoteViewsService { *; }

# 常见三方库静默告警
-dontwarn org.apache.cordova.**
-dontwarn com.google.errorprone.annotations.**
