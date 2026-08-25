'use client'

import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { isPushSupported, subscribePush } from './push'

const HEAL_TS_KEY = 'raos_push_heal_v2'
const HEAL_MIN_INTERVAL_MS = 5 * 60 * 1000

function notificationsEnabledLocally(): boolean {
  try {
    const raw = localStorage.getItem('raos_prefs')
    if (!raw) return true
    const parsed = JSON.parse(raw) as { notifMaster?: boolean }
    return parsed.notifMaster !== false
  } catch {
    return true
  }
}

function recentlyHealed(): boolean {
  try {
    const ts = Number(sessionStorage.getItem(HEAL_TS_KEY) ?? '0')
    return Number.isFinite(ts) && ts > 0 && Date.now() - ts < HEAL_MIN_INTERVAL_MS
  } catch {
    return false
  }
}

function markHealAttempt(): void {
  try { sessionStorage.setItem(HEAL_TS_KEY, String(Date.now())) } catch {}
}

/**
 * Self-heal Web Push subscription sepanjang lifecycle PWA.
 *
 * Dibanding v1 yang hanya sekali per tab, v2 mencoba lagi secara throttle saat:
 * - app mount/reopen,
 * - koneksi kembali online,
 * - tab/PWA kembali visible,
 * - service worker controller berubah setelah update.
 *
 * Tidak pernah memunculkan permission prompt diam-diam: auto-heal hanya jalan
 * kalau browser sudah `granted`. `subscribePush()` sendiri memverifikasi role
 * eligible server-backed dan upsert endpoint idempotently.
 */
export function useAutoPushSubscribe(): void {
  const runningRef = useRef(false)

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    if (!isPushSupported()) return

    const heal = async (force = false) => {
      if (runningRef.current) return
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      if (!notificationsEnabledLocally()) return
      if (!force && recentlyHealed()) return

      runningRef.current = true
      try {
        const result = await subscribePush()
        // Mark success and stable non-retriable policy outcomes. Network/DB
        // failures stay unmarked so next lifecycle event may recover quickly.
        if (result.ok || result.reason === 'role_not_eligible' || result.reason === 'not_authenticated') {
          markHealAttempt()
        }
      } finally {
        runningRef.current = false
      }
    }

    void heal()

    const onOnline = () => { void heal(true) }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void heal()
    }
    const onControllerChange = () => { void heal(true) }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])
}

export function resetPushHealThrottle(): void {
  try { sessionStorage.removeItem(HEAL_TS_KEY) } catch {}
}
