package com.rifim.raos.settings

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.rifim.raos.notification.RaosNotificationChannels

@CapacitorPlugin(
    name = "RaosAndroidSettingsBridge",
    permissions = [
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])
    ]
)
class RaosAndroidSettingsBridgePlugin : Plugin() {

    @PluginMethod
    fun getPermissionSummary(call: PluginCall) {
        val microphone = permissionStatus(Manifest.permission.RECORD_AUDIO)
        val camera = permissionStatus(Manifest.permission.CAMERA)
        val notifications = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            if (NotificationManagerCompat.from(context).areNotificationsEnabled()) "granted" else "denied"
        } else {
            permissionStatus(Manifest.permission.POST_NOTIFICATIONS)
        }
        call.resolve(JSObject().apply {
            put("camera", camera)
            put("microphone", microphone)
            put("notifications", notifications)
            put("chatChannelId", RaosNotificationChannels.CHANNEL_CHAT)
            put("operationalChannelId", RaosNotificationChannels.CHANNEL_OPERATIONAL)
            put("callsChannelId", RaosNotificationChannels.CHANNEL_CALLS)
        })
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(JSObject().apply { put("status", "granted") })
            return
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(JSObject().apply { put("status", "granted") })
            return
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback")
    }

    @PermissionCallback
    private fun notificationPermissionCallback(call: PluginCall) {
        val status = if (getPermissionState("notifications") == PermissionState.GRANTED) "granted" else "denied"
        call.resolve(JSObject().apply { put("status", status) })
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
        })
        call.resolve()
    }

    @PluginMethod
    fun openNotificationSettings(call: PluginCall) {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
            }
        }
        open(intent)
        call.resolve()
    }

    @PluginMethod
    fun openChatNotificationSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            open(Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                putExtra(Settings.EXTRA_CHANNEL_ID, RaosNotificationChannels.CHANNEL_CHAT)
            })
        } else {
            open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
            })
        }
        call.resolve()
    }

    @PluginMethod
    fun openAlarmSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            open(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.fromParts("package", context.packageName, null)
            })
        } else {
            open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
            })
        }
        call.resolve()
    }

    @PluginMethod
    fun openPictureInPictureSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            open(Intent("android.settings.PICTURE_IN_PICTURE_SETTINGS"))
        } else {
            open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
            })
        }
        call.resolve()
    }

    private fun permissionStatus(permission: String): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            context.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED
        ) "denied" else "granted"
    }

    private fun open(intent: Intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}
