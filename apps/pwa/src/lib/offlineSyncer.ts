/**
 * offlineSyncer — drain queue saat online.
 * Dipanggil dari OfflineQueueBanner + navigator online event listener.
 */
import { supabase } from './supabase'
import { listPending, markSynced, markFailed, type QueuedItem } from './offlineQueue'

let flushing = false

/**
 * Upload semua blob dalam item (kalau ada) ke Storage. Key blob = kolom target
 * di payload → path hasil di-inject ke payload sebelum insert row DB.
 * Kalau upload gagal semua, item tetap fail dan retry berikutnya.
 */
async function uploadBlobs(item: QueuedItem): Promise<{ ok: boolean; err?: string }> {
  if (!item.blobs) return { ok: true }
  for (const [column, entry] of Object.entries(item.blobs)) {
    const { blob, contentType, targetBucket, pathHint } = entry
    const { error } = await supabase.storage.from(targetBucket).upload(pathHint, blob, {
      contentType, upsert: false,
    })
    // Kalau file dengan path sama sudah exist (duplicate replay), Supabase return
    // 409/StorageApiError — kita lewatkan karena path adalah kombinasi
    // user_id + timestamp, jarang collision kecuali replay.
    if (error && !String(error.message).toLowerCase().includes('exists')) {
      return { ok: false, err: `storage upload ${column}: ${error.message}` }
    }
    (item.payload as Record<string, unknown>)[column] = pathHint
  }
  return { ok: true }
}

async function flushItem(item: QueuedItem): Promise<{ ok: boolean; err?: string; skip?: boolean }> {
  try {
    // 1) Upload blob dulu (kalau ada) — hasil path override kolom di payload
    const blobRes = await uploadBlobs(item)
    if (!blobRes.ok) return blobRes

    if (item.kind === 'raos_attendance_in') {
      // Conflict resolver: server-side onConflict staff_id,date sudah handle
      // idempotent. Kalau replay dengan check_in_at lebih lama dari yang tersimpan,
      // Postgres akan overwrite — sengaja: client punya "otoritas" untuk absen
      // (staff punya niat pasti waktu itu). Untuk cegah data lebih baru
      // ke-overwrite oleh replay yang lebih lama, cek dulu:
      const { staff_id, date, check_in_at } = item.payload as any
      const { data: existing } = await supabase
        .from('raos_attendance')
        .select('check_in_at')
        .eq('staff_id', staff_id).eq('date', date).maybeSingle()
      if (existing?.check_in_at && existing.check_in_at >= check_in_at) {
        // Sudah ada absen yang lebih baru/sama waktu → skip (bukan error).
        return { ok: true, skip: true }
      }
      const { error } = await supabase
        .from('raos_attendance')
        .upsert(item.payload, { onConflict: 'staff_id,date' })
      if (error) return { ok: false, err: error.message }
      return { ok: true }
    }

    if (item.kind === 'raos_attendance_out') {
      const { staff_id, date, ...updates } = item.payload as any
      // Idempotent — check_out_at pasti belum ada (baru pertama absen pulang).
      // Kalau sudah ada check_out_at yang lebih lama, biarkan replay overwrite
      // (client authoritative). Tapi kalau server lebih baru, skip.
      const { data: existing } = await supabase
        .from('raos_attendance')
        .select('check_out_at')
        .eq('staff_id', staff_id).eq('date', date).maybeSingle()
      if (existing?.check_out_at && existing.check_out_at >= updates.check_out_at) {
        return { ok: true, skip: true }
      }
      const { error } = await supabase
        .from('raos_attendance')
        .update(updates)
        .eq('staff_id', staff_id)
        .eq('date', date)
      if (error) return { ok: false, err: error.message }
      return { ok: true }
    }

    if (item.kind === 'scan_order') {
      // scan_orders.scan_id UNIQUE — replay tabrakan cek dulu.
      const { scan_id } = item.payload as any
      const { data: existing } = await supabase
        .from('scan_orders').select('id').eq('scan_id', scan_id).maybeSingle()
      if (existing) return { ok: true, skip: true }

      // Resolve driver kalau saat scan offline belum sempat lookup.
      const payload = { ...(item.payload as any) }
      if (payload._needs_driver_lookup) {
        const hint = String(payload.driver_id_or_barcode ?? '').trim()
        delete payload.driver_id_or_barcode
        delete payload._needs_driver_lookup
        const { data: drv } = await supabase
          .from('raos_drivers')
          .select('id')
          .or(`barcode.eq.${hint},driver_id.eq.${hint}`)
          .eq('is_active', true)
          .maybeSingle()
        if (!drv) return { ok: false, err: `driver not found for barcode/id: ${hint}` }
        payload.driver_id = drv.id
      }

      const { error } = await supabase.from('scan_orders').insert(payload)
      if (error) return { ok: false, err: error.message }
      return { ok: true }
    }

    if (item.kind === 'chat_message') {
      // client_id (dari client) UNIQUE di chat_messages — cegah duplikat saat retry.
      const { client_id } = item.payload as any
      if (client_id) {
        const { data: existing } = await supabase
          .from('chat_messages').select('id').eq('client_id', client_id).maybeSingle()
        if (existing) return { ok: true, skip: true }
      }
      const { error } = await supabase.from('chat_messages').insert(item.payload)
      if (error) return { ok: false, err: error.message }
      return { ok: true }
    }

    if (item.kind === 'saldo_request') {
      const { error } = await supabase.rpc('raos_saldo_submit', item.payload as {
        p_client_id: string
        p_branch_id: string
        p_nominal: number
        p_room_id: string
        p_driver_id: string
      })
      if (error) return { ok: false, err: error.message }
      return { ok: true }
    }

    return { ok: false, err: `unknown kind: ${item.kind}` }
  } catch (e: any) {
    return { ok: false, err: String(e?.message ?? e) }
  }
}

export async function flushAll(): Promise<{ synced: number; failed: number; remaining: number }> {
  if (flushing) return { synced: 0, failed: 0, remaining: -1 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0, remaining: (await listPending()).length }
  }
  flushing = true
  try {
    const items = await listPending()
    let synced = 0
    let failed = 0
    for (const item of items) {
      const res = await flushItem(item)
      if (res.ok) {
        await markSynced(item.id!)
        synced++
      } else {
        await markFailed(item.id!, res.err ?? 'unknown')
        failed++
      }
    }
    const remaining = (await listPending()).length
    return { synced, failed, remaining }
  } finally {
    flushing = false
  }
}

/** Attach listener supaya begitu online, queue di-drain otomatis. */
export function installOnlineFlushListener(onFlushed?: (r: { synced: number; failed: number; remaining: number }) => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = async () => {
    const r = await flushAll()
    onFlushed?.(r)
  }
  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}
