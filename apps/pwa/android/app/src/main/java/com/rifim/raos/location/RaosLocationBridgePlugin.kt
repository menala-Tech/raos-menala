package com.rifim.raos.location

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * A7 — native <-> web bridge. Exposed to the PWA as
 * `Capacitor.Plugins.RaosLocationBridge` (via the generated JS proxy once
 * `npx cap sync` regenerates plugin bindings against this native change).
 *
 * Web-callable methods (see A7 requirement list):
 *   - requestLocationPermissions()   — STAGED, not a single blind prompt (A3)
 *   - startBackgroundTracking({ userId, branchId })
 *   - stopBackgroundTracking()
 *   - getBackgroundTrackingStatus()
 *   - setSessionToken({ accessToken, userId, branchId, expiresAtEpochSeconds })  (A5)
 *   - clearSessionToken()                                                        (A5/A8)
 *
 * Staged permission flow (A3): this plugin defines TWO permission aliases
 * -- "location" (FINE+COARSE) and "backgroundLocation" (ACCESS_BACKGROUND_
 * LOCATION) -- and requestLocationPermissions() requests them
 * *sequentially*, foreground first. Android 10+ (API 29+) refuses to grant
 * ACCESS_BACKGROUND_LOCATION in the same request as foreground location
 * permissions, so this is a hard OS requirement, not a style choice.
 * POST_NOTIFICATIONS (API 33+) is requested as its own third step, only
 * right before startBackgroundTracking() actually starts the foreground
 * service (not upfront) since it's meaningless before that point.
 */
@CapacitorPlugin(
    name = "RaosLocationBridge",
    permissions = [
        Permission(
            alias = "location",
            strings = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION],
        ),
        Permission(
            alias = "backgroundLocation",
            strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION],
        ),
        Permission(
            alias = "notifications",
            strings = [Manifest.permission.POST_NOTIFICATIONS],
        ),
    ],
)
class RaosLocationBridgePlugin : Plugin() {

    // ---- A5: auth bridge from the web layer ----
    // 2026-08-21 backend wiring: the web layer now passes its own already-existing
    // Supabase config (supabaseUrl + the public anon/publishable key) alongside the
    // access token, on every login / token refresh / session restore. See
    // apps/pwa/src/lib/nativeLocationBridge.ts installNativeLocationAuthBridge().

    @PluginMethod
    fun setSessionToken(call: PluginCall) {
        val supabaseUrl = call.getString("supabaseUrl")
        val publicKey = call.getString("publicKey")
        val accessToken = call.getString("accessToken")
        val userId = call.getString("userId")
        val expiresAt = call.getInt("expiresAtEpochSeconds")
        if (supabaseUrl.isNullOrBlank() || publicKey.isNullOrBlank() || accessToken.isNullOrBlank() ||
            userId.isNullOrBlank() || expiresAt == null
        ) {
            call.reject("supabaseUrl, publicKey, accessToken, userId, expiresAtEpochSeconds are required")
            return
        }
        AuthBridge.set(
            RaosSessionToken(
                supabaseUrl = supabaseUrl,
                publicKey = publicKey,
                accessToken = accessToken,
                userId = userId,
                branchId = call.getString("branchId"),
                expiresAtEpochSeconds = expiresAt.toLong(),
            ),
        )
        call.resolve()
    }

    /** A5/A8 — call this on SIGNED_OUT / logout / session-invalid from the web layer. */
    @PluginMethod
    fun clearSessionToken(call: PluginCall) {
        AuthBridge.clear()
        // "stop pending retry worker tied to that user" (A8) — no auth left to
        // retry with, and no further writes should be attempted under a dead
        // session even if points are still queued.
        RaosLocationSyncWorker.cancel(context)
        LocationQueue.clear(context)
        call.resolve()
    }

    // ---- A3: staged permission flow ----

