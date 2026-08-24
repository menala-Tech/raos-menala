package com.rifim.raos.notification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.rifim.raos.MainActivity

/**
 * RAOS notification channels — smallest safe foundation for chat and
 * operational reminders. Channels are created idempotently on app start.
 *
 * Chat notifications are currently driven by the browser/PWA Web Push
 * service worker. These native channels exist for:
 *  1. future local reminder scheduling (WorkManager/AlarmManager),
 *  2. any bridge that chooses to surface a native notification.
 */
object RaosNotificationChannels {

    const val CHANNEL_CHAT = "raos_chat"
    const val CHANNEL_OPERATIONAL = "raos_operational"
    const val CHANNEL_REMINDERS = CHANNEL_OPERATIONAL
    const val CHANNEL_CALLS = "raos_calls"

    @JvmStatic
    fun createAll(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val chat = NotificationChannel(
            CHANNEL_CHAT,
            "Chat RAOS",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Pesan dan mention dari room chat RAOS"
            enableVibration(true)
            enableLights(true)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }

        val reminders = NotificationChannel(
            CHANNEL_OPERATIONAL,
            "RAOS Operasional / Saldo",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Reminder shift, absensi, saldo, dan tugas operasional"
            enableVibration(true)
            enableLights(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }

        val calls = NotificationChannel(
            CHANNEL_CALLS,
            "RAOS Calls",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Panggilan atau eskalasi operasional RAOS"
            enableVibration(true)
            enableLights(true)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }

        manager.createNotificationChannels(listOf(chat, reminders, calls))
    }

    /**
     * Minimal helper to display a native chat/operational notification.
     * Callers must ensure the caller holds POST_NOTIFICATIONS (Android 13+).
     */
    fun showNotification(
        context: Context,
        channelId: String,
        title: String,
        body: String,
        notificationId: Int,
        deepLink: String? = null,
    ) {
        val contentIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                if (!deepLink.isNullOrBlank()) data = android.net.Uri.parse(deepLink)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(com.rifim.raos.R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setCategory(
                when (channelId) {
                    CHANNEL_OPERATIONAL -> NotificationCompat.CATEGORY_REMINDER
                    CHANNEL_CALLS -> NotificationCompat.CATEGORY_CALL
                    else -> NotificationCompat.CATEGORY_MESSAGE
                }
            )

        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.notify(notificationId, builder.build())
    }
}
