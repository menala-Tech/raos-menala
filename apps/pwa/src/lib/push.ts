import { supabase } from './supabase'

/**
 * Web Push (VAPID) — tanpa Firebase, mengikuti pola isisaldo.
 *
 * Setup:
 * 1. Generate VAPID keypair: `npx web-push generate-vapid-keys`
 * 2. Simpan public key di env `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
 * 3. Simpan private key di Supabase Secret `VAPID_PRIVATE_KEY` (untuk
 *    Edge Function kirim push, TIDAK boleh expose ke client)
 * 4. Deploy Edge Function `send-push` yang trigger web-push kirim ke
 *    subscriber. Trigger event: mis. scan_orders UPDATE ke 'valid',
 *    absensi reminder cron, chat_messages INSERT untuk mention, dst.
 *
 * SW handler (public/sw.js — extend dari next-pwa) render notification
 * dengan requireInteraction + vibrate supaya tetap muncul di lock screen
 * Android + banner iOS.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function pushPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Minta izin notifikasi + subscribe PushManager + simpan ke Supabase.
 * Aman dipanggil berulang (dedup by endpoint UNIQUE di DB).
 */
export async function subscribePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'vapid_public_key_missing' }

  try {
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return { ok: false, reason: 'permission_denied' }
    }

    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
    })
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, reason: 'not_authenticated' }

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })

    if (error) {
      console.warn('[push] upsert gagal:', error.message)
      return { ok: false, reason: error.message }
    }
    return { ok: true }
  } catch (e: any) {
    console.warn('[push] subscribe exception:', e?.message)
    return { ok: false, reason: e?.message ?? 'unknown' }
  }
}

/** Unsubscribe + hapus dari Supabase */
export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    }
  } catch (e) {
    console.warn('[push] unsubscribe exception:', e)
  }
}
