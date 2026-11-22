package com.shishuo.app;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;

/**
 * 桌面课表小组件的列表数据适配器：支持完整显示 4 节及以上的全部课程，超出可视高度可上下滑动。
 */
public class ScheduleWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new ScheduleFactory(getApplicationContext());
    }

    private static class ScheduleFactory implements RemoteViewsFactory {

        private final Context context;
        private List<ScheduleWidgetProvider.ClassItem> items = new ArrayList<>();
        private boolean isTomorrow = false;
        private int nowMinutes = -1;

        ScheduleFactory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {
            reload();
        }

        @Override
        public void onDataSetChanged() {
            reload();
        }

        private void reload() {
            ScheduleWidgetProvider.ResolvedWidgetState state = ScheduleWidgetProvider.resolveState(
                context
            );
            this.items = state.items;
            this.isTomorrow = state.isTomorrow;
            this.nowMinutes = state.nowMinutes;
        }

        @Override
        public void onDestroy() {
            items.clear();
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= items.size()) {
                return null;
            }
            ScheduleWidgetProvider.ClassItem item = items.get(position);
            RemoteViews row = new RemoteViews(
                context.getPackageName(),
                R.layout.widget_schedule_item
            );

            String start = ScheduleWidgetProvider.startTimeOf(item);
            String end = ScheduleWidgetProvider.endTimeOf(item);
            String section = item.startSection == item.endSection
                ? "第" + item.startSection + "节"
                : item.startSection + "-" + item.endSection + "节";

            String timeLabel = !start.isEmpty() ? start : section;
            if (!isTomorrow && nowMinutes >= 0) {
                int s = ScheduleWidgetProvider.parseMinutes(start);
                int e = ScheduleWidgetProvider.parseMinutes(end);
                if (s >= 0 && e >= 0 && nowMinutes >= s && nowMinutes < e) {
                    timeLabel = "上课中";
                }
            }

            row.setTextViewText(R.id.widget_item_time, timeLabel);
            row.setTextViewText(R.id.widget_item_name, item.course);

            StringBuilder detail = new StringBuilder();
            if (item.room != null && !item.room.isEmpty()) {
                detail.append(item.room);
            }
            if (!start.isEmpty() && !end.isEmpty()) {
                if (detail.length() > 0) detail.append(" · ");
                detail.append(start).append("-").append(end);
            } else {
                if (detail.length() > 0) detail.append(" · ");
                detail.append(section);
            }
            if (detail.length() == 0 && item.teacher != null && !item.teacher.isEmpty()) {
                detail.append(item.teacher);
            }
            row.setTextViewText(R.id.widget_item_meta, detail.toString());

            Intent fillIn = new Intent().putExtra("shishuo_open_view", "schedule");
            row.setOnClickFillInIntent(R.id.widget_item_root, fillIn);
            return row;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
