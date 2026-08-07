'use client'

import { useEffect } from 'react'
import { installOfflineReadCache } from '@/lib/offlineReadCache'

export default function OfflineReadCacheBootstrap() {
  useEffect(() => {
    installOfflineReadCache()
  }, [])

  return null
}
