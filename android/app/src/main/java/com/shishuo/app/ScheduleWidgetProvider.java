package com.shishuo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 4x2 桌面课程表小组件：
 * - 使用 ListView + RemoteViewsService 展示当天或明日全部课程（4 节、5 节、6 节均可完整显示/滚动）；
 * - 按 termStart 计算当前教学周，高亮「上课中」或显示明日课程安排；
 * - 点击任意课程或空白区域直达 App 课程表页。
 */
public class ScheduleWidgetProvider extends AppWidgetProvider {

    public static final String PREFS = "shishuo_schedule_cache";
    public static final String PAYLOAD_KEY = "payload_json";
    private static final String[] WEEKDAY_NAMES = { "一", "二", "三", "四", "五", "六", "日" };
    private static final Pattern RANGE_PATTERN = Pattern.compile("(\\d{1,2})\\s*[-–~]\\s*(\\d{1,2})");
    private static final Pattern SINGLE_PATTERN = Pattern.compile("\\d{1,2}");

    private static final String[][] SECTION_BELL = {
        null,
        { "08:20", "09:05" },
        { "09:10", "09:55" },
        { "10:15", "11:00" },
        { "11:05", "11:50" },
        { "14:30", "15:15" },
        { "15:20", "16:05" },
        { "16:25", "17:10" },
        { "17:15", "18:00" },
        { "19:00", "19:45" },
        { "19:50", "20:35" },
        { "20:40", "21:25" },
    };

    static class ClassItem {
        String course;
        String room;
        String teacher;
        int day;
        int startSection;
        int endSection;
        String weeks;
        String startTime;
        String endTime;
    }

