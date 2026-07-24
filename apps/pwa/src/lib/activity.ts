import { supabase } from './supabase'

/**
 * logActivity — insert baris ke public.activity_logs.
 *
 * Policy Supabase:
 * - INSERT: siapapun yang login (auth.uid() IS NOT NULL)
 * - SELECT: hanya admin/direksi (via get_my_role() RLS)
 *
 * Dipanggil dari action utama user: scan barcode, absensi masuk/pulang,
 * validasi scan admin, dll. Fire-and-forget — tidak block UI. Kalau
 * gagal insert (mis. offline), silent log ke console — bukan critical
 * path, cegah error mengganggu user experience.
 */
export async function logActivity(action: string, detail?: string) {
  try {
    // Pakai getSession() bukan getUser() — getSession baca localStorage
    // langsung (fast, offline-friendly). getUser hit Auth server yang bisa
    // timeout/fail meski session valid → activity_logs jarang terisi.
    // Pattern sama seperti lib/push.ts (fix sesi 15) dan lib/pushClient.ts.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('activity_logs').insert({
      user_id: session.user.id,
      action,
      detail: detail ?? null,
    })
    if (error) {
      console.warn('[activity] insert gagal (non-critical):', error.message, { action })
    }
  } catch (e) {
    console.warn('[activity] exception (non-critical):', e)
  }
}
