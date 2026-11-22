package com.shishuo.app;

import android.content.Context;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

/** 每 15 分钟轮询一次通知；系统允许的最小周期。 */
public final class NotificationPollScheduler {

    private static final String WORK_NAME = "shishuo-notification-poll";

    private NotificationPollScheduler() {}

    public static void ensureScheduled(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            NotificationPollWorker.class,
            15,
            TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .build();
        WorkManager
            .getInstance(context)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
    }
}
