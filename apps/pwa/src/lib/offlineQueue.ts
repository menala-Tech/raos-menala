/**
 * offlineQueue — IndexedDB-backed queue untuk mutation yang gagal karena offline.
 *
 * Scope MVP (sesi 17): raos_attendance (in/out). Sesi 18 extend ke scan_orders +
 * chat_messages. Belum handle: photo blob upload chain, conflict resolver.
 *
 * Flow:
 *   1. Client submit mutation → wrapper `tryOrQueue()`
 *   2. Kalau online + Supabase OK → langsung persist, done
 *   3. Kalau offline / network error → append ke IDB store 'pending' + return
 *      "queued" — UI kasih feedback "akan sync saat online"
 *   4. Saat `online` event fire (atau app open dengan queue > 0) → `flushAll()`
 *      drain FIFO, retry Supabase, delete kalau sukses, biarkan kalau masih fail
 *
 * Kolom lat/lng/foto disimpan sebagai payload JSON — foto (Blob) tidak
 * di-queue karena bucket Storage butuh upload endpoint. Kalau offline,
 * absen di-queue tanpa foto, foto null → is_location_valid & selfie tetap
 * direkam apa adanya (fallback: catat "queued_no_photo" di detail biar
 * koordinator tahu).
 */
import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'raos_offline'
const DB_VERSION = 1

export type QueueKind = 'raos_attendance_in' | 'raos_attendance_out'

export interface QueuedItem {
  id?: number
  kind: QueueKind
  payload: Record<string, unknown>
  createdAt: number
  lastTriedAt?: number
  attempts: number
  lastError?: string
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
  if (typeof window === 'undefined') {
    throw new Error('offlineQueue can only be used in browser')
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending')) {
          const store = db.createObjectStore('pending', {
            keyPath: 'id',
            autoIncrement: true,
          })
          store.createIndex('createdAt', 'createdAt')
        }
      },
    })
  }
  return dbPromise
}

export async function enqueue(kind: QueueKind, payload: Record<string, unknown>): Promise<number> {
  const db = await getDB()
  const item: QueuedItem = {
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  }
  return (await db.add('pending', item)) as number
}

export async function pendingCount(): Promise<number> {
  const db = await getDB()
  return db.count('pending')
}

export async function listPending(): Promise<QueuedItem[]> {
  const db = await getDB()
  return db.getAllFromIndex('pending', 'createdAt')
}

export async function markSynced(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('pending', id)
}

export async function markFailed(id: number, err: string): Promise<void> {
  const db = await getDB()
  const item = await db.get('pending', id)
  if (!item) return
  item.attempts += 1
  item.lastTriedAt = Date.now()
  item.lastError = err.slice(0, 200)
  await db.put('pending', item)
}

/**
 * Deteksi apakah error dari Supabase adalah "network offline / unreachable"
 * (harus di-queue) atau error lain (mis. constraint violation — jangan queue,
 * lempar balik).
 */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === 'object') {
    const e = err as { message?: string; code?: string }
    const msg = String(e.message ?? '').toLowerCase()
    if (msg.includes('failed to fetch')) return true
    if (msg.includes('network')) return true
    if (msg.includes('load failed')) return true
    if (e.code === 'NETWORK_ERROR') return true
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  return false
}
