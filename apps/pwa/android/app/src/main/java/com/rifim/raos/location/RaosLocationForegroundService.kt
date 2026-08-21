package com.rifim.raos.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.rifim.raos.MainActivity
import com.rifim.raos.R
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

/**
 * A3/A4 — RAOS background location foreground Service.
 *
 * Lifecycle contract (docs/ANDROID_BACKGROUND_LOCATION_PLAN.md section 3):
 *  - START only via explicit call from RaosLocationBridgePlugin
 *    (startBackgroundTracking()), itself only callable after the web layer
 *    has an authenticated session AND the user explicitly opted in — never
 *    auto-started on app open.
 *  - Runs while active; persistent notification cannot be silently
 *    dismissed without stopping tracking (A8/acceptance checklist item).
 *  - STOP on: explicit stopBackgroundTracking() call, AuthBridge having no
 *    valid token (checked every capture tick — A8 "if service wakes and
 *    token is invalid, stop itself, do not retry forever"), or the OS
 *    tearing the process down (service does not attempt to auto-resume on
 *    its own; the web layer decides whether to restart tracking next time
 *    the app is foregrounded, per plan doc section 3).
 */
class RaosLocationForegroundService : Service() {

    private lateinit var fusedClient: FusedLocationProviderClient
    private var locationCallback: LocationCallback? = null
    private var trackingUserId: String? = null
    private var trackingBranchId: String? = null

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val userId = intent?.getStringExtra(EXTRA_USER_ID)
        val branchId = intent?.getStringExtra(EXTRA_BRANCH_ID)

        // A8: never start/continue without a currently-valid session token.
        if (userId.isNullOrBlank() || AuthBridge.currentValidTokenOrNull() == null) {
            Log.w(TAG, "onStartCommand without valid session — stopping self, not starting tracking")
            stopSelf()
            return START_NOT_STICKY
        }

        trackingUserId = userId
        trackingBranchId = branchId

        startForeground(NOTIFICATION_ID, buildNotification(), foregroundServiceType())
        isTracking.set(true)
        startLocationUpdates()

        // START_NOT_STICKY: A9/A3 — if the OS kills this process, it does
        // NOT auto-restart. Silent unrequested resumption of background
        // location after an OS kill is both a battery-abuse pattern and a
        // Play Store policy risk; the web layer re-establishes tracking
        // explicitly next time the app is opened and the shift is still
        // "on duty" server-side (plan doc section 3), not the service
        // reviving itself unprompted.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        isTracking.set(false)
        stopLocationUpdates()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startLocationUpdates() {
        stopLocationUpdates() // idempotent — never stack multiple callbacks

        // A4: 30-60s interval starting point, not a tight continuous GPS
        // loop. PRIORITY_BALANCED_POWER_ACCURACY (not HIGH_ACCURACY) trades
        // a little precision for materially better battery life — adequate
        // for the ~500m geofence tolerance this system already uses
        // elsewhere (apps/pwa/src/lib/geo.ts GEOFENCE_TOLERANCE_METERS).
        val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CAPTURE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(CAPTURE_INTERVAL_MS / 2)
            .setMaxUpdateDelayMillis(CAPTURE_INTERVAL_MS * 2)
            .build()

        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation ?: return
                onNewFix(location)
            }
        }
        locationCallback = callback

        try {
            fusedClient.requestLocationUpdates(request, callback, mainLooper)
        } catch (e: SecurityException) {
            // Permission revoked mid-tracking (user can do this from OS
            // settings at any time) — stop cleanly rather than crash.
            Log.w(TAG, "Location permission revoked — stopping tracking", e)
            stopSelfCompletely()
        }
    }

    private fun stopLocationUpdates() {
        locationCallback?.let { fusedClient.removeLocationUpdates(it) }
        locationCallback = null
    }

    private fun onNewFix(location: Location) {
        // A8: re-checked on every fix, not just at start — a token can
        // expire mid-tracking-session.
        val userId = trackingUserId
        val token = AuthBridge.currentValidTokenOrNull()
        if (userId == null || token == null) {
            Log.i(TAG, "Session no longer valid mid-tracking — stopping self")
            stopSelfCompletely()
            return
        }

        // Wire shape only — lat/lng/accuracy/captured_at. user_id/branch_id are
        // NEVER sent; the RPC derives both server-side from the bearer token
        // (see LocationModels.kt / LocationSender.kt doc, 2026-08-21 backend wiring).
        val point = RaosLocationPoint(
            lat = location.latitude,
            lng = location.longitude,
            accuracyM = location.accuracy,
            capturedAtIso = Instant.ofEpochMilli(location.time).toString(),
        )

        // A4/A9: queue first (never lose a fix to a transient send
        // failure), then let WorkManager attempt delivery with backoff.
        LocationQueue.enqueue(applicationContext, point)
        RaosLocationSyncWorker.enqueue(applicationContext)
    }

    /** Called by RaosLocationBridgePlugin.stopBackgroundTracking() and by A8 self-stop paths. */
    private fun stopSelfCompletely() {
        isTracking.set(false)
        stopLocationUpdates()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun foregroundServiceType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        } else 0

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                CHANNEL_ID,
                "RAOS Tracking",
                NotificationManager.IMPORTANCE_LOW, // low: no sound/vibration spam per fix
            ).apply {
                description = "Notifikasi wajib selama tracking lokasi shift RAOS aktif"
            }
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        // A3/A8 acceptance checklist: persistent, low-key, tap-through to
        // the app (same-origin deep-link convention as public/sw-push.js),
        // and — per plan doc section 4 — dismissing it should not silently
        // continue tracking. ongoing(true) + no swipe-dismiss action
        // achieves that; ACTUALLY stopping tracking from the notification
        // itself would need an explicit "Stop tracking" action button,
        // deliberately omitted here so stopping only ever happens through
        // the authenticated web UI (Settings/operational screen per A7),
        // not an anonymous system-tray tap.
        val contentIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("RAOS — tracking aktif untuk shift Anda")
            .setContentText("Lokasi dikirim berkala selama shift berlangsung")
            // TODO: replace with a dedicated small monochrome status-bar icon
            // (Play Store best practice) — reusing the launcher icon is a
            // placeholder so this compiles against assets that actually
            // exist in this Capacitor-generated project today.
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .build()
    }

    companion object {
        private const val TAG = "RaosLocationService"
        private const val CHANNEL_ID = "raos_location_tracking"
        private const val NOTIFICATION_ID = 4271
        private const val CAPTURE_INTERVAL_MS = 45_000L // A4: 30-60s starting point

        val isTracking = AtomicBoolean(false)

        const val EXTRA_USER_ID = "user_id"
        const val EXTRA_BRANCH_ID = "branch_id"
    }
}
