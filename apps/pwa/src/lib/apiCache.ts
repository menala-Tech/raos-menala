/**
 * apiCache — Cache-first helper untuk PWA RAOS
 *
 * Mirror pattern shared/api-cache.js di Rifim-OS Portal, tapi versi React/TS:
 *   - `getCached<T>(key, fetcher, opts)` — cache-first read + background refresh
 *   - `useCachedQuery<T>(key, fetcher, opts)` — React hook wrapper
 *   - `cacheInvalidate(key)` / `cacheClearAll()` — invalidation
 *
 * Cocok untuk data yang tidak realtime-critical (dashboard stats, riwayat,
 * KPI, laporan). JANGAN pakai untuk chat, notifikasi, scan validation —
 * pakai supabase realtime langsung.
 *
 * Storage: localStorage. TTL default 30 menit, override per key.
 * SSR-safe: guard `typeof window !== 'undefined'`.
 *
 * Contoh:
 * ```tsx
 * const { data, loading, error, refresh } = useCachedQuery(
 *   ['dashboard-stats', user.id],
 *   () => supabase.from('user_profiles').select('...').eq('id', user.id).single(),
 *   { ttlMs: 15 * 60 * 1000 }
 * )
 * ```
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const CACHE_PREFIX = 'raos_cache_'
const DEFAULT_TTL_MS = 30 * 60 * 1000 // 30 menit

// TTL default per prefix (kalau key start dengan ini). Match pola Rifim-OS.
const TTL_BY_PREFIX: Record<string, number> = {
  'branches':    60 * 60 * 1000,  // 1 jam
  'shifts':      60 * 60 * 1000,
  'user':        30 * 60 * 1000,
  'staff':       30 * 60 * 1000,
  'driver':      60 * 60 * 1000,
  'dashboard':   15 * 60 * 1000,
  'kpi':         30 * 60 * 1000,
  'riwayat':     15 * 60 * 1000,
  'saldo':       10 * 60 * 1000,  // saldo cepat berubah
  'attendance':  15 * 60 * 1000,
  'notifications': 60 * 1000,     // 1 menit
}

function _pickTTL(key: string): number {
  const prefix = key.split(/[-_.]/)[0].toLowerCase()
  return TTL_BY_PREFIX[prefix] ?? DEFAULT_TTL_MS
}

type CacheKey = string | readonly (string | number | boolean | null | undefined)[]

function _serializeKey(key: CacheKey): string {
  if (typeof key === 'string') return key
  return key.map(k => k == null ? '_' : String(k)).join('|')
}

type CachedEnvelope<T> = {
  at: number
  data: T
}

/**
 * Low-level cache read — bypass hook, cocok untuk pattern manual 2-phase
 * (instant render kalau cache hit, kemudian fetch fresh di background).
 * Return null kalau tidak ada / expired.
 */
export function cacheReadSync<T>(key: CacheKey, ttlMs?: number): T | null {
  return cacheRead<T>(_serializeKey(key), ttlMs)
}

/**
 * Low-level cache write — pakai saat mutasi manual (setelah fetch fresh
 * di useEffect atau setelah delete/update row).
 */
export function cacheWriteSync<T>(key: CacheKey, data: T): void {
  cacheWrite<T>(_serializeKey(key), data)
}

function cacheRead<T>(key: string, ttlMs?: number): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const obj = JSON.parse(raw) as CachedEnvelope<T>
    if (!obj.at) return null
    const effective = ttlMs ?? _pickTTL(key)
    if (Date.now() - obj.at > effective) return null
    return obj.data
  } catch {
    return null
  }
}

function cacheWrite<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }))
  } catch {
    /* quota exceeded — silent */
  }
}

/**
 * Invalidate 1 key (force re-fetch di next useCachedQuery mount).
 */
export function cacheInvalidate(key: CacheKey): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(CACHE_PREFIX + _serializeKey(key))
  } catch {
    // silent
  }
}

/**
 * Hapus semua cache RAOS (mis. saat logout).
 * Return: jumlah key yang dihapus.
 */
export function cacheClearAll(): number {
  if (typeof window === 'undefined') return 0
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX)) toRemove.push(k)
    }
    toRemove.forEach(k => localStorage.removeItem(k))
    return toRemove.length
  } catch {
    return 0
  }
}

