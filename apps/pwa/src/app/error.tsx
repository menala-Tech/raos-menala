'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'

/**
 * Global Error Boundary (Opsi C). Kalau ada crash di React tree,
 * user lihat fallback ini bukan blank screen. Fitur lain tetap
 * bisa diakses via link ke Home.
 */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log ke console — nanti bisa forward ke Sentry / logging service
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full card space-y-4 text-center">
        <div className="bg-red-100 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
          <AlertTriangle size={28} className="text-red-600" />
        </div>
        <div>
          <h1 className="text-base font-black text-gray-800 dark:text-gray-100">
            Ada masalah teknis di halaman ini
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Fitur lain masih normal — coba tekan tombol di bawah untuk retry
            atau kembali ke Beranda.
          </p>
        </div>
        {error.digest && (
          <p className="text-[10px] text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
            {error.digest}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={reset}
            className="flex items-center justify-center gap-2 text-sm font-semibold py-2 rounded-lg bg-primary text-secondary">
            <RefreshCw size={14} /> Coba lagi
          </button>
          <Link href="/dashboard"
            className="flex items-center justify-center gap-2 text-sm font-semibold py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
            <Home size={14} /> Beranda
          </Link>
        </div>
      </div>
    </div>
  )
}
