package com.rifim.raos.location

import java.util.concurrent.atomic.AtomicReference

/**
 * A5 — Auth bridge, in-process only.
 *
 * Native code gets NO auth of its own: no hardcoded user id, no
 * service_role key, no Supabase anon/service key bundled in the app at
 * all beyond whatever the WebView itself already uses to talk to Supabase
 * (that key stays in the web bundle exactly as today — this class never
 * touches it). The ONLY thing the native foreground service is allowed to
 * send with a location write is the SAME user-scoped Supabase access
 * token the PWA's own `supabase-js` client is already holding for that
 * signed-in session.
 *
 * Flow:
 *  1. Web layer (apps/pwa/src/lib/supabase.ts) already listens for
 *     `supabase.auth.onAuthStateChange`. A thin addition there (NOT part
 *     of this native-only change set — see FILES CHANGED in the report)
 *     would call `RaosLocationBridge.setSessionToken({...})` on every
 *     SIGNED_IN/TOKEN_REFRESHED event, and
 *     `RaosLocationBridge.clearSessionToken()` on SIGNED_OUT.
 *  2. This class holds ONLY the current token in memory
 *     (AtomicReference, process lifetime only — cleared on process death,
 *     never written to SharedPreferences/disk in plaintext).
 *  3. RaosLocationForegroundService reads it here per write attempt. If
 *     null or expired, it does NOT write — it stops itself instead (A8).
 *
 * This mirrors exactly what the browser PWA already does (Supabase JS SDK
 * holds the session client-side, RLS enforces per-row scope server-side)
 * — no new trust boundary is introduced.
 */
object AuthBridge {
    private val current = AtomicReference<RaosSessionToken?>(null)

    fun set(token: RaosSessionToken) {
        current.set(token)
    }

    /** Called on logout, SIGNED_OUT, or any session-invalid signal from the web layer. */
    fun clear() {
        current.set(null)
    }

    fun currentValidTokenOrNull(): RaosSessionToken? {
        val token = current.get() ?: return null
        if (token.isExpired()) {
            current.set(null)
            return null
        }
        return token
    }
}