    @PluginMethod
    fun requestLocationPermissions(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "foregroundLocationCallback")
            return
        }
        proceedToBackgroundLocation(call)
    }

    @PermissionCallback
    private fun foregroundLocationCallback(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.resolve(statusObject(granted = false, reason = "foreground_location_denied"))
            return
        }
        proceedToBackgroundLocation(call)
    }

    private fun proceedToBackgroundLocation(call: PluginCall) {
        // Only meaningful/requestable on API 29+; on older APIs foreground
        // location permission already implies background access.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            getPermissionState("backgroundLocation") == PermissionState.GRANTED
        ) {
            call.resolve(statusObject(granted = true))
            return
        }
        requestPermissionForAlias("backgroundLocation", call, "backgroundLocationCallback")
    }

    @PermissionCallback
    private fun backgroundLocationCallback(call: PluginCall) {
        val granted = getPermissionState("backgroundLocation") == PermissionState.GRANTED
        call.resolve(statusObject(granted = granted, reason = if (granted) null else "background_location_denied"))
    }

    private fun statusObject(granted: Boolean, reason: String? = null): JSObject = JSObject().apply {
        put("granted", granted)
        if (reason != null) put("reason", reason)
    }

    // ---- A7: tracking control ----

    @PluginMethod
    fun startBackgroundTracking(call: PluginCall) {
        val userId = call.getString("userId")
        if (userId.isNullOrBlank()) {
            call.reject("userId is required")
            return
        }
        if (AuthBridge.currentValidTokenOrNull() == null) {
            call.reject("no_valid_session — call setSessionToken() first")
            return
        }
        if (getPermissionState("location") != PermissionState.GRANTED ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("backgroundLocation") != PermissionState.GRANTED)
        ) {
            call.reject("location_permission_not_granted — call requestLocationPermissions() first")
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissionForAlias("notifications", call, "notificationsThenStartCallback")
            return
        }
        actuallyStart(call, userId, call.getString("branchId"))
    }

    @PermissionCallback
    private fun notificationsThenStartCallback(call: PluginCall) {
        // Persistent notification is required by the OS for a foreground
        // location service to keep running — but per A3/A8 we still start
        // tracking even if POST_NOTIFICATIONS is denied (Android degrades
        // gracefully, the service just can't show a custom notification on
        // 13+ without it in some OEM skins); we do not hard-block tracking
        // on this one optional permission the way we do for location itself.
        val userId = call.getString("userId") ?: return call.reject("userId is required")
        actuallyStart(call, userId, call.getString("branchId"))
    }

    private fun actuallyStart(call: PluginCall, userId: String, branchId: String?) {
        val intent = Intent(context, RaosLocationForegroundService::class.java).apply {
            putExtra(RaosLocationForegroundService.EXTRA_USER_ID, userId)
            putExtra(RaosLocationForegroundService.EXTRA_BRANCH_ID, branchId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        call.resolve(JSObject().apply { put("tracking", true) })
    }

    @PluginMethod
    fun stopBackgroundTracking(call: PluginCall) {
        RaosLocationForegroundService.isTracking.set(false)
        context.stopService(Intent(context, RaosLocationForegroundService::class.java))
        call.resolve(JSObject().apply { put("tracking", false) })
    }

    @PluginMethod
    fun getBackgroundTrackingStatus(call: PluginCall) {
        // The process-local service flag distinguishes an authenticated
        // session from explicit user opt-in, so opening Settings never reports
        // tracking active merely because the native auth bridge is ready.
        val hasSession = AuthBridge.currentValidTokenOrNull() != null
        val hasPerms = getPermissionState("location") == PermissionState.GRANTED &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("backgroundLocation") == PermissionState.GRANTED)
        call.resolve(
            JSObject().apply {
                put("tracking", RaosLocationForegroundService.isTracking.get())
                put("hasValidSession", hasSession)
                put("hasRequiredPermissions", hasPerms)
                put("queuedPointCount", LocationQueue.size(context))
            },
        )
    }
}
