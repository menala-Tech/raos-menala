package com.rifim.raos.location

import android.content.Context
import android.content.Intent
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * A9 — offline/retry via WorkManager (never a naive infinite-loop timer).
 * WorkManager itself respects Doze/App Standby and battery constraints.
 *
 * Result handling per the live RPC contract (2026-08-21 backend wiring):
 *   - Success        -> batch already drained from LocationQueue by drainStillRelevant();
 *                        nothing more to do.
 *   - NoSession       -> no token held right now (e.g. race with logout); re-queue
 *                        and stop — do not force a retry loop against a session
 *                        that may simply be gone.
 *   - AuthInvalid     -> token rejected (401/403). Stop tracking + clear the native
 *                        auth state immediately, DROP the batch (it can never
 *                        succeed under an invalid session — retrying is pointless
 *                        and "do NOT retry forever" is explicit in the task).
 *   - Retryable       -> transient (408/429/5xx/network). Re-queue, let
 *                        WorkManager's exponential backoff retry, bounded by
 *                        MAX_ATTEMPTS.
 *   - Invalid         -> the payload itself is bad (e.g. validation rejected by
 *                        the RPC) or the account genuinely can't write right now
 *                        (role_not_allowed/branch_not_assigned/profile_inactive).
 *                        Retrying the SAME points will fail identically forever
 *                        -- drop them, log, do not requeue, do not retry.
 */
class RaosLocationSyncWorker(
    private val appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val points = LocationQueue.drainStillRelevant(appContext)
        if (points.isEmpty()) return Result.success()

        return when (LocationSender.send(points)) {
            is LocationSender.SendResult.Success -> Result.success()

            is LocationSender.SendResult.NoSession -> {
                LocationQueue.enqueueAll(appContext, points)
                Result.success() // nothing to retry against right now, not a failure
            }

            is LocationSender.SendResult.AuthInvalid -> {
                stopTrackingAndClearAuth()
                // Batch intentionally dropped, not re-queued — see class doc.
                Result.success()
            }

            is LocationSender.SendResult.Retryable -> {
                LocationQueue.enqueueAll(appContext, points)
                if (runAttemptCount >= MAX_ATTEMPTS) Result.failure() else Result.retry()
            }

            is LocationSender.SendResult.Invalid -> {
                // Dropped intentionally — see class doc. Worker itself completed
                // (there is nothing more it can productively do with this batch).
                Result.success()
            }
        }
    }

    private fun stopTrackingAndClearAuth() {
        appContext.stopService(Intent(appContext, RaosLocationForegroundService::class.java))
        AuthBridge.clear()
        LocationQueue.clear(appContext) // no further writes should be attempted under a dead session
        WorkManager.getInstance(appContext).cancelUniqueWork(UNIQUE_WORK_NAME)
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "raos_location_sync"
        private const val MAX_ATTEMPTS = 6 // bounded — no infinite retry (A9)

        fun enqueue(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<RaosLocationSyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            // KEEP, not REPLACE/APPEND — avoid stacking duplicate sync jobs if the
            // service enqueues faster than WorkManager drains (A9: "no infinite
            // rapid retry", "avoid duplicate flood").
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK_NAME)
        }
    }
}
