package com.shishuo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import java.util.List;

/**
 * 兼容版课表小组件：只使用普通 RemoteViews，不依赖 ListView / RemoteViewsService。
 *
 * OPPO / ColorOS 等部分桌面在小组件选择器或拖放阶段对集合小组件支持不完整，
 * 这个 Provider 用固定 4 行静态布局作为兜底；完整可滚动版仍由 ScheduleWidgetProvider 提供。
 */
public class ScheduleWidgetStaticProvider extends AppWidgetProvider {

    private static final int MAX_ROWS = 4;
    private static final int[] ROW_IDS = {
        R.id.widget_static_row_1,
        R.id.widget_static_row_2,
        R.id.widget_static_row_3,
        R.id.widget_static_row_4,
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            updateOne(context, manager, id);
        }
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, ScheduleWidgetStaticProvider.class);
        int[] ids = manager.getAppWidgetIds(provider);
        if (ids == null || ids.length == 0) return;
        for (int id : ids) {
            updateOne(context, manager, id);
        }
    }

    private static void updateOne(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_schedule_static);

        Intent openIntent = new Intent(context, MainActivity.class)
            .setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            .putExtra("shishuo_open_view", "schedule");
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            4101,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_static_root, pendingIntent);
        for (int rowId : ROW_IDS) {
            views.setOnClickPendingIntent(rowId, pendingIntent);
        }

        ScheduleWidgetProvider.ResolvedWidgetState state = ScheduleWidgetProvider.resolveState(context);
        views.setTextViewText(R.id.widget_static_title, state.title);
        String meta = state.meta;
        if (state.items.size() > MAX_ROWS) {
            meta = meta + " · 另有 " + (state.items.size() - MAX_ROWS) + " 节";
        }
        views.setTextViewText(R.id.widget_static_meta, meta);

        if (state.items.isEmpty()) {
            for (int rowId : ROW_IDS) {
                views.setViewVisibility(rowId, View.GONE);
            }
            views.setViewVisibility(R.id.widget_static_empty, View.VISIBLE);
            views.setTextViewText(
                R.id.widget_static_empty,
                state.emptyMessage != null ? state.emptyMessage : "今日无课，点击查看整周课表"
            );
            manager.updateAppWidget(appWidgetId, views);
            return;
        }

        views.setViewVisibility(R.id.widget_static_empty, View.GONE);
        List<ScheduleWidgetProvider.ClassItem> items = state.items;
        for (int i = 0; i < ROW_IDS.length; i++) {
            if (i >= items.size()) {
                views.setViewVisibility(ROW_IDS[i], View.GONE);
                continue;
            }
            ScheduleWidgetProvider.ClassItem item = items.get(i);
            String start = ScheduleWidgetProvider.startTimeOf(item);
            String end = ScheduleWidgetProvider.endTimeOf(item);
            String section = item.startSection == item.endSection
                ? "第" + item.startSection + "节"
                : item.startSection + "-" + item.endSection + "节";
            String timeLabel = !start.isEmpty() ? start : section;

            if (!state.isTomorrow && state.nowMinutes >= 0) {
                int s = ScheduleWidgetProvider.parseMinutes(start);
                int e = ScheduleWidgetProvider.parseMinutes(end);
                if (s >= 0 && e >= 0 && state.nowMinutes >= s && state.nowMinutes < e) {
                    timeLabel = "上课中";
                }
            }

            StringBuilder line = new StringBuilder(timeLabel).append("  ").append(item.course);
            if (item.room != null && !item.room.isEmpty()) {
                line.append(" · ").append(item.room);
            } else if (item.teacher != null && !item.teacher.isEmpty()) {
                line.append(" · ").append(item.teacher);
            }
            views.setTextViewText(ROW_IDS[i], line.toString());
            views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
        }

        manager.updateAppWidget(appWidgetId, views);
    }
}
