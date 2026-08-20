import { cacheClearAll } from './apiCache'
import { clearOfflineReadCache } from './offlineReadCache'
import { resetPushHealThrottle } from './useAutoPushSubscribe'

export const CURRENT_PWA_VERSION = process.env.NEXT_PUBLIC_RAOS_PWA_VERSION ?? 'local'

export type PwaVersionStatus = {
  current: string
  latest: string | null
  updateAvailable: boolean
}

export type CacheClearResult = {
  localCacheKeys: number
  cacheStorageEntries: number
}

function normalizeVersion(value: unknown): string | null {
  const v = String(value ?? '').trim()
  return v || null
}

export async function fetchLatestPwaVersion(): Promise<PwaVersionStatus> {
  let latest: string | null = null
  try {
    const response = await fetch('/api/pwa-version', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (response.ok) {
      const payload = await response.json() as { version?: string }
      latest = normalizeVersion(payload.version)
    }
  } catch {
    // Offline / captive portal: current build remains usable.
  }

  return {
    current: CURRENT_PWA_VERSION,
    latest,
    updateAvailable: !!latest && latest !== CURRENT_PWA_VERSION,
  }
}

/**
 * Hapus cache aplikasi TANPA menyentuh Supabase auth/session, user prefs,
 * atau PushManager subscription. Supabase auth berada di localStorage `sb-*`;
 * fungsi ini hanya menghapus key apiCache ber-prefix `raos_cache_` dan Cache
 * Storage PWA/offline.
 */
export async function clearRaosApplicationCaches(): Promise<CacheClearResult> {
  const localCacheKeys = cacheClearAll()

  // Dedicated private-read helper cleanup first (idempotent). This leaves the
  // authorization scope fingerprint intact so online reads can rebuild safely.
  await clearOfflineReadCache()

  let cacheStorageEntries = 0
  if (typeof window !== 'undefined' && 'caches' in window) {
    const keys = await caches.keys()
    const results = await Promise.all(keys.map(async (key) => {
      try { return await caches.delete(key) } catch { return false }
    }))
    cacheStorageEntries = results.filter(Boolean).length
  }

  // Force push subscription reconciliation after the next lifecycle event.
  resetPushHealThrottle()

  return { localCacheKeys, cacheStorageEntries }
}

export async function requestServiceWorkerUpdate(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return null
    await registration.update()
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
    return registration
  } catch {
    return null
  }
}

export async function applyPwaUpdate(): Promise<void> {
  await clearRaosApplicationCaches()
  await requestServiceWorkerUpdate()
  if (typeof window !== 'undefined') window.location.reload()
}
