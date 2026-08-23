package com.rifim.raos.microphone

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Smallest safe microphone permission bridge for RAOS chat voice recording.
 *
 * The web layer keeps using `navigator.mediaDevices.getUserMedia({ audio: true })`
 * plus `MediaRecorder`. This plugin only surfaces Android runtime permission
 * status / request / settings so the user is prompted at the right moment
 * (tap record), not at app startup.
 */
@CapacitorPlugin(
    name = "RaosMicrophoneBridge",
    permissions = [
        Permission(
            alias = "microphone",
            strings = [Manifest.permission.RECORD_AUDIO],
        ),
    ],
)
class RaosMicrophoneBridgePlugin : Plugin() {

    @PluginMethod
    fun getMicrophonePermissionStatus(call: PluginCall) {
        val status = when (getPermissionState("microphone")) {
            PermissionState.GRANTED -> "granted"
            PermissionState.DENIED -> "denied"
            else -> "prompt"
        }
        call.resolve(JSObject().apply { put("status", status) })
    }

    @PluginMethod
    fun requestMicrophonePermission(call: PluginCall) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            call.resolve(JSObject().apply { put("status", "granted") })
            return
        }
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback")
    }

    @PermissionCallback
    private fun microphonePermissionCallback(call: PluginCall) {
        val status = when (getPermissionState("microphone")) {
            PermissionState.GRANTED -> "granted"
            PermissionState.DENIED -> "denied"
            else -> "prompt"
        }
        call.resolve(JSObject().apply { put("status", status) })
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        call.resolve()
    }
}
