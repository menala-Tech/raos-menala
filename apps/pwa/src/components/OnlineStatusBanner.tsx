'use client'

import { useEffect, useState } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

/**
 * Banner "Kamu sedang offline" — muncul kalau navigator.onLine=false.
 * Reactive ke event 'online'/'offline'. Setelah balik online, banner
 * hilang. Refresh otomatis TIDAK dilakukan (bisa gangguan) — user
 * dipersilakan reload manual.
 *
 * Full offline queue (mutation buffered, background sync) belum
 * diimplementasi — jadi baseline ini cuma UI info, bukan fungsional
 * offline persistence. Scope offline penuh ke sesi berikutnya.
 */
export default function OnlineStatusBanner() {
  const [online, setOnline] = useState(true)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    setOnline(navigator.onLine)
    const goOnline = () => { setOnline(true) }
    const goOffline = () => { setOnline(false); setWasOffline(true) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online && !wasOffline) return null

  return (
    <div
      role="status"
      className={
        'fixed left-0 right-0 top-0 z-50 px-4 py-2 text-center text-xs font-semibold ' +
        'flex items-center justify-center gap-2 shadow-lg ' +
        (online ? 'bg-green-500 text-white animate-pulse' : 'bg-red-500 text-white')
      }
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
    >
      {online ? (
        <>
          <Wifi size={14} />
          <span>Kembali online — refresh halaman untuk sync data terbaru</span>
        </>
      ) : (
        <>
          <WifiOff size={14} />
          <span>Kamu sedang offline — scan &amp; absensi mungkin gagal dikirim</span>
        </>
      )}
    </div>
  )
}
