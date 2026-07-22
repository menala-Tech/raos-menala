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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('activity_logs').insert({
      user_id: user.id,
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
