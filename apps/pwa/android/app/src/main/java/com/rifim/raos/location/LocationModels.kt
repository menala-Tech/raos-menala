package com.rifim.raos.location

import org.json.JSONObject

/**
 * RAOS background location point — WIRE SHAPE ONLY.
 *
 * Matches the live production contract exactly (confirmed 2026-08-21 via
 * pg_get_functiondef against project vlievtojpmrbsmzlqswl):
 *   RPC public.raos_ingest_background_location(p_points jsonb)
 *   SECURITY INVOKER — server derives user_id = auth.uid() and
 *   branch_id = user_profiles.branch_id from the caller's own JWT. It does
 *   NOT accept user_id/branch_id in the payload at all (the RPC's
 *   jsonb_to_recordset() shape only destructures lat/lng/accuracy_m/
 *   captured_at — extra keys are ignored, but we still never emit them,
 *   per the explicit "Do NOT send user_id/branch_id" instruction).
 *
 * Server-side validation to keep in mind for callers of send():
 *   - lat in [-90,90], lng in [-180,180]
 *   - accuracy_m null OR in [0,5000]
 *   - captured_at within [now-2h, now+5m]
 *   - max 120 points per call (raises 'too_many_points' above that)
 *   - ALL points in the batch must pass validation or the whole batch is
 *     rejected ('invalid_point_payload') — there is no partial insert.
 */
data class RaosLocationPoint(
    val lat: Double,
    val lng: Double,
    val accuracyM: Float?,
    val capturedAtIso: String, // UTC ISO-8601
) {
    /** Exact wire shape sent to the RPC — lat/lng/accuracy_m/captured_at only. */
    fun toWireJson(): JSONObject = JSONObject().apply {
        put("lat", lat)
        put("lng", lng)
        if (accuracyM != null) put("accuracy_m", accuracyM) else put("accuracy_m", JSONObject.NULL)
        put("captured_at", capturedAtIso)
    }

    /** Local persistence only (LocationQueue) — same fields, just a named round-trip. */
    fun toJson(): JSONObject = toWireJson()

    companion object {
        fun fromJson(o: JSONObject): RaosLocationPoint = RaosLocationPoint(
            lat = o.getDouble("lat"),
            lng = o.getDouble("lng"),
            accuracyM = if (o.isNull("accuracy_m")) null else o.optDouble("accuracy_m").toFloat(),
            capturedAtIso = o.getString("captured_at"),
        )
    }
}

/**
 * A5/backend-wiring update (2026-08-21) — native credentials bridged from
 * the web layer's already-existing Supabase configuration. `publicKey` is
 * the anon/publishable key (NEXT_PUBLIC_SUPABASE_ANON_KEY) — NOT a
 * privileged secret, required by PostgREST as the `apikey` header on every
 * request regardless of the bearer token. `accessToken` is the signed-in
 * user's own session token — the only thing that determines what the RPC
 * is allowed to do (SECURITY INVOKER + RLS).
 *
 * NEVER holds: service_role key, SUPABASE_SERVICE_KEY, or any
 * client-supplied user_id/branch_id override — the server derives both
 * from the token itself.
 */
data class RaosSessionToken(
    val supabaseUrl: String,
    val publicKey: String,
    val accessToken: String,
    val userId: String, // local bookkeeping/status display only — never sent in the point payload
    val branchId: String?, // local bookkeeping/status display only — never sent in the point payload
    val expiresAtEpochSeconds: Long,
) {
    fun isExpired(nowEpochSeconds: Long = System.currentTimeMillis() / 1000): Boolean =
        nowEpochSeconds >= expiresAtEpochSeconds
}
