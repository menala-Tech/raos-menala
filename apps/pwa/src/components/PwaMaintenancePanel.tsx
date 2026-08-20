'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CheckCircle2, Loader2, RefreshCcw, Trash2 } from 'lucide-react'
import {
  applyPwaUpdate,
  clearRaosApplicationCaches,
  fetchLatestPwaVersion,
  type PwaVersionStatus,
} from '@/lib/pwaMaintenance'

function shortVersion(version: string | null): string {
  if (!version) return '—'
  return version.length > 12 ? version.slice(0, 12) : version
}

export default function PwaMaintenancePanel() {
  const pathname = usePathname()
  const [version, setVersion] = useState<PwaVersionStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState('')

  const checkVersion = useCallback(async () => {
    setChecking(true)
    try {
      setVersion(await fetchLatestPwaVersion())
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (pathname === '/settings') void checkVersion()
  }, [pathname, checkVersion])

  if (pathname !== '/settings') return null

  async function clearCache() {
    setClearing(true)
    setMessage('')
    try {
      const result = await clearRaosApplicationCaches()
      setMessage(`Cache bersih: ${result.localCacheKeys} data lokal + ${result.cacheStorageEntries} cache PWA. Login tetap aktif.`)
      await checkVersion()
    } catch {
      setMessage('Sebagian cache gagal dibersihkan. Coba ulang saat koneksi stabil.')
    } finally {
      setClearing(false)
    }
  }

  async function installUpdate() {
    setMessage('Menerapkan versi terbaru…')
    await applyPwaUpdate()
  }

  return (
    <section className="mx-4 mb-24 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-gray-800">PWA &amp; Cache</p>
          <p className="mt-0.5 text-[11px] text-gray-400">Update tanpa reinstall · cache aman untuk session login</p>
        </div>
        {version && !version.updateAvailable && version.latest && (
          <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-green-500" />
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-[10px] text-gray-400">Versi perangkat</p>
          <p className="mt-0.5 font-bold text-gray-700">{shortVersion(version?.current ?? null)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-[10px] text-gray-400">Versi server</p>
          <p className="mt-0.5 font-bold text-gray-700">{shortVersion(version?.latest ?? null)}</p>
        </div>
      </div>

      {version?.updateAvailable && (
        <button
          onClick={installUpdate}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-700"
        >
          <RefreshCcw size={14} /> Terapkan Update Sekarang
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={checkVersion}
          disabled={checking}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2.5 text-xs font-bold text-gray-600 disabled:opacity-50"
        >
          {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
          Cek Update
        </button>
        <button
          onClick={clearCache}
          disabled={clearing}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2.5 text-xs font-bold text-gray-600 disabled:opacity-50"
        >
          {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          Bersihkan Cache
        </button>
      </div>

      {message && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[10px] font-semibold text-blue-700">{message}</p>
      )}
    </section>
  )
}
