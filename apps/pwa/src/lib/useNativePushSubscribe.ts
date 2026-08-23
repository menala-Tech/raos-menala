'use client'

import { useEffect, useRef } from 'react'
import { subscribeNativePush } from './nativePush'

const NATIVE_HEAL_TS_KEY = 'raos_native_push_heal_v2'
const NATIVE_HEAL_MIN_INTERVAL_MS = 5 * 60 * 1000

function recentlyHealed(): boolean {
  try {
    const ts = Number(sessionStorage.getItem(NATIVE_HEAL_TS_KEY) ?? '0')
    return Number.isFinite(ts) && ts > 0 && Date.now() - ts < NATIVE_HEAL_MIN_INTERVAL_MS
  } catch {
    return false
  }
}

function markHealAttempt(): void {
  try { sessionStorage.setItem(NATIVE_HEAL_TS_KEY, String(Date.now())) } catch {}
}

/**
 * Auto-register FCM token on Capacitor Android when permission is already granted.
 * Mirrors the web auto-heal pattern but uses the native token path.
 * No-ops on browser (not a native platform).
 */
export function useNativePushSubscribe(): void {
  const runningRef = useRef(false)

  useEffect(() => {
    const heal = async (force = false) => {
      if (runningRef.current) return
      if (!force && recentlyHealed()) return

      runningRef.current = true
      try {
        const result = await subscribeNativePush()
        if (result.ok || result.reason === 'not_eligible' || result.reason === 'not_authenticated') {
          markHealAttempt()
        }
      } finally {
        runningRef.current = false
      }
    }

    void heal()
  }, [])
}