/**
 * Low-level: baca cache atau fetch fresh + tulis cache. Tanpa hook.
 * Cocok untuk service worker / one-shot fetch di event handler.
 */
export async function getCached<T>(
  key: CacheKey,
  fetcher: () => Promise<T>,
  opts: { ttlMs?: number; forceRefresh?: boolean } = {}
): Promise<T> {
  const k = _serializeKey(key)
  if (!opts.forceRefresh) {
    const cached = cacheRead<T>(k, opts.ttlMs)
    if (cached != null) return cached
  }
  const fresh = await fetcher()
  cacheWrite(k, fresh)
  return fresh
}

// ═══════════════════════════════════════════════════════════════════════
// React hook — cache-first render + background refresh
// ═══════════════════════════════════════════════════════════════════════

export type UseCachedQueryOpts = {
  ttlMs?: number
  /** Skip fetch on mount kalau true (mis. dependency belum siap) */
  enabled?: boolean
  /** Auto-refresh interval (ms). Fire hanya kalau document visible. */
  refreshIntervalMs?: number
  /** Refetch on window focus (default false — hemat quota) */
  refetchOnFocus?: boolean
}

export type CachedQueryResult<T> = {
  data: T | null
  loading: boolean
  fromCache: boolean
  error: Error | null
  refresh: () => Promise<void>
}

/**
 * Cache-first React hook.
 *
 * Behavior:
 *   1. Mount: baca cache. Kalau ada → set data + fromCache=true, loading=false.
 *   2. Fire background fetch. Update data + fromCache=false setelah selesai.
 *   3. Kalau cache tidak ada → loading=true, fetch fresh, render setelahnya.
 *   4. refreshIntervalMs → setInterval visibility-aware.
 *
 * Best practice key: pakai array supaya composite key jelas dan
 * berubah otomatis kalau dependency berubah — mis. `['kpi', staffId, month]`.
 */
export function useCachedQuery<T>(
  key: CacheKey,
  fetcher: () => Promise<T>,
  opts: UseCachedQueryOpts = {}
): CachedQueryResult<T> {
  const { ttlMs, enabled = true, refreshIntervalMs, refetchOnFocus = false } = opts
  const serializedKey = _serializeKey(key)

  const [data, setData] = useState<T | null>(() =>
    enabled ? cacheRead<T>(serializedKey, ttlMs) : null
  )
  const [loading, setLoading] = useState<boolean>(() => enabled && cacheRead<T>(serializedKey, ttlMs) == null)
  const [fromCache, setFromCache] = useState<boolean>(() =>
    enabled && cacheRead<T>(serializedKey, ttlMs) != null
  )
  const [error, setError] = useState<Error | null>(null)

  // Ref: fetcher yang latest supaya effect tidak re-fire karena identity berubah
  const fetcherRef = useRef(fetcher)
  useEffect(() => { fetcherRef.current = fetcher }, [fetcher])

  const runFetch = useCallback(async (force = false) => {
    if (!enabled) return
    // Kalau force = true, tampilkan loading (kalau tidak ada data sama sekali)
    if (data == null || force) setLoading(true)
    try {
      const fresh = await fetcherRef.current()
      cacheWrite(serializedKey, fresh)
      setData(fresh)
      setFromCache(false)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [enabled, serializedKey, data])

  // Mount + key-change: kalau ada cache pakai, kick background refresh. Kalau tidak, fetch fresh.
  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    const cached = cacheRead<T>(serializedKey, ttlMs)
    if (cached != null) {
      setData(cached)
      setFromCache(true)
      setLoading(false)
      // Background refresh, tanpa loading state
      void runFetch(false)
    } else {
      void runFetch(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedKey, enabled])

  // Auto-refresh interval (visibility-aware)
  useEffect(() => {
    if (!refreshIntervalMs || !enabled) return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void runFetch(false)
    }, refreshIntervalMs)
    return () => clearInterval(id)
  }, [refreshIntervalMs, enabled, runFetch])

  // Refetch on focus (opt-in)
  useEffect(() => {
    if (!refetchOnFocus || !enabled) return
    const onFocus = () => { void runFetch(false) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refetchOnFocus, enabled, runFetch])

  return {
    data,
    loading,
    fromCache,
    error,
    refresh: () => runFetch(true),
  }
}
