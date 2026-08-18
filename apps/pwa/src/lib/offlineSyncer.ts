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
      // B2 fix: used to replay a raw upsert (client-decided staff_id/
      // branch_id/date/status) with a client-side "is existing newer"
      // pre-check that raced against concurrent writes. Now replays
      // through the same RPC the online path uses -- server re-derives
      // identity/branch/date/geofence/shift from auth.uid() + the queued
      // evidence (lat/lng/selfie/captured-at), and the RPC's own row lock
      // + "only update if incoming captured_at is newer" guard (see
      // sql/raos_090_attendance_canonical_rpc_DRAFT.sql) makes this
      // idempotent without a separate pre-check here.
      const { error } = await supabase.rpc('raos_attendance_check_in', item.payload as {
        p_lat: number | null
        p_lng: number | null
        p_selfie_url: string | null
        p_client_captured_at: string
      })
      if (error) return { ok: false, err: error.message }
      return { ok: true }
    }

    if (item.kind === 'raos_attendance_out') {
      // B2 fix: same as check-in above -- replays through
      // raos_attendance_check_out, idempotent server-side.
      const { error } = await supabase.rpc('raos_attendance_check_out', item.payload as {
        p_lat: number | null
        p_lng: number | null
        p_selfie_url: string | null
        p_client_captured_at: string
      })
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
