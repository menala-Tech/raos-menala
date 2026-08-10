import { supabase } from '@/lib/supabase'

export interface CachedDriverLookup {
  id: string
  driver_id: string
  name: string
  branch_id: string | null
  branch_name: string | null
}

interface DriverCacheEnvelope {
  version: 1
  storedAt: number
  drivers: CachedDriverLookup[]
}

const CACHE_PREFIX = 'raos_driver_lookup_cache_v2:'
const CACHE_TTL_MS = 30 * 60 * 1000
const MAX_STALE_MS = 24 * 60 * 60 * 1000

let memory: DriverCacheEnvelope | null = null
let memoryScope: string | null = null
let refreshPromise: Promise<CachedDriverLookup[]> | null = null

async function getScopeId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) throw new Error('driver_cache_session_missing')
  return session.user.id
}

function cacheKey(scopeId: string): string {
  return CACHE_PREFIX + scopeId
}

function normalizeId(value: string): string {
  return value.trim().toUpperCase()
}

function loadEnvelope(scopeId: string): DriverCacheEnvelope | null {
  if (memory && memoryScope === scopeId) return memory
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(cacheKey(scopeId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DriverCacheEnvelope
    if (parsed?.version !== 1 || !Array.isArray(parsed.drivers) || !parsed.storedAt) return null
    if (Date.now() - parsed.storedAt > MAX_STALE_MS) {
      window.localStorage.removeItem(cacheKey(scopeId))
      return null
    }
    memory = parsed
    memoryScope = scopeId
    return parsed
  } catch {
    return null
  }
}

function saveEnvelope(scopeId: string, drivers: CachedDriverLookup[]): void {
  const next: DriverCacheEnvelope = { version: 1, storedAt: Date.now(), drivers }
  memory = next
  memoryScope = scopeId
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(cacheKey(scopeId), JSON.stringify(next))
  } catch {
    // localStorage full/private mode: memory cache tetap bekerja.
  }
}

function findDriverInEnvelope(scopeId: string, driverLoginId: string): CachedDriverLookup | null {
  const q = normalizeId(driverLoginId)
  if (!q) return null
  const envelope = loadEnvelope(scopeId)
  if (!envelope) return null
  return envelope.drivers.find(d => normalizeId(d.driver_id) === q) ?? null
}

function isEnvelopeFresh(scopeId: string): boolean {
  const envelope = loadEnvelope(scopeId)
  return !!envelope && Date.now() - envelope.storedAt <= CACHE_TTL_MS
}

export async function fetchDriverDirect(driverLoginId: string): Promise<CachedDriverLookup | null> {
  const q = normalizeId(driverLoginId)
  if (!q) return null

  const qEsc = q.replace(/[,()\"]/g, '')
  const { data, error } = await supabase
    .from('raos_drivers')
    .select('id, driver_id, name, branch_id, branches(name)')
    .eq('is_active', true)
    .or(`driver_id.eq.${qEsc},driver_id.ilike.${qEsc}`)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const branchRel = (data as unknown as { branches?: { name?: string | null } | null }).branches
  return {
    id: data.id,
    driver_id: data.driver_id,
    name: data.name,
    branch_id: data.branch_id,
    branch_name: branchRel?.name ?? null,
  }
}

/**
 * Warm cache per Supabase user. Data tetap dibatasi RLS sehingga cache tidak
 * pernah memperluas scope cabang/role. Key localStorage memakai user id agar
 * data user sebelumnya tidak bocor ke sesi berikutnya pada device bersama.
 */
export async function refreshDriverCache(force = false): Promise<CachedDriverLookup[]> {
  const scopeId = await getScopeId()
  if (!force && isEnvelopeFresh(scopeId)) return loadEnvelope(scopeId)?.drivers ?? []
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const { data, error } = await supabase
      .from('raos_drivers')
      .select('id, driver_id, name, branch_id, branches(name)')
      .eq('is_active', true)
      .order('driver_id', { ascending: true })

    if (error) throw error

    const drivers: CachedDriverLookup[] = (data ?? []).map(row => {
      const branchRel = (row as unknown as { branches?: { name?: string | null } | null }).branches
      return {
        id: row.id,
        driver_id: row.driver_id,
        name: row.name,
        branch_id: row.branch_id,
        branch_name: branchRel?.name ?? null,
      }
    })

    saveEnvelope(scopeId, drivers)
    return drivers
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

export async function lookupDriverCached(driverLoginId: string): Promise<{
  driver: CachedDriverLookup | null
  source: 'cache' | 'network'
}> {
  const scopeId = await getScopeId()
  const cached = findDriverInEnvelope(scopeId, driverLoginId)
  if (cached) {
    if (!isEnvelopeFresh(scopeId)) void refreshDriverCache(true).catch(() => {})
    return { driver: cached, source: 'cache' }
  }

  const direct = await fetchDriverDirect(driverLoginId)
  void refreshDriverCache(false).catch(() => {})
  return { driver: direct, source: 'network' }
}

export function primeDriverCache(): void {
  void refreshDriverCache(false).catch(err => {
    console.warn('[driverLookupCache] warm cache gagal', err)
  })
}

export async function clearDriverLookupCache(): Promise<void> {
  memory = null
  memoryScope = null
  if (typeof window === 'undefined') return
  try {
    const scopeId = await getScopeId()
    window.localStorage.removeItem(cacheKey(scopeId))
  } catch {
    try {
      const keys: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
      }
      keys.forEach(key => window.localStorage.removeItem(key))
    } catch {}
  }
}