    static class ResolvedWidgetState {
        String title = "师说 · 今日课表";
        String meta = "点击查看";
        String emptyMessage = null;
        boolean isTomorrow = false;
        int nowMinutes = -1;
        List<ClassItem> items = new ArrayList<>();
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            updateOne(context, manager, id);
        }
        manager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list_view);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, ScheduleWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(provider);
        if (ids == null || ids.length == 0) return;
        for (int id : ids) {
            updateOne(context, manager, id);
        }
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list_view);
    }

    private static void updateOne(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_schedule);

        Intent openIntent = new Intent(context, MainActivity.class)
            .setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            .putExtra("shishuo_open_view", "schedule");
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            4001,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        views.setOnClickPendingIntent(R.id.widget_empty, pendingIntent);
        views.setPendingIntentTemplate(R.id.widget_list_view, pendingIntent);

        Intent serviceIntent = new Intent(context, ScheduleWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list_view, serviceIntent);
        views.setEmptyView(R.id.widget_list_view, R.id.widget_empty);

        ResolvedWidgetState state = resolveState(context);
        views.setTextViewText(R.id.widget_title, state.title);
        views.setTextViewText(R.id.widget_meta, state.meta);

        if (state.items.isEmpty()) {
            views.setViewVisibility(R.id.widget_list_view, View.GONE);
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextViewText(
                R.id.widget_empty,
                state.emptyMessage != null ? state.emptyMessage : "今日无课，点击查看整周课表"
            );
        } else {
            views.setViewVisibility(R.id.widget_empty, View.GONE);
            views.setViewVisibility(R.id.widget_list_view, View.VISIBLE);
        }

        manager.updateAppWidget(appWidgetId, views);
    }

    static ResolvedWidgetState resolveState(Context context) {
        ResolvedWidgetState state = new ResolvedWidgetState();
        Calendar now = Calendar.getInstance();
        int todayDay = isoDay(now);
        String weekdayText = "周" + WEEKDAY_NAMES[todayDay - 1];
        String dateText = String.format(
            Locale.CHINA,
            "%d/%d %s",
            now.get(Calendar.MONTH) + 1,
            now.get(Calendar.DAY_OF_MONTH),
            weekdayText
        );

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(PAYLOAD_KEY, "");
        if (raw == null || raw.isEmpty()) {
            state.title = "师说 · 今日课表";
            state.meta = dateText;
            state.emptyMessage = "打开师说登录并同步课表后，\n这里会自动显示今日与明日全部课程";
            return state;
        }

        try {
            JSONObject payload = new JSONObject(raw);
            long termStart = payload.optLong("termStart", 0L);
            int currentWeek = computeTeachingWeek(termStart, now.getTimeInMillis());
            JSONArray array = payload.optJSONArray("schedule");
            List<ClassItem> all = parseSchedule(array);

            if (currentWeek > 0) {
                state.title = String.format(
                    Locale.CHINA,
                    "第 %d 周 · %s",
                    currentWeek,
                    weekdayText
                );
            } else {
                state.title = "今日课表 · " + weekdayText;
            }

            List<ClassItem> todayList = filterForDay(all, todayDay, currentWeek);
            int nowMinutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
            state.nowMinutes = nowMinutes;

            List<ClassItem> remaining = new ArrayList<>();
            for (ClassItem item : todayList) {
                int endMin = endMinutes(item);
                if (endMin < 0 || endMin > nowMinutes) {
                    remaining.add(item);
                }
            }

            if (all.isEmpty()) {
                state.meta = dateText;
                state.emptyMessage = "还没有添加课程，点这里去导入教务课表";
                return state;
            }

            if (!remaining.isEmpty()) {
                state.meta = String.format(Locale.CHINA, "待上 %d 节 · %s", remaining.size(), dateText);
                state.isTomorrow = false;
                state.items = remaining;
                return state;
            }

            List<ClassItem> tomorrow = findTomorrow(all, now, termStart);
            if (!tomorrow.isEmpty()) {
                state.meta = String.format(
                    Locale.CHINA,
                    todayList.isEmpty() ? "今日无课 · 明日 %d 节" : "今日已下课 · 明日 %d 节",
                    tomorrow.size()
                );
                state.isTomorrow = true;
                state.items = tomorrow;
                return state;
            }

            state.meta = todayList.isEmpty() ? dateText : "今日已下课 · " + dateText;
            state.emptyMessage = todayList.isEmpty()
                ? "今日无课，好好休息或去刷会儿题吧"
                : "今天的课都上完啦，点这里查看整周课表";
            return state;
        } catch (Exception error) {
            state.title = "师说 · 今日课表";
            state.meta = dateText;
            state.emptyMessage = "课表数据加载异常，点这里重新同步";
            return state;
        }
    }

    static String startTimeOf(ClassItem item) {
        if (item.startTime != null && !item.startTime.isEmpty()) return item.startTime;
        if (item.startSection >= 1 && item.startSection < SECTION_BELL.length) {
            return SECTION_BELL[item.startSection][0];
        }
        return "";
    }

    static String endTimeOf(ClassItem item) {
        if (item.endTime != null && !item.endTime.isEmpty()) return item.endTime;
        if (item.endSection >= 1 && item.endSection < SECTION_BELL.length) {
            return SECTION_BELL[item.endSection][1];
        }
        return "";
    }

    static int parseMinutes(String hhmm) {
        if (hhmm == null || !hhmm.contains(":")) return -1;
        try {
            String[] parts = hhmm.split(":");
            return Integer.parseInt(parts[0].trim()) * 60 + Integer.parseInt(parts[1].trim());
        } catch (Exception ignored) {
            return -1;
        }
    }

    private static List<ClassItem> findTomorrow(
        List<ClassItem> all,
        Calendar now,
        long termStart
    ) {
        Calendar tomorrow = (Calendar) now.clone();
        tomorrow.add(Calendar.DAY_OF_YEAR, 1);
        int day = isoDay(tomorrow);
        int week = computeTeachingWeek(termStart, tomorrow.getTimeInMillis());
        return filterForDay(all, day, week);
    }

    private static List<ClassItem> parseSchedule(JSONArray array) {
        List<ClassItem> list = new ArrayList<>();
        if (array == null) return list;
        for (int i = 0; i < array.length(); i++) {
            JSONObject obj = array.optJSONObject(i);
            if (obj == null) continue;
            ClassItem item = new ClassItem();
            item.course = obj.optString("course", "").trim();
            if (item.course.isEmpty()) continue;
            item.room = obj.optString("room", "").trim();
            item.teacher = obj.optString("teacher", "").trim();
            item.day = obj.optInt("day", 1);
            item.startSection = obj.optInt("startSection", 1);
            item.endSection = obj.optInt("endSection", item.startSection);
            item.weeks = obj.optString("weeks", "").trim();
            item.startTime = obj.optString("startTime", "").trim();
            item.endTime = obj.optString("endTime", "").trim();
            list.add(item);
        }
        return list;
    }

    private static List<ClassItem> filterForDay(List<ClassItem> all, int day, int week) {
        List<ClassItem> out = new ArrayList<>();
        for (ClassItem item : all) {
            if (item.day != day) continue;
            if (week > 0 && !runsInWeek(item.weeks, week)) continue;
            out.add(item);
        }
        Collections.sort(
            out,
            Comparator.comparingInt((ClassItem a) -> a.startSection).thenComparing(a -> a.course)
        );
        return out;
    }

    private static int isoDay(Calendar cal) {
        int dayOfWeek = cal.get(Calendar.DAY_OF_WEEK);
        return dayOfWeek == Calendar.SUNDAY ? 7 : dayOfWeek - 1;
    }

    private static long mondayOf(long ts) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(ts);
        int offset = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        cal.add(Calendar.DAY_OF_MONTH, -offset);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    private static int computeTeachingWeek(long termStart, long nowTs) {
        if (termStart <= 0) return -1;
        long diff = mondayOf(nowTs) - mondayOf(termStart);
        int week = (int) Math.floor((double) diff / (7.0 * 86_400_000.0)) + 1;
        return Math.max(1, week);
    }

    private static boolean runsInWeek(String weeks, int week) {
        if (weeks == null || weeks.isEmpty()) return true;
        if (weeks.contains("单周") && week % 2 == 0) return false;
        if (weeks.contains("双周") && week % 2 == 1) return false;
        Matcher rangeMatcher = RANGE_PATTERN.matcher(weeks);
        boolean foundRange = false;
        while (rangeMatcher.find()) {
            foundRange = true;
            int from = Integer.parseInt(rangeMatcher.group(1));
            int to = Integer.parseInt(rangeMatcher.group(2));
            if (week >= from && week <= to) return true;
        }
        if (foundRange) return false;
        Matcher singleMatcher = SINGLE_PATTERN.matcher(weeks);
        boolean foundSingle = false;
        while (singleMatcher.find()) {
            foundSingle = true;
            if (Integer.parseInt(singleMatcher.group()) == week) return true;
        }
        return !foundSingle;
    }

    private static int endMinutes(ClassItem item) {
        return parseMinutes(endTimeOf(item));
    }
}
