package com.rifim.raos.location

import android.util.Log
import java.io.BufferedOutputStream
import javax.net.ssl.HttpsURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/**
 * A6 — LIVE (2026-08-21). Backend contract confirmed against production
 * Supabase (project vlievtojpmrbsmzlqswl) — see LocationModels.kt doc for
 * the full audit. Wired to:
 *
 *   POST {supabaseUrl}/rest/v1/rpc/raos_ingest_background_location
 *   Headers: apikey: <anon/publishable key>, Authorization: Bearer <user access token>
 *   Body: {"p_points": [{lat,lng,accuracy_m,captured_at}, ...]}  -- NEVER user_id/branch_id.
 *
 * `apikey` is the Supabase anon/publishable key — required by the
 * PostgREST gateway on every request, NOT a privileged secret (same key
 * the web bundle already ships as NEXT_PUBLIC_SUPABASE_ANON_KEY). This
 * file never touches SUPABASE_SERVICE_KEY / service_role in any form.
 */
object LocationSender {
    private const val TAG = "RaosLocationSender"
    private const val RPC_PATH = "rest/v1/rpc/raos_ingest_background_location"

    sealed class SendResult {
        /** 2xx — caller should drop the transmitted batch from the local queue. */
        object Success : SendResult()
        /** No valid session held at all — caller should not attempt a network call. */
        object NoSession : SendResult()
        /**
         * 401/403 — token is invalid/expired/rejected by RLS. Per instruction: stop
         * tracking, clear native auth state, do NOT retry with the same token.
         */
        object AuthInvalid : SendResult()
        /**
         * 408/429/5xx or a network-level exception — transient. Caller should keep
         * the batch queued and let WorkManager backoff retry.
         */
        data class Retryable(val httpCode: Int?, val message: String) : SendResult()
        /**
         * Any other 4xx (400/422 'invalid_point_payload', 'too_many_points',
         * 'role_not_allowed', 'branch_not_assigned', 'profile_inactive', etc.) —
         * the payload itself is bad or the account can't write at all right now.
         * Retrying the SAME payload will fail identically forever, so the caller
         * should drop it (log, do not requeue) rather than infinite-retry.
         */
        data class Invalid(val httpCode: Int, val message: String) : SendResult()
    }

    /**
     * Sends up to 120 points (the RPC's own hard cap) using the CALLER's own
     * Supabase access token + the public anon key. Never sends user_id/branch_id —
     * the server derives both from the token (auth.uid() -> user_profiles.branch_id).
     */
    fun send(points: List<RaosLocationPoint>): SendResult {
        if (points.isEmpty()) return SendResult.Success
        val token = AuthBridge.currentValidTokenOrNull() ?: return SendResult.NoSession

        return try {
            val url = URL("${token.supabaseUrl.trimEnd('/')}/$RPC_PATH")
            val conn = url.openConnection() as HttpsURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            // PostgREST gateway requires `apikey` on every call regardless of the
            // bearer token — this is the public anon/publishable key, not a secret.
            conn.setRequestProperty("apikey", token.publicKey)
            // The ONLY thing that actually authorizes this write (SECURITY INVOKER + RLS).
            conn.setRequestProperty("Authorization", "Bearer ${token.accessToken}")
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000

            val pointsArray = JSONArray()
            points.forEach { pointsArray.put(it.toWireJson()) }
            val payload = JSONObject().put("p_points", pointsArray).toString().toByteArray(Charsets.UTF_8)

            BufferedOutputStream(conn.outputStream).use { it.write(payload) }

            val code = conn.responseCode
            when {
                code in 200..299 -> SendResult.Success
                code == 401 || code == 403 -> {
                    Log.w(TAG, "Location batch rejected HTTP $code — auth invalid, stopping tracking")
                    SendResult.AuthInvalid
                }
                code == 408 || code == 429 || code in 500..599 -> {
                    val msg = readError(conn)
                    Log.w(TAG, "Location batch transient failure HTTP $code: $msg")
                    SendResult.Retryable(code, msg)
                }
                else -> {
                    val msg = readError(conn)
                    Log.w(TAG, "Location batch invalid payload/state HTTP $code: $msg — dropping, not retrying")
                    SendResult.Invalid(code, msg)
                }
            }
        } catch (e: Exception) {
            // Network-level failure (no connectivity, DNS, timeout, TLS, etc.) —
            // always transient/retryable, never treated as an auth or payload problem.
            Log.w(TAG, "Location batch send exception (retryable): ${e.message}", e)
            SendResult.Retryable(null, e.message ?: "network_error")
        }
    }

    private fun readError(conn: HttpsURLConnection): String =
        runCatching { conn.errorStream?.bufferedReader()?.readText() }.getOrNull() ?: "unknown"
}
