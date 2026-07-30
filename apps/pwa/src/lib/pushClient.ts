import { supabase } from './supabase'

interface SendPushOpts {
  user_ids: string[]
  title: string
  body: string
  url?: string
  tag?: string
  /**
   * Kategori push untuk filter di Edge Function berdasarkan notification_prefs
   * target user. Kalau kosong, semua target kena push (dipakai test push admin).
   * Valid: 'scan_berhasil' | 'scan_pending' | 'validasi_koordinator' |
   *        'pengingat_absen' | 'pengumuman' | 'chat_room'
   */
  kategori?: string
}

/**
 * Invoke Edge Function `raos-send-push` dari client. Fire-and-forget:
 * jangan await hasil, cukup log kalau ada error. Client action harus
 * tetap sukses meski push gagal (tidak boleh block UX).
 *
 * Auth: Bearer session.access_token. Edge Function verify_jwt=true +
 * role check admin/management/direksi. Kalau caller staff biasa, push
 * di-reject dengan 403 role_not_allowed — jadi trigger dari staff
 * (mis. scan barcode) TIDAK bisa langsung invoke; harus lewat admin
 * validate atau lewat DB trigger.
 *
 * Untuk kasus staff → push (mis. new chat message ke member lain),
 * gunakan RPC atau DB trigger sisi server, bukan client-side invoke.
 * Client-side invoke di sini dipakai HANYA untuk role admin/koord/direksi.
 */
export async function invokePush(opts: SendPushOpts): Promise<void> {
  try {
    if (!opts.user_ids || opts.user_ids.length === 0) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/raos-send-push`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(opts),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      console.warn('[push] invoke gagal:', res.status, j)
    }
  } catch (e) {
    console.warn('[push] exception (non-critical):', e)
  }
}

interface CreateNotifOpts {
  userIds: string[]
  title: string
  body: string
  type?: string           // e.g. 'saldo_request', 'queue_called'
  payloadType?: string    // e.g. 'saldo', 'queue', 'attendance'
  priority?: 'critical' | 'high' | 'normal' | 'low'
  channel?: 'push' | 'in_app' | 'chat' | 'whatsapp' | 'email'
  data?: Record<string, unknown>
  dedupKey?: string       // grouping identical events dalam window
  dedupWindowSec?: number
  expiresInSec?: number
}

/**
 * Central write RPC untuk generate notification in-app SAJA (tanpa fire push).
 * Dipakai fitur yang tidak butuh push notif — misal audit trail, dashboard
 * alert, konfirmasi UI. Kalau butuh push juga, pakai invokePush yang
 * secara internal call raos_dispatch_push (auto-insert in-app row).
 *
 * Dedup: kalau dedupKey sama dan created_at < 30s (default), row existing
 * di-UPDATE bukan INSERT baru → cegah spam.
 */
export async function createNotification(opts: CreateNotifOpts): Promise<string[]> {
  try {
    if (!opts.userIds?.length) return []
    const { data, error } = await supabase.rpc('raos_create_notification', {
      p_user_ids: opts.userIds,
      p_title: opts.title,
      p_body: opts.body,
      p_type: opts.type ?? null,
      p_payload_type: opts.payloadType ?? null,
      p_priority: opts.priority ?? 'normal',
      p_channel: opts.channel ?? 'in_app',
      p_data: opts.data ?? {},
      p_dedup_key: opts.dedupKey ?? null,
      p_dedup_window_sec: opts.dedupWindowSec ?? 30,
      p_expires_in_sec: opts.expiresInSec ?? null,
    })
    if (error) { console.warn('[createNotification] gagal:', error); return [] }
    return (data ?? []) as string[]
  } catch (e) {
    console.warn('[createNotification] exception:', e)
    return []
  }
}
