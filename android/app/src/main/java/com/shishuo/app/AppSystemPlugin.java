package com.shishuo.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 安卓系统能力桥：
 * - getAppInfo：当前 APK 版本号、包名与壳层服务端地址；
 * - downloadUpdate：应用内流式下载新 APK（支持多跳重定向与备用镜像），实时回传进度并直接调起系统安装器；
 * - openInstallPermissionSettings / installPendingUpdate：引导开启「安装未知应用」权限后一键续装；
 * - openBatterySettings：跳转省电/应用详情，帮国产 ROM 减少后台通知被杀；
 * - haptic：轻量原生触感反馈。
 */
@CapacitorPlugin(name = "AppSystem")
public class AppSystemPlugin extends Plugin {

    private volatile boolean downloading = false;
    private volatile File pendingApkFile;

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();
        ret.put("packageName", context.getPackageName());
        ret.put("serverUrl", ShellConfig.getServerUrl(context));
        ret.put("inAppUpdater", true);
        boolean debuggable =
            (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        ret.put("debuggable", debuggable);
        ret.put("signingSha256", readSigningSha256(context));
        try {
            PackageInfo info = context
                .getPackageManager()
                .getPackageInfo(context.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
            ret.put("versionCode", code);
            ret.put("versionName", info.versionName == null ? "0.1.0" : info.versionName);
        } catch (Exception ignored) {
            ret.put("versionCode", 1);
            ret.put("versionName", "0.1.0");
        }
        call.resolve(ret);
    }

    @SuppressWarnings("deprecation")
    private String readSigningSha256(Context context) {
        try {
            PackageManager pm = context.getPackageManager();
            Signature[] sigs = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = pm.getPackageInfo(
                    context.getPackageName(),
                    PackageManager.GET_SIGNING_CERTIFICATES
                );
                SigningInfo signingInfo = info.signingInfo;
                if (signingInfo != null) {
                    sigs = signingInfo.hasMultipleSigners()
                        ? signingInfo.getApkContentsSigners()
                        : signingInfo.getSigningCertificateHistory();
                }
            } else {
                PackageInfo info = pm.getPackageInfo(
                    context.getPackageName(),
                    PackageManager.GET_SIGNATURES
                );
                sigs = info.signatures;
            }
            if (sigs == null || sigs.length == 0) return "";
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(sigs[0].toByteArray());
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(String.format(Locale.US, "%02x", b & 0xff));
            }
            return hex.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String url = call.getString("url", "").trim();
        String fallbackUrl = call.getString("fallbackUrl", "").trim();
        String versionName = call.getString("versionName", "latest").trim();
        if (url.isEmpty() && fallbackUrl.isEmpty()) {
            call.reject("缺少下载链接");
            return;
        }
        if (downloading) {
            JSObject ret = new JSObject();
            ret.put("mode", "inApp");
            ret.put("status", "downloading");
            call.resolve(ret);
            return;
        }

        downloading = true;
        Context context = getContext().getApplicationContext();
        new Thread(() -> {
            try {
                File dir = new File(context.getCacheDir(), "updates");
                if (!dir.exists()) dir.mkdirs();
                File[] oldFiles = dir.listFiles();
                if (oldFiles != null) {
                    for (File old : oldFiles) old.delete();
                }

                String safeVer = versionName.replaceAll("[^0-9A-Za-z._-]", "");
                if (safeVer.isEmpty()) safeVer = "latest";
                File targetFile = new File(dir, "shishuo-" + safeVer + ".apk");

                emitProgress("downloading", 0, 0, 0, "正在连接更新服务器…");

                Exception lastError = null;
                boolean ok = false;
                String[] candidates = !url.isEmpty() && !fallbackUrl.isEmpty() && !url.equals(fallbackUrl)
                    ? new String[] { url, fallbackUrl }
                    : new String[] { !url.isEmpty() ? url : fallbackUrl };

                for (int idx = 0; idx < candidates.length; idx++) {
                    String candidate = candidates[idx];
                    try {
                        if (idx > 0) {
                            emitProgress("downloading", 0, 0, 0, "主线路较慢，正在切换备用镜像…");
                        }
                        downloadApkWithRedirects(candidate, targetFile);
                        if (!isValidApkFile(targetFile)) {
                            throw new IOException("下载内容不是有效的 APK 安装包");
                        }
                        ok = true;
                        break;
                    } catch (Exception err) {
                        lastError = err;
                        if (targetFile.exists()) targetFile.delete();
                    }
                }

                if (!ok) {
                    String msg = lastError != null && lastError.getMessage() != null
                        ? lastError.getMessage()
                        : "更新包下载失败";
                    emitProgress("error", 0, 0, 0, msg);
                    JSObject ret = new JSObject();
                    ret.put("mode", "inApp");
                    ret.put("status", "error");
                    ret.put("message", msg);
                    call.resolve(ret);
                    return;
                }

                pendingApkFile = targetFile;
                String installStatus = triggerApkInstall(context, targetFile);
                JSObject ret = new JSObject();
                ret.put("mode", "inApp");
                ret.put("status", installStatus);
                call.resolve(ret);
            } finally {
                downloading = false;
            }
        })
            .start();
    }

