import { supabase } from './supabase'
import { isNotificationEligibleRole } from './notificationPolicy'

/**
 * Web Push (VAPID) — tanpa Firebase.
 *
 * Recipient policy is fail-closed: hanya staff, koordinator, admin, driver.
 * Server-side enforcement tetap authoritative; client check di sini mencegah
 * role excluded membuat subscription baru / memunculkan permission prompt.
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

async function currentUserMayReceivePush(): Promise<{
  ok: boolean
  userId?: string
  reason?: string
}> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { ok: false, reason: 'not_authenticated' }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', session.user.id)
    .single()

  if (error || !profile) return { ok: false, reason: 'profile_not_found' }
  if (profile.is_active !== true || !isNotificationEligibleRole(profile.role)) {
    return { ok: false, reason: 'role_not_eligible' }
  }

  return { ok: true, userId: session.user.id }
}

/**
 * Minta izin notifikasi + subscribe PushManager + simpan ke Supabase.
 * Aman dipanggil berulang (dedup by endpoint UNIQUE di DB).
 */
export async function subscribePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'vapid_public_key_missing' }

  try {
    // Cek role SEBELUM permission prompt. Role excluded tidak boleh membuat
    // subscription walaupun browser/device mendukung Web Push.
    const eligibility = await currentUserMayReceivePush()
    if (!eligibility.ok || !eligibility.userId) {
      return { ok: false, reason: eligibility.reason ?? 'role_not_eligible' }
    }

    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return { ok: false, reason: 'permission_denied' }
    }

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
      })
    }

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'invalid_push_subscription' }
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: eligibility.userId,
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
