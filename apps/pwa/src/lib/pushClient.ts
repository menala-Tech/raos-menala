import { supabase } from './supabase'

interface SendPushOpts {
  user_ids: string[]
  title: string
  body: string
  url?: string
  tag?: string
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
