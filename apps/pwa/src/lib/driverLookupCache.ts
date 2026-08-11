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

const CACHE_KEY = 'raos_driver_lookup_cache_v1'
const CACHE_TTL_MS = 30 * 60 * 1000
const MAX_STALE_MS = 24 * 60 * 60 * 1000

let memory: DriverCacheEnvelope | null = null
let refreshPromise: Promise<CachedDriverLookup[]> | null = null

function normalizeId(value: string): string {
  return value.trim().toUpperCase()
}

function loadEnvelope(): DriverCacheEnvelope | null {
  if (memory) return memory
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DriverCacheEnvelope
    if (parsed?.version !== 1 || !Array.isArray(parsed.drivers) || !parsed.storedAt) return null
    if (Date.now() - parsed.storedAt > MAX_STALE_MS) return null
    memory = parsed
    return parsed
  } catch {
    return null
  }
}

function saveEnvelope(drivers: CachedDriverLookup[]): void {
  const next: DriverCacheEnvelope = {
    version: 1,
    storedAt: Date.now(),
    drivers,
  }
  memory = next
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage quota/private mode; memory cache still helps this session.
  }
}

function mapDriverRow(row: {
  id: string
  driver_id: string
  name: string
  branch_id: string | null
  branches?: { name?: string | null } | null
}): CachedDriverLookup {
  return {
    id: row.id,
    driver_id: row.driver_id,
    name: row.name,
    branch_id: row.branch_id,
    branch_name: row.branches?.name ?? null,
  }
}

export function findDriverInCache(driverLoginId: string): CachedDriverLookup | null {
  const q = normalizeId(driverLoginId)
  if (!q) return null
  const envelope = loadEnvelope()
  if (!envelope) return null
  return envelope.drivers.find(driver => normalizeId(driver.driver_id) === q) ?? null
}

export function isDriverCacheFresh(): boolean {
  const envelope = loadEnvelope()
  return !!envelope && Date.now() - envelope.storedAt <= CACHE_TTL_MS
}

export async function fetchDriverDirect(driverLoginId: string): Promise<CachedDriverLookup | null> {
  const q = normalizeId(driverLoginId)
  if (!q) return null

  const { data, error } = await supabase
    .from('raos_drivers')
    .select('id, driver_id, name, branch_id, branches(name)')
    .eq('is_active', true)
    .eq('driver_id', q)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return mapDriverRow(data as {
    id: string
    driver_id: string
    name: string
    branch_id: string | null
    branches?: { name?: string | null } | null
  })
}

export async function refreshDriverCache(force = false): Promise<CachedDriverLookup[]> {
  if (!force && isDriverCacheFresh()) {
    return loadEnvelope()?.drivers ?? []
  }
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const { data, error } = await supabase
      .from('raos_drivers')
      .select('id, driver_id, name, branch_id, branches(name)')
      .eq('is_active', true)
      .order('driver_id', { ascending: true })

    if (error) throw error

    const drivers = (data ?? []).map(row =>
      mapDriverRow(row as {
        id: string
        driver_id: string
        name: string
        branch_id: string | null
        branches?: { name?: string | null } | null
      }),
    )

    saveEnvelope(drivers)
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
  const cached = findDriverInCache(driverLoginId)
  if (cached) {
    if (!isDriverCacheFresh()) {
      void refreshDriverCache(true).catch(() => {})
    }
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

export function clearDriverLookupCache(): void {
  memory = null
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(CACHE_KEY)
  } catch {}
}
