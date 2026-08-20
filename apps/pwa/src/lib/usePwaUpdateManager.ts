'use client'

import { useEffect } from 'react'
import {
  clearRaosApplicationCaches,
  fetchLatestPwaVersion,
  requestServiceWorkerUpdate,
} from './pwaMaintenance'

const AUTO_UPDATE_PREFIX = 'raos_auto_update_v2_'

/**
 * Detect a newer deployed PWA build on reopen/focus/online and refresh stale
 * Workbox caches once. This makes close→reopen or normal refresh sufficient;
 * reinstall is not required.
 */
export function usePwaUpdateManager(): void {
  useEffect(() => {
    let cancelled = false
    let running = false

    const check = async () => {
      if (cancelled || running || !navigator.onLine) return
      running = true
      try {
        const status = await fetchLatestPwaVersion()
        if (!status.updateAvailable || !status.latest || cancelled) {
          await requestServiceWorkerUpdate()
          return
        }

        const guardKey = AUTO_UPDATE_PREFIX + status.latest
        try {
          if (sessionStorage.getItem(guardKey) === '1') return
          sessionStorage.setItem(guardKey, '1')
        } catch {
          // Private mode: proceed; reload still only runs from this mounted hook.
        }

        await clearRaosApplicationCaches()
        await requestServiceWorkerUpdate()
        if (!cancelled) window.location.reload()
      } finally {
        running = false
      }
    }

    void check()

    const onOnline = () => { void check() }
    const onFocus = () => { void check() }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