    @PluginMethod
    public void installPendingUpdate(PluginCall call) {
        File file = pendingApkFile;
        if (file == null || !file.exists()) {
            JSObject ret = new JSObject();
            ret.put("status", "missing");
            call.resolve(ret);
            return;
        }
        String status = triggerApkInstall(getContext().getApplicationContext(), file);
        JSObject ret = new JSObject();
        ret.put("status", status);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        Context context = getContext();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (intent.resolveActivity(context.getPackageManager()) != null) {
                    context.startActivity(intent);
                    call.resolve();
                    return;
                }
            }
        } catch (Exception ignored) {
            // 回退到应用详情页。
        }
        try {
            Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            details.setData(Uri.parse("package:" + context.getPackageName()));
            details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(details);
            call.resolve();
        } catch (Exception error) {
            call.reject("无法打开应用安装权限设置");
        }
    }

    private String triggerApkInstall(Context context, File apkFile) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.getPackageManager().canRequestPackageInstalls()
        ) {
            emitProgress(
                "permission_required",
                100,
                apkFile.length(),
                apkFile.length(),
                "安装包已就绪，请允许「师说」安装应用后继续"
            );
            return "permission_required";
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
            );
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
            context.startActivity(install);
            emitProgress(
                "installing",
                100,
                apkFile.length(),
                apkFile.length(),
                "已调起系统安装界面，请确认安装"
            );
            return "installing";
        } catch (Exception error) {
            String msg = error.getMessage() == null ? "调起系统安装器失败" : error.getMessage();
            emitProgress("error", 100, apkFile.length(), apkFile.length(), msg);
            return "error";
        }
    }

    private void downloadApkWithRedirects(String startUrl, File targetFile) throws IOException {
        String currentUrl = startUrl;
        Map<String, String> cookies = new HashMap<>();
        HttpURLConnection conn = null;

        try {
            for (int hop = 0; hop < 8; hop++) {
                URL urlObj = new URL(currentUrl);
                conn = (HttpURLConnection) urlObj.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(30_000);
                conn.setRequestProperty("User-Agent", "ShishuoAndroidUpdater/1.0");
                conn.setRequestProperty("Accept", "*/*");
                String hostCookie = cookies.get(urlObj.getHost());
                if (hostCookie != null && !hostCookie.isEmpty()) {
                    conn.setRequestProperty("Cookie", hostCookie);
                }

                int code = conn.getResponseCode();
                List<String> setCookies = conn.getHeaderFields().get("Set-Cookie");
                if (setCookies != null && !setCookies.isEmpty()) {
                    StringBuilder sb = new StringBuilder(
                        hostCookie == null ? "" : hostCookie
                    );
                    for (String raw : setCookies) {
                        String pair = raw.split(";", 2)[0].trim();
                        if (!pair.isEmpty()) {
                            if (sb.length() > 0) sb.append("; ");
                            sb.append(pair);
                        }
                    }
                    cookies.put(urlObj.getHost(), sb.toString());
                }

                if (
                    code == HttpURLConnection.HTTP_MOVED_PERM ||
                    code == HttpURLConnection.HTTP_MOVED_TEMP ||
                    code == HttpURLConnection.HTTP_SEE_OTHER ||
                    code == 307 ||
                    code == 308
                ) {
                    String next = conn.getHeaderField("Location");
                    conn.disconnect();
                    conn = null;
                    if (next == null || next.isEmpty()) {
                        throw new IOException("下载重定向地址为空");
                    }
                    currentUrl = new URL(urlObj, next).toString();
                    continue;
                }

                if (code < 200 || code >= 300) {
                    throw new IOException("下载失败（HTTP " + code + "）");
                }

                long total = conn.getContentLengthLong();
                long downloaded = 0;
                long lastEmitAt = 0;
                int lastPct = -1;

                try (
                    InputStream in = conn.getInputStream();
                    FileOutputStream out = new FileOutputStream(targetFile)
                ) {
                    byte[] buf = new byte[16 * 1024];
                    int read;
                    while ((read = in.read(buf)) != -1) {
                        out.write(buf, 0, read);
                        downloaded += read;
                        long now = System.currentTimeMillis();
                        int pct = total > 0
                            ? (int) Math.min(99, (downloaded * 100L) / total)
                            : -1;
                        if (now - lastEmitAt >= 150 || (pct >= 0 && pct - lastPct >= 2)) {
                            lastEmitAt = now;
                            lastPct = pct;
                            emitProgress(
                                "downloading",
                                pct,
                                downloaded,
                                total,
                                pct >= 0 ? "正在下载更新包 " + pct + "%" : "正在下载更新包…"
                            );
                        }
                    }
                    out.flush();
                }
                emitProgress(
                    "verifying",
                    100,
                    downloaded,
                    total > 0 ? total : downloaded,
                    "正在校验安装包…"
                );
                return;
            }
            throw new IOException("下载重定向次数过多");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private boolean isValidApkFile(File file) {
        if (!file.exists() || file.length() < 64 * 1024) return false;
        byte[] magic = new byte[4];
        try (FileInputStream fis = new FileInputStream(file)) {
            int n = fis.read(magic);
            return n == 4 && magic[0] == 0x50 && magic[1] == 0x4B && magic[2] == 0x03 && magic[3] == 0x04;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void emitProgress(
        String status,
        int progress,
        long downloadedBytes,
        long totalBytes,
        String message
    ) {
        JSObject data = new JSObject();
        data.put("status", status);
        data.put("progress", progress);
        data.put("downloadedBytes", downloadedBytes);
        data.put("totalBytes", totalBytes);
        data.put("message", message);
        notifyListeners("updateDownload", data);
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context context = getContext();
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (intent.resolveActivity(context.getPackageManager()) != null) {
                context.startActivity(intent);
                call.resolve();
                return;
            }
        } catch (Exception ignored) {
            // 回退到应用详情页。
        }
        try {
            Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            details.setData(Uri.parse("package:" + context.getPackageName()));
            details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(details);
            call.resolve();
        } catch (Exception error) {
            call.reject("无法打开系统电池设置");
        }
    }

    @PluginMethod
    public void haptic(PluginCall call) {
        String style = call.getString("style", "light");
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                View decor = getActivity().getWindow().getDecorView();
                int feedback = HapticFeedbackConstants.KEYBOARD_TAP;
                if ("medium".equals(style)) {
                    feedback = HapticFeedbackConstants.VIRTUAL_KEY;
                } else if ("success".equals(style) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    feedback = HapticFeedbackConstants.CONFIRM;
                }
                boolean ok = decor.performHapticFeedback(feedback);
                if (!ok) fallbackVibrate("medium".equals(style) ? 24 : 14);
            });
        }
        call.resolve();
    }

    private void fallbackVibrate(long ms) {
        try {
            Context context = getContext();
            Vibrator vibrator = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) context.getSystemService(
                    Context.VIBRATOR_MANAGER_SERVICE
                );
                if (vm != null) vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(
                    VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)
                );
            }
        } catch (Exception ignored) {
            // 某些设备无震动权限或马达，静默忽略。
        }
    }
}
