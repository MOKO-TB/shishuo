package com.shishuo.app;

import android.content.Context;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * 统一从 assets/capacitor.config.json 读取 server.url，
 * 避免后台轮询、断网兜底页和主界面各写一套硬编码地址。
 */
public final class ShellConfig {

    private static final String DEFAULT_SERVER_URL = "http://121.37.30.147";
    private static volatile String cachedServerUrl;

    private ShellConfig() {}

    public static String getServerUrl(Context context) {
        if (cachedServerUrl != null) return cachedServerUrl;
        String resolved = DEFAULT_SERVER_URL;
        try (InputStream input = context.getAssets().open("capacitor.config.json")) {
            StringBuilder sb = new StringBuilder();
            try (
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(input, StandardCharsets.UTF_8)
                )
            ) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }
            JSONObject root = new JSONObject(sb.toString());
            JSONObject server = root.optJSONObject("server");
            if (server != null) {
                String url = server.optString("url", "").trim();
                if (!url.isEmpty()) {
                    while (url.endsWith("/")) {
                        url = url.substring(0, url.length() - 1);
                    }
                    resolved = url;
                }
            }
        } catch (Exception ignored) {
            // 资产文件异常时回退默认生产地址。
        }
        cachedServerUrl = resolved;
        return resolved;
    }
}
