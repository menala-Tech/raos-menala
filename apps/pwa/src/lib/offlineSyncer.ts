/**
 * offlineSyncer — drain queue saat online.
 * Dipanggil dari OfflineQueueBanner + navigator online event listener.
 */
import { supabase } from './supabase'
import { listPending, markSynced, markFailed, type QueuedItem } from './offlineQueue'

let flushing = false

async function uploadBlobs(item: QueuedItem): Promise<{ ok: boolean; err?: string }> {
  if (!item.blobs) return { ok: true }
  for (const [column, entry] of Object.entries(item.blobs)) {
    const { blob, contentType, targetBucket, pathHint } = entry
    const { error } = await supabase.storage.from(targetBucket).upload(pathHint, blob, {
      contentType, upsert: false,
    })
    if (error && !String(error.message).toLowerCase().includes('exists')) {
      return { ok: false, err: `storage upload ${column}: ${error.message}` }
    }
    ;(item.payload as Record<string, unknown>)[column] = pathHint
  }
  return { ok: true }
}

async function flushItem(item: QueuedItem): Promise<{ ok: boolean; err?: string; skip?: boolean }> {
  try {
    const blobRes = await uploadBlobs(item)
    if (!blobRes.ok) return blobRes

    if (item.kind === 'raos_attendance_in') {
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
      const payload=item.payload as any
      let driverRef=String(payload.driver_ref ?? payload.driver_id_or_barcode ?? '').trim()

      // Backward compatibility for queue items created by the pre-RPC client:
      // those items may contain only the internal raos_drivers UUID. Resolve it
      // to the canonical barcode/driver_id before calling the new RPC so a
      // software update cannot strand an already-queued Staff scan.
      if(!driverRef && payload.driver_id){
        const {data:drv,error:drvError}=await supabase
          .from('raos_drivers')
          .select('barcode,driver_id')
          .eq('id',String(payload.driver_id))
          .maybeSingle()
        if(drvError) return {ok:false,err:drvError.message}
        driverRef=String(drv?.barcode ?? drv?.driver_id ?? '').trim()
      }
      if(!driverRef) return {ok:false,err:'queued scan has no resolvable driver reference'}

      const { data, error } = await supabase.rpc('raos_submit_scan', {
        p_driver_ref: driverRef,
        p_lat: payload.latitude ?? null,
        p_lng: payload.longitude ?? null,
        p_client_scan_id: String(payload.scan_id ?? ''),
        p_client_captured_at: payload.captured_at ?? payload.scanned_at ?? null,
      })
      if (error) return { ok: false, err: error.message }
      if ((data as any)?.status === 'already_submitted') return { ok: true, skip: true }
      return { ok: true }
    }

    if (item.kind === 'chat_message') {
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

export function installOnlineFlushListener(onFlushed?: (r: { synced: number; failed: number; remaining: number }) => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = async () => {
    const r = await flushAll()
    onFlushed?.(r)
  }
  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}
