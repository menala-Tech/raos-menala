package com.rifim.raos.reminder

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.rifim.raos.notification.RaosNotificationChannels

class RaosWorkReminderWorker(
    private val appContext: Context,
    params: WorkerParameters,
) : Worker(appContext, params) {

    override fun doWork(): Result {
        val plan = WorkReminderPlan(
            reminderKey = inputData.getString("reminderKey") ?: return Result.success(),
            userId = inputData.getString("userId") ?: return Result.success(),
            branchId = inputData.getString("branchId") ?: return Result.success(),
            shiftCode = inputData.getString("shiftCode") ?: return Result.success(),
            shiftLabel = inputData.getString("shiftLabel") ?: "Jadwal Kerja",
            workDate = inputData.getString("workDate") ?: "",
            shiftStartAt = inputData.getString("shiftStartAt") ?: "",
            reminderAt = inputData.getString("reminderAt") ?: "",
            reminderAtEpochMs = inputData.getLong("reminderAtEpochMs", 0L),
            route = inputData.getString("route") ?: "/dashboard?tab=jadwal",
            title = inputData.getString("title") ?: "Pengingat Jadwal Kerja",
            body = inputData.getString("body") ?: "Jadwal kerja Anda akan dimulai.",
        )
        if (RaosWorkReminderScheduler.isStale(plan)) return Result.success()

        RaosNotificationChannels.createAll(appContext)
        RaosNotificationChannels.showNotification(
            context = appContext,
            channelId = RaosNotificationChannels.CHANNEL_WORK_REMINDERS,
            title = plan.title,
            body = plan.body,
            notificationId = inputData.getInt("notificationId", plan.notificationId()),
            deepLink = plan.route,
        )
        return Result.success()
    }
}
