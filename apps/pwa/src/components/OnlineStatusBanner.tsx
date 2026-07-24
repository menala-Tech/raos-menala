'use client'

import { useEffect, useState } from 'react'
import { WifiOff, Wifi, Clock } from 'lucide-react'
import { pendingCount } from '@/lib/offlineQueue'
import { flushAll, installOnlineFlushListener } from '@/lib/offlineSyncer'

/**
 * Banner status koneksi + offline queue.
 *
 * State:
 *   - offline → banner merah "Sedang offline". Aksi user (absen)
 *     otomatis di-queue via lib/offlineQueue.
 *   - online + queue > 0 → banner kuning "N tersimpan, sedang sync".
 *     flushAll() dipanggil, hasilnya update queue count.
 *   - online + queue = 0 → tidak tampil.
 */
export default function OnlineStatusBanner() {
  const [online, setOnline] = useState(true)
  const [queue, setQueue] = useState(0)

  useEffect(() => {
    setOnline(navigator.onLine)
    pendingCount().then(setQueue).catch(() => {})

    const refresh = () => { pendingCount().then(setQueue).catch(() => {}) }
    const goOnline = async () => {
      setOnline(true)
      await flushAll()
      refresh()
    }
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    // Kalau app baru dibuka dalam kondisi online dengan queue > 0,
    // trigger flush juga (belum jalan sejak session terakhir).
    if (navigator.onLine) { void goOnline() }

    // Polling ringan queue count tiap 30 detik (deteksi enqueue dari halaman lain).
    const iv = setInterval(refresh, 30_000)
    const detach = installOnlineFlushListener(() => refresh())

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      clearInterval(iv)
      detach()
    }
  }, [])

  if (online && queue === 0) return null

  const styleBase = 'fixed left-0 right-0 top-0 z-50 px-4 py-2 text-center text-xs font-semibold ' +
    'flex items-center justify-center gap-2 shadow-lg'
  const stylePad = { paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }

  if (!online) {
    return (
      <div role="status" className={`${styleBase} bg-red-500 text-white`} style={stylePad}>
        <WifiOff size={14} />
        <span>Sedang offline — absensi akan disimpan &amp; sync otomatis saat online</span>
      </div>
    )
  }

  return (
    <div role="status" className={`${styleBase} bg-amber-500 text-white`} style={stylePad}>
      <Clock size={14} />
      <span>{queue} data absensi menunggu sync</span>
    </div>
  )
}
