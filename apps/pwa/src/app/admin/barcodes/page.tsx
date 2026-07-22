'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Printer, QrCode, Search, Loader2 } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import QRCode from 'qrcode'

interface Driver {
  id: string
  driver_id: string
  name: string
  barcode: string | null
  vehicle_type: string | null
  vehicle_plate: string | null
  // Supabase-js return single object untuk FK unique (branch_id → branches.id),
  // tapi kadang array kalau relasi ambigu. Support keduanya biar defensif.
  branches: { code: string; name: string } | { code: string; name: string }[] | null
}

function getBranchName(b: Driver['branches']): string {
  if (!b) return '—'
  if (Array.isArray(b)) return b[0]?.name ?? '—'
  return b.name ?? '—'
}

function QRCard({ driver }: { driver: Driver }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const codeValue = driver.barcode || driver.driver_id

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, codeValue, {
      width: 160,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => setFailed(true))
  }, [codeValue])

  return (
    <div className="qr-card flex flex-col items-center bg-white border border-gray-200 rounded-xl p-3 gap-2 shadow-sm">
      {failed ? (
        <div className="w-40 h-40 bg-red-50 border border-red-200 rounded flex items-center justify-center text-red-500 text-xs text-center px-3">
          Gagal render QR
        </div>
      ) : (
        <canvas ref={canvasRef} className="rounded" />
      )}
      <div className="text-center">
        <p className="font-bold text-sm text-gray-800 leading-tight">{driver.name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{driver.driver_id}</p>
        <p className="text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded mt-1 text-gray-600">
          {codeValue}
        </p>
        <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
          {getBranchName(driver.branches)}
        </span>
      </div>
    </div>
  )
}

export default function BarcodesPage() {
  const router = useRouter()
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [filtered, setFiltered] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [branch, setBranch] = useState('all')
  const [authorized, setAuthorized] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('raos_drivers')
      .select('id, driver_id, name, barcode, vehicle_type, vehicle_plate, branches(code, name)')
      .eq('is_active', true)
      .order('driver_id')
    setDrivers((data ?? []) as Driver[])
    setFiltered((data ?? []) as Driver[])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      if (!profile || !['admin', 'management', 'koordinator', 'direksi'].includes(profile.role)) {
        router.push('/dashboard')
        return
      }
      setAuthorized(true)
      load()
    }
    init()
  }, [router, load])

  useEffect(() => {
    let result = drivers
    if (branch !== 'all') result = result.filter(d => {
      const b = d.branches
      const code = Array.isArray(b) ? b[0]?.code : b?.code
      return code === branch
    })
    if (search) result = result.filter(d =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.driver_id.toLowerCase().includes(search.toLowerCase())
    )
    setFiltered(result)
  }, [search, branch, drivers])

  if (!authorized) return null

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .qr-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 12px !important; }
          .qr-card { break-inside: avoid; border: 1px solid #ccc !important; box-shadow: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <AppShell>
        {/* Header */}
        <div className="no-print bg-secondary text-white px-4 pt-10 pb-4">
          <div className="flex items-center gap-3">
            <Link href="/admin"><ArrowLeft size={22} /></Link>
            <div>
              <h1 className="font-bold text-base flex items-center gap-2">
                <QrCode size={18} className="text-primary" />
                Generator QR Code Driver
              </h1>
              <p className="text-white/50 text-xs">{filtered.length} driver aktif</p>
            </div>
          </div>
        </div>

        {/* Filter & Print */}
        <div className="no-print px-4 py-3 space-y-2 bg-white border-b border-gray-100">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nama / ID driver..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input pl-8 text-sm w-full"
              />
            </div>
            <select
              value={branch}
              onChange={e => setBranch(e.target.value)}
              className="input text-sm w-28"
            >
              <option value="all">Semua</option>
              <option value="T1">Terminal 1</option>
              <option value="T2">Terminal 2</option>
              <option value="T3">Terminal 3</option>
            </select>
          </div>
          <button
            onClick={() => window.print()}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Printer size={16} />
            Cetak QR Code ({filtered.length} driver)
          </button>
        </div>

        {/* QR Grid */}
        <div className="px-4 py-4">
          {loading ? (
            <div className="flex flex-col items-center py-16 text-gray-400 gap-2">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">Memuat data driver...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <QrCode size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Tidak ada driver ditemukan</p>
            </div>
          ) : (
            <div className={clsx(
              'qr-grid grid gap-3',
              'grid-cols-2 sm:grid-cols-3'
            )}>
              {filtered.map(driver => (
                <QRCard key={driver.id} driver={driver} />
              ))}
            </div>
          )}
        </div>
      </AppShell>
    </>
  )
}
