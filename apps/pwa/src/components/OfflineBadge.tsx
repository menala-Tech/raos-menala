'use client'

import { useOfflineStatus } from '@/hooks/useOfflineStatus'

export default function OfflineBadge() {
  const isOffline = useOfflineStatus()
  if (!isOffline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-2 z-[9999] -translate-x-1/2 rounded-full border border-amber-300 bg-amber-100/95 px-3 py-1 text-[11px] font-semibold text-amber-900 shadow-lg backdrop-blur"
    >
      📴 Offline mode — data cached
    </div>
  )
}
