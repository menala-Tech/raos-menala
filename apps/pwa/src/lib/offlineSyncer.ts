/**
 * offlineSyncer — drain queue saat online.
 * Dipanggil dari OfflineQueueBanner + navigator online event listener.
 */
import { supabase } from './supabase'
import { listPending, markSynced, markFailed, type QueuedItem } from './offlineQueue'

let flushing = false

async function flushItem(item: QueuedItem): Promise<{ ok: boolean; err?: string }> {
  try {
    if (item.kind === 'raos_attendance_in') {
      const { error } = await supabase
        .from('raos_attendance')
        .upsert(item.payload, { onConflict: 'staff_id,date' })
      if (error) return { ok: false, err: error.message }
      return { ok: true }
    }
    if (item.kind === 'raos_attendance_out') {
      const { staff_id, date, ...updates } = item.payload as any
      const { error } = await supabase
        .from('raos_attendance')
        .update(updates)
        .eq('staff_id', staff_id)
        .eq('date', date)
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
