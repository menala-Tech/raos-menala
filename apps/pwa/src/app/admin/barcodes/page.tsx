'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/accessPolicy'
import { cacheReadSync, cacheWriteSync } from '@/lib/apiCache'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import AppShell from '@/components/layout/AppShell'
import BrandLoadingShell from '@/components/BrandLoadingShell'
import { ArrowLeft, Printer, QrCode, Search, Loader2, WandSparkles } from 'lucide-react'
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
  branches: { code: string; name: string } | { code: string; name: string }[] | null
}

function getBranchName(b: Driver['branches']): string {
  if (!b) return '—'
  if (Array.isArray(b)) return b[0]?.name ?? '—'
  return b.name ?? '—'
}

function QRCard({ driver, onGenerate, busy }: { driver: Driver; onGenerate: (id: string) => void; busy: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const codeValue = driver.barcode?.trim() || null

  useEffect(() => {
    setFailed(false)
    if (!canvasRef.current || !codeValue) return
    QRCode.toCanvas(canvasRef.current, codeValue, {
      width: 160,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => setFailed(true))
  }, [codeValue])

  return (
    <div className="qr-card flex flex-col items-center bg-white border border-gray-200 rounded-xl p-3 gap-2 shadow-sm">
      {!codeValue ? (
        <div className="w-40 h-40 bg-amber-50 border border-amber-200 rounded flex flex-col items-center justify-center text-amber-700 text-xs text-center px-3 gap-2">
          <QrCode size={30} className="opacity-50" />
          <span>Barcode belum dibuat</span>
        </div>
      ) : failed ? (
        <div className="w-40 h-40 bg-red-50 border border-red-200 rounded flex items-center justify-center text-red-500 text-xs text-center px-3">
          Gagal render QR
        </div>
      ) : (
        <canvas ref={canvasRef} className="rounded" />
      )}
      <div className="text-center w-full">
        <p className="font-bold text-sm text-gray-800 leading-tight">{driver.name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{driver.driver_id}</p>
        {codeValue && (
          <p className="text-[9px] font-mono bg-gray-100 px-2 py-0.5 rounded mt-1 text-gray-600 break-all">
            {codeValue}
          </p>
        )}
        <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
          {getBranchName(driver.branches)}
        </span>
        {!codeValue && (
          <button
            onClick={() => onGenerate(driver.id)}
            disabled={busy}
            className="no-print mt-2 w-full text-[11px] font-bold py-1.5 rounded-lg bg-secondary text-white disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <WandSparkles size={12} />}
            Generate Barcode
          </button>
        )}
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
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)

  const load = useCallback(async (uid: string, skipCache = false) => {
    const cacheKey=['driver-barcodes',uid] as const
    if (!skipCache) {
      const cached=cacheReadSync<Driver[]>(cacheKey,30*60*1000)
      if(cached){setDrivers(cached);setFiltered(cached);setLoading(false)}
    }
    const { data } = await supabase
      .from('raos_drivers')
      .select('id, driver_id, name, barcode, vehicle_type, vehicle_plate, branches(code, name)')
      .eq('is_active', true)
      .order('driver_id')
    const rows=(data ?? []) as Driver[]
    setDrivers(rows)
    setFiltered(rows)
    cacheWriteSync(cacheKey,rows)
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
      if (!profile || !can(profile.role,'driver:barcode:manage')) {
        router.push('/dashboard')
        return
      }
      setViewerId(session.user.id)
      setAuthorized(true)
      void load(session.user.id)
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
      d.driver_id.toLowerCase().includes(search.toLowerCase()) ||
      (d.barcode ?? '').toLowerCase().includes(search.toLowerCase())
    )
    setFiltered(result)
  }, [search, branch, drivers])

  const generateOne = useCallback(async (driverId: string) => {
    if (!viewerId) return
    setAssigning(driverId)
    const { error } = await supabase.rpc('raos_assign_driver_barcode', {
      p_driver_id: driverId,
      p_all_missing: false,
    })
    setAssigning(null)
    if (error) {
      alert(`Gagal membuat barcode: ${error.message}`)
      return
    }
    await load(viewerId, true)
  }, [viewerId, load])

  const generateAllMissing = useCallback(async () => {
    if (!viewerId) return
    const missing = drivers.filter(d => !d.barcode?.trim()).length
    if (!missing) return
    if (!confirm(`Buat barcode canonical untuk ${missing} driver aktif yang belum punya barcode? Barcode lama tidak akan diubah.`)) return
    setBatchBusy(true)
    const { error } = await supabase.rpc('raos_assign_driver_barcode', {
      p_driver_id: null,
      p_all_missing: true,
    })
    setBatchBusy(false)
    if (error) {
      alert(`Gagal membuat barcode batch: ${error.message}`)
      return
    }
    await load(viewerId, true)
  }, [viewerId, drivers, load])

  const branchOptions=Array.from(new Map(drivers.flatMap(d=>{const b=Array.isArray(d.branches)?d.branches[0]:d.branches;return b?.code?[[b.code,b.name] as const]:[]})).entries())
  const missingCount = drivers.filter(d => !d.barcode?.trim()).length
  const assignedCount = drivers.length - missingCount

  useRealtimeRefresh(`driver-barcodes-${viewerId ?? 'anon'}`,[{table:'raos_drivers'}],()=>authorized&&viewerId?void load(viewerId,true):undefined,500,!!viewerId&&authorized)

  if (!authorized || (loading && drivers.length===0)) return <BrandLoadingShell label="Memuat QR Driver..." />

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .qr-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 12px !important; }
          .qr-card { break-inside: avoid; border: 1px solid #ccc !important; box-shadow: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <AppShell>
        <div className="no-print bg-secondary text-white px-4 pt-10 pb-4">
          <div className="flex items-center gap-3">
            <Link href="/admin"><ArrowLeft size={22} /></Link>
            <div>
              <h1 className="font-bold text-base flex items-center gap-2">
                <QrCode size={18} className="text-primary" />
                Generator QR Code Driver
              </h1>
              <p className="text-white/50 text-xs">{assignedCount} barcode aktif • {missingCount} belum dibuat</p>
            </div>
          </div>
        </div>

        <div className="no-print px-4 py-3 space-y-2 bg-white border-b border-gray-100">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nama / ID / barcode..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input pl-8 text-sm w-full"
              />
            </div>
            <select value={branch} onChange={e => setBranch(e.target.value)} className="input text-sm w-28">
              <option value="all">Semua</option>
              {branchOptions.map(([code,name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
          {missingCount > 0 && (
            <button
              onClick={generateAllMissing}
              disabled={batchBusy}
              className="w-full bg-amber-500 text-secondary font-bold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {batchBusy ? <Loader2 size={16} className="animate-spin" /> : <WandSparkles size={16} />}
              Generate Semua yang Belum Ada ({missingCount})
            </button>
          )}
          <button onClick={() => window.print()} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
            <Printer size={16} />
            Cetak QR Code ({filtered.filter(d => !!d.barcode?.trim()).length} siap cetak)
          </button>
        </div>

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
            <div className={clsx('qr-grid grid gap-3','grid-cols-2 sm:grid-cols-3')}>
              {filtered.map(driver => (
                <QRCard key={driver.id} driver={driver} onGenerate={generateOne} busy={assigning===driver.id} />
              ))}
            </div>
          )}
        </div>
      </AppShell>
    </>
  )
}
