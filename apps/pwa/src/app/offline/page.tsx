'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MenalaLogo from '@/components/MenalaLogo'
import { pendingCount } from '@/lib/offlineQueue'

export default function OfflinePage() {
  const [queue, setQueue] = useState<number | null>(null)

  useEffect(() => {
    pendingCount().then(setQueue).catch(() => setQueue(null))
  }, [])

  return (
    <div className="min-h-screen bg-secondary flex flex-col items-center justify-center px-6 text-center">
      <MenalaLogo size={72} variant="splash" tone="onNavy" />
      <div className="mt-8 bg-white/10 rounded-full p-6">
        <WifiOff size={40} className="text-white" />
      </div>
      <h1 className="mt-6 text-white text-xl font-bold">Sedang Offline</h1>
      <p className="mt-2 text-white/60 text-sm max-w-xs">
        Halaman ini belum pernah dibuka saat online. Sambungkan internet
        lalu coba lagi.
      </p>

      {queue !== null && queue > 0 && (
        <p className="mt-4 bg-amber-500/20 text-amber-100 text-xs px-3 py-2 rounded-full">
          {queue} data menunggu sync — akan otomatis terkirim saat online
        </p>
      )}

      <button
        onClick={() => location.reload()}
        className="mt-8 bg-primary text-secondary font-bold text-sm px-6 py-3 rounded-full flex items-center gap-2"
      >
        <RefreshCw size={16} /> Coba Lagi
      </button>

      <Link href="/dashboard" className="mt-3 text-white/40 text-xs underline">
        Kembali ke Beranda
      </Link>
    </div>
  )
}
