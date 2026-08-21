package com.rifim.raos.location

import android.content.Context
import org.json.JSONArray

/**
 * A9 — bounded local offline queue for unsent location points.
 *
 * Deliberately simple (SharedPreferences + JSON array, not a full DB) —
 * this queue only ever needs to hold a bounded window of points at the
 * configured capture interval.
 *
 * MAX_POINTS = 120 is not an arbitrary choice: it exactly matches
 * `raos_ingest_background_location`'s own hard cap (`too_many_points`
 * above 120 per call, confirmed live 2026-08-21) — draining the entire
 * queue always fits in exactly one RPC call, no batching/chunking needed
 * in RaosLocationSyncWorker.
 *
 * On reconnect, RaosLocationSyncWorker drains this FIFO and only sends
 * points still worth sending (see `isStillRelevant`) — avoids flooding the
 * backend with a burst of hours-stale points. The RPC itself additionally
 * rejects any point outside [now-2h, now+5m] server-side as defense in
 * depth, so a slightly-stale client clock can't slip through either.
 */
object LocationQueue {
    private const val PREFS = "raos_location_queue"
    private const val KEY_POINTS = "points"

    // Matches the RPC's own per-call cap exactly — see class doc.
    private const val MAX_POINTS = 120

    // A point older than this is no longer operationally meaningful (a
    // driver's location from 30+ minutes ago doesn't help live tracking) —
    // dropped rather than sent, per "send only still-relevant pending
    // points, avoid duplicate flood" (A9). Well inside the RPC's own 2h
    // server-side ceiling, so this is the binding constraint in practice.
    private const val MAX_POINT_AGE_MS = 30 * 60 * 1000L

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun enqueue(context: Context, point: RaosLocationPoint) {
        val arr = readArray(context)
        arr.put(point.toJson())
        writeArray(context, capToMax(arr))
    }

    /** Used to re-queue a batch that failed to send (Retryable/NoSession paths). */
    @Synchronized
    fun enqueueAll(context: Context, points: List<RaosLocationPoint>) {
        val arr = readArray(context)
        points.forEach { arr.put(it.toJson()) }
        writeArray(context, capToMax(arr))
    }

    private fun capToMax(arr: JSONArray): JSONArray {
        if (arr.length() <= MAX_POINTS) return arr
        // Drop oldest first — FIFO, oldest points are least operationally useful.
        val trimmed = JSONArray()
        val dropCount = arr.length() - MAX_POINTS
        for (i in dropCount until arr.length()) trimmed.put(arr.get(i))
        return trimmed
    }

    @Synchronized
    fun drainStillRelevant(context: Context): List<RaosLocationPoint> {
        val arr = readArray(context)
        val now = System.currentTimeMillis()
        val out = mutableListOf<RaosLocationPoint>()
        for (i in 0 until arr.length()) {
            val point = RaosLocationPoint.fromJson(arr.getJSONObject(i))
            val capturedAtMs = runCatching {
                java.time.Instant.parse(point.capturedAtIso).toEpochMilli()
            }.getOrDefault(0L)
            if (now - capturedAtMs <= MAX_POINT_AGE_MS) out.add(point)
            // else: silently dropped, stale — not an error, not retried forever (A9).
        }
        writeArray(context, JSONArray()) // queue drained regardless of relevance filtering
        return out
    }

    @Synchronized
    fun clear(context: Context) {
        writeArray(context, JSONArray())
    }

    fun size(context: Context): Int = readArray(context).length()

    private fun readArray(context: Context): JSONArray {
        val raw = prefs(context).getString(KEY_POINTS, "[]") ?: "[]"
        return runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
    }

    private fun writeArray(context: Context, arr: JSONArray) {
        prefs(context).edit().putString(KEY_POINTS, arr.toString()).apply()
    }
}
