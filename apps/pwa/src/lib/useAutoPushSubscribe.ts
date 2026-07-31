'use client'

import { useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { isPushSupported, subscribePush } from './push'

const HEAL_FLAG = 'raos_push_heal_v1'

/**
 * Auto-subscribe idempotent (Opsi A push heal).
 *
 * Kondisi self-heal:
 * - Push didukung browser (SW + PushManager + Notification API).
 * - Notification.permission === 'granted' (user pernah izinkan).
 * - notifMaster !== false di localStorage `raos_prefs` (default ON).
 * - Session user login.
 * - Belum ada PushSubscription aktif ATAU sub aktif tapi belum tercatat
 *   di push_subscriptions (subscribePush() upsert by endpoint UNIQUE →
 *   idempotent).
 *
 * Fire diam-diam — tanpa alert / permission prompt (permission sudah
 * granted lebih dulu). Kalau gagal, hanya console.warn dari subscribePush().
 *
 * Guard: flag session storage `raos_push_heal_v1` supaya tidak spam
 * upsert per navigasi. Dijalankan sekali per session tab.
 */
export function useAutoPushSubscribe(): void {
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    if (!isPushSupported()) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    // Guard per-session: jangan repeat tiap navigasi
    try {
      if (sessionStorage.getItem(HEAL_FLAG) === '1') return
    } catch { /* private mode etc — proceed */ }

    // Cek prefs notifMaster (default true)
    let notifMaster = true
    try {
      const raw = localStorage.getItem('raos_prefs')
      if (raw) {
        const parsed = JSON.parse(raw) as { notifMaster?: boolean }
        if (parsed.notifMaster === false) notifMaster = false
      }
    } catch { /* keep default */ }
    if (!notifMaster) return

    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const r = await subscribePush()
      if (r.ok) {
        try { sessionStorage.setItem(HEAL_FLAG, '1') } catch {}
      }
      // Kalau gagal, jangan set flag → coba lagi next mount / reload.
    })()
  }, [])
}
