package com.shishuo.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.CookieManager;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 后台通知轮询：App 被系统回收/退到后台后，WorkManager 每 15 分钟拉一次新通知，
 * 用系统通知提醒。不是 FCM，不依赖 Google 服务。
 *
 * 限制：用户“强行停止”App 或部分国产 ROM 的一键清理会暂停任务；Doze 下可能延迟。
 */
public class NotificationPollWorker extends Worker {

    private static final String BASE_URL = "http://121.37.30.147";
    private static final String CHANNEL_ID = "shishuo-alerts";
    private static final String PREFS = "shishuo_notifications";
    private static final String CURSOR_KEY = "cursor";
    private static final String DELIVERED_KEY = "delivered_ids";

    public NotificationPollWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return Result.success();
        }

        String cookie = CookieManager.getInstance().getCookie(BASE_URL);
        if (cookie == null || !cookie.contains("shishuo_session=")) {
            return Result.success();
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean firstRun = !prefs.contains(CURSOR_KEY);
        long cursor = prefs.getLong(CURSOR_KEY, 0L);

        HttpURLConnection connection = null;
        try {
            String endpoint =
                BASE_URL +
                "/api/notifications?since=" +
                (firstRun ? 0 : cursor) +
                "&unread=1&limit=50";
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Cookie", cookie);
            connection.setRequestProperty("Accept", "application/json");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);

            int status = connection.getResponseCode();
            if (status == 401 || status == 403) {
                return Result.success();
            }
            if (status < 200 || status >= 300) {
                return Result.success();
            }

            InputStream stream = connection.getInputStream();
            StringBuilder text = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8)
            )) {
                String line;
                while ((line = reader.readLine()) != null) text.append(line);
            }
            JSONObject root = new JSONObject(text.toString());
            long serverCursor = root.optLong("cursor", System.currentTimeMillis());

            if (firstRun) {
                prefs
                    .edit()
                    .putLong(CURSOR_KEY, serverCursor)
                    .putStringSet(DELIVERED_KEY, new HashSet<>())
                    .apply();
                return Result.success();
            }

            JSONArray notifications = root.optJSONArray("notifications");
            if (notifications == null) return Result.success();

            Set<String> delivered = new LinkedHashSet<>(
                prefs.getStringSet(DELIVERED_KEY, new HashSet<>())
            );
            boolean posted = false;
            for (int index = 0; index < notifications.length(); index++) {
                JSONObject notification = notifications.optJSONObject(index);
                if (notification == null || notification.optBoolean("read", false)) continue;
                String id = notification.optString("id", "");
                if (id.isEmpty() || delivered.contains(id)) continue;
                postNotification(context, notification, id);
                delivered.add(id);
                posted = true;
            }

            while (delivered.size() > 500) {
                String first = delivered.iterator().next();
                delivered.remove(first);
            }
            prefs
                .edit()
                .putLong(CURSOR_KEY, serverCursor)
                .putStringSet(DELIVERED_KEY, delivered)
                .apply();
            return posted ? Result.success() : Result.success();
        } catch (Exception error) {
            return Result.success();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void postNotification(Context context, JSONObject notification, String id) {
        NotificationManager manager = (NotificationManager) context.getSystemService(
            Context.NOTIFICATION_SERVICE
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "课程消息",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("老师回复、同问、转交与账号通知");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
        }

        int requestCode = stableId(id);
        Intent intent = new Intent(context, MainActivity.class)
            .setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            .putExtra("shishuo_thread_id", notification.optString("threadId", ""))
            .putExtra("shishuo_notification_id", id);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String title = notification.optString("title", "师说新消息");
        String body = notification.optString("body", "");
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_shishuo)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent);

        NotificationManagerCompat.from(context).notify(requestCode, builder.build());
    }

    private int stableId(String value) {
        int hash = (int) 2166136261L;
        for (int index = 0; index < value.length(); index++) {
            hash ^= value.charAt(index);
            hash *= 16777619;
        }
        int id = hash & 0x7fffffff;
        return id == 0 ? 1 : id;
    }
}
