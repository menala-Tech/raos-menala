'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { can } from '@/lib/accessPolicy'
import { cacheReadSync, cacheWriteSync } from '@/lib/apiCache'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { runtimeMessage, runtimeTechnicalMessage } from '@/lib/runtimeError'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import BarcodeScanner from '@/components/BarcodeScanner'
import { requestLocationTiered, type LocationFix } from '@/lib/gps'
import { ArrowLeft, Car, Phone, CheckCircle2, Clock, RefreshCw, ScanLine, X, MapPin } from 'lucide-react'

/**
 * Halaman monitoring antrian driver — real-time via Supabase subscription.
 * Staff bisa panggil/selesaikan langsung dari sini.
 * RLS enforce scope by cabang.
 */

interface QueueItem {
  id: string
  position: number
  status: 'waiting' | 'called' | 'completed' | 'left'
  joined_at: string
  called_at: string | null
  branch_id: string
  driver: { id: string; driver_id: string; name: string; vehicle_plate?: string | null } | null
  branch: { id: string; name: string; timezone?: string | null } | null
}

interface Branch { id: string; name: string; lat: number | null; lng: number | null; default_radius_meters: number | null }

export default function AntrianDriverPage() {
  const router = useRouter()
  const [me, setMe] = useState<{ id: string; role: string; branch_id: string | null } | null>(null)
  const canOperateQueue = can(me?.role,'queue:operate')
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Anti-cheat barcode (sesi 21) — scan barcode driver + GPS validation
  const [scanBranchId, setScanBranchId] = useState<string | null>(null)
  const [scannerActive, setScannerActive] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [gpsFix, setGpsFix] = useState<LocationFix | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [antriBusy, setAntriBusy] = useState(false)
  const [antriResult, setAntriResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const abortGpsRef = useRef<null | (() => void)>(null)

  async function load() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }
    const { data: profile } = await supabase.from('user_profiles')
      .select('id, role, branch_id').eq('id', session.user.id).single()
    if (!profile) { router.push('/dashboard'); return }
    setMe({ id: profile.id, role: profile.role, branch_id: profile.branch_id })
    const cached=cacheReadSync<QueueItem[]>(['queue',profile.id,profile.branch_id],10*60*1000)
    if(cached){setItems(cached);setLoading(false)}

    const { data } = await supabase.from('raos_driver_queue')
      .select('id, position, status, joined_at, called_at, branch_id,' +
        'driver:raos_drivers(id, driver_id, name, vehicle_plate),' +
        'branch:branches(id, name, timezone)')
      .in('status', ['waiting', 'called'])
      .order('branch_id')
      .order('position')
      .limit(200)
    const rows=(data ?? []) as unknown as QueueItem[]
    setItems(rows)
    if(profile?.id) cacheWriteSync(['queue',profile.id,profile.branch_id],rows)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Fetch daftar cabang untuk selector scan
    supabase.from('branches')
      .select('id, name, lat, lng, default_radius_meters')
      .eq('is_active', true)
      .not('branch_type', 'is', null)
      .in('branch_type', ['airport', 'airport_hub', 'operational'])
      .order('name')
      .then(({ data }) => setBranches((data ?? []) as Branch[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useRealtimeRefresh(
    `driver-queue-${me?.id ?? 'anon'}`,
    [{table:'raos_driver_queue'}],
    ()=>void load(),
    250,
    !!me?.id,
  )

  // Auto-open GPS request saat pilih cabang untuk scan
  useEffect(() => {
    if (!scanBranchId) {
      setGpsFix(null); setGpsError(null)
      abortGpsRef.current?.()
      abortGpsRef.current = null
      return
    }
    setGpsError(null); setGpsFix(null)
    abortGpsRef.current?.()
    abortGpsRef.current = requestLocationTiered({
      onFix: fix => setGpsFix(fix),
      onUnavailable: reason => setGpsError(
        reason === 'permission_denied' ? 'Izin lokasi ditolak' :
        reason === 'unsupported' ? 'Browser tidak dukung GPS' : 'Timeout GPS'
      ),
    })
    return () => { abortGpsRef.current?.(); abortGpsRef.current = null }
  }, [scanBranchId])

  async function handleBarcodeDetected(code: string) {
    if (!canOperateQueue || !scanBranchId || antriBusy) return
    setAntriBusy(true); setAntriResult(null); setScannerActive(false)
    const { data, error } = await supabase.rpc('raos_join_queue_by_barcode', {
      p_barcode: code,
      p_branch_id: scanBranchId,
      p_room_id: null,
      p_staff_lat: gpsFix?.lat ?? null,
      p_staff_lng: gpsFix?.lng ?? null,
    })
    setAntriBusy(false)
    if (error) {
      setAntriResult({ ok: false, msg: parseAntriError(error.message) })
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    if (row) {
      setAntriResult({ ok: true, msg: `${row.driver_name} (${row.driver_id_text}) masuk antre posisi #${row.queue_pos}` })
      await load()
      // Auto-close modal setelah 2 detik supaya user bisa scan berikutnya kalau mau
      setTimeout(() => { setScanBranchId(null); setAntriResult(null) }, 2500)
    }
  }

  const selectedBranch = useMemo(
    () => branches.find(b => b.id === scanBranchId) ?? null,
    [branches, scanBranchId]
  )

  const groupedByBranch = items.reduce((acc, item) => {
    const key = item.branch?.id ?? item.branch_id
    const name = item.branch?.name ?? 'Cabang'
    if (!acc[key]) acc[key] = { name, items: [] }
    acc[key].items.push(item)
    return acc
  }, {} as Record<string, { name: string; items: QueueItem[] }>)

  function parseAntriError(msg: string): string {
    if (msg.includes('driver_not_found_by_barcode')) return 'Barcode tidak dikenali'
    if (msg.includes('driver_wrong_branch')) return 'Driver terdaftar di cabang berbeda'
    if (msg.includes('branch_not_in_scope')) return 'Anda tidak punya akses cabang ini'
    if (msg.includes('driver_already_in_queue')) return 'Driver sudah dalam antrean aktif'
    if (msg.includes('gps_out_of_range')) return 'Lokasi Anda di luar area cabang'
    if (msg.includes('unauthenticated')) return 'Sesi login expired'
    return msg
  }

  async function handleCall(branchId: string, position: number) {
    if(!canOperateQueue)return
    setBusyId(`${branchId}:${position}`)
    const { error } = await supabase.rpc('raos_call_driver', { p_branch_id: branchId, p_position: position })
    if (error) { console.warn('[queue] call failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Gagal memanggil driver.')) }
    else await load()
    setBusyId(null)
  }
  async function handleComplete(queueId: string) {
    if(!canOperateQueue)return
    setBusyId(queueId)
    const { error } = await supabase.rpc('raos_complete_queue', { p_queue_id: queueId })
    if (error) { console.warn('[queue] complete failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Gagal menyelesaikan antrean.')) }
    else await load()
    setBusyId(null)
  }
  async function handleLeave(queueId: string) {
    if(!canOperateQueue)return
    if (!confirm('Keluarkan driver ini dari antrean?')) return
    setBusyId(queueId)
    const { error } = await supabase.rpc('raos_leave_queue', { p_queue_id: queueId })
    if (error) { console.warn('[queue] exit failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Gagal mengeluarkan driver dari antrean.')) }
    else await load()
    setBusyId(null)
  }

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} className="text-white/70" /></Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl">Antrian Driver</h1>
            <p className="text-white/50 text-xs mt-0.5">Real-time monitor per cabang</p>
          </div>
          <div className="flex items-start gap-2">
            <DateTimeStack />
            <button onClick={load}
              className="bg-white/10 rounded-xl p-2 active:scale-95"
              title="Refresh">
              <RefreshCw size={18} className="text-primary" />
            </button>
          </div>
        </div>
        {/* Tombol Antri via Barcode (anti-cheat) — sesi 21 */}
        {canOperateQueue && <button
          onClick={() => { setScanBranchId(me?.branch_id ?? null); setAntriResult(null) }}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-primary text-secondary font-bold text-sm py-2.5 rounded-xl active:scale-95">
          <ScanLine size={16} /> Antri Driver via Barcode
        </button>}
      </div>

      <div className="px-4 py-4 space-y-4 pb-24">
        {loading && <p className="text-center text-xs text-gray-400 py-8">Memuat...</p>}

        {!loading && Object.keys(groupedByBranch).length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Car size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Tidak ada antrean aktif</p>
            <p className="text-[11px] text-gray-300 mt-1">
              Gunakan tombol <span className="font-semibold text-gray-400">Antri Driver via Barcode</span> saat driver tiba di lokasi.
            </p>
          </div>
        )}

        {Object.entries(groupedByBranch).map(([branchId, group]) => (
          <div key={branchId} className="space-y-2">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
              {group.name} · {group.items.length} driver
            </p>
            {group.items.map(item => {
              const isCalled = item.status === 'called'
              return (
                <div key={item.id}
                  className={clsx(
                    'card flex items-center gap-3',
                    isCalled && 'border-2 border-blue-300 bg-blue-50/50'
                  )}>
                  <div className={clsx(
                    'rounded-xl w-11 h-11 flex flex-col items-center justify-center flex-shrink-0',
                    isCalled ? 'bg-blue-500 text-white' : 'bg-amber-100 text-amber-700'
                  )}>
                    <span className="text-[8px] font-bold leading-none">POS</span>
                    <span className="text-lg font-black leading-none">{item.position}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{item.driver?.name ?? '(unknown)'}</p>
                    <p className="text-[11px] text-gray-500">
                      {item.driver?.driver_id ?? '-'}
                      {item.driver?.vehicle_plate ? ` · ${item.driver.vehicle_plate}` : ''}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {isCalled ? (
                        <>Dipanggil {item.called_at ? new Date(item.called_at).toLocaleTimeString('id-ID', { timeZone: item.branch?.timezone ?? 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : ''}</>
                      ) : (
                        <>Antre sejak {new Date(item.joined_at).toLocaleTimeString('id-ID', { timeZone: item.branch?.timezone ?? 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })}</>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {canOperateQueue && !isCalled && (
                      <button
                        disabled={busyId === `${item.branch_id}:${item.position}`}
                        onClick={() => handleCall(item.branch_id, item.position)}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-500 text-white disabled:opacity-50 flex items-center gap-1">
                        <Phone size={10} /> PANGGIL
                      </button>
                    )}
                    {canOperateQueue && isCalled && (
                      <button
                        disabled={busyId === item.id}
                        onClick={() => handleComplete(item.id)}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-600 text-white disabled:opacity-50 flex items-center gap-1">
                        <CheckCircle2 size={10} /> SELESAI
                      </button>
                    )}
{canOperateQueue &&                     <button
                      disabled={busyId === item.id}
                      onClick={() => handleLeave(item.id)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-600 disabled:opacity-50">
                      Keluar
                    </button>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div className="card bg-gray-50 text-[11px] text-gray-500 space-y-1">
          <p className="font-bold text-gray-700 text-xs">Panduan Singkat</p>
          <p>Masukkan driver ke antrean lewat barcode + GPS, lalu kelola statusnya dari halaman ini.</p>
          <p className="pt-1 text-primary font-semibold">Anti-cheat aktif: antre hanya valid bila barcode cocok dan lokasi staff masih dalam scope cabang.</p>
        </div>
      </div>

      {/* Modal scan barcode antri driver (sesi 21) */}
      {scanBranchId !== null && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center p-4"
          onClick={() => !antriBusy && !scannerActive && setScanBranchId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-800 text-sm">Scan Barcode Driver</p>
                <p className="text-[10px] text-gray-400">Anti-cheat: validate cabang + GPS</p>
              </div>
              <button disabled={scannerActive}
                onClick={() => setScanBranchId(null)}
                className="p-1 text-gray-400 disabled:opacity-40">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Selector cabang (kalau user boleh scan cabang lain) */}
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Cabang Target</p>
                <select
                  value={scanBranchId ?? ''}
                  onChange={e => setScanBranchId(e.target.value || null)}
                  disabled={scannerActive || antriBusy}
                  className="w-full text-sm bg-gray-100 rounded-lg px-3 py-2 focus:outline-none">
                  <option value="">— Pilih cabang —</option>
                  {branches.filter(b => ['admin','direksi','direktur'].includes(me?.role ?? '') || b.id===me?.branch_id).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* GPS status */}
              <div className={clsx('rounded-lg px-3 py-2 flex items-center gap-2 text-xs',
                gpsFix ? 'bg-green-50 text-green-700'
                : gpsError ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-700')}>
                <MapPin size={14} className="flex-shrink-0" />
                {gpsFix
                  ? <span>GPS OK ({gpsFix.source}, akurasi ±{Math.round(gpsFix.accuracyM)}m)</span>
                  : gpsError
                    ? <span>{gpsError}</span>
                    : <span>Menunggu GPS...</span>}
              </div>

              {/* Scanner area — hanya render saat aktif supaya kamera tidak stay open */}
              {scannerActive && (
                <div className="rounded-lg overflow-hidden bg-black">
                  <BarcodeScanner active={scannerActive} onDetected={handleBarcodeDetected} />
                </div>
              )}

              {/* Result */}
              {antriResult && (
                <div className={clsx('rounded-lg px-3 py-2 text-xs',
                  antriResult.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                  {antriResult.ok ? '✅ ' : '❌ '}{antriResult.msg}
                </div>
              )}

              {/* Tombol trigger scan */}
              {!scannerActive && !antriBusy && (
                <button
                  onClick={() => { setScannerActive(true); setAntriResult(null) }}
                  disabled={!scanBranchId}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-secondary font-bold text-sm py-3 rounded-xl active:scale-95 disabled:opacity-40">
                  <ScanLine size={16} /> Mulai Scan Barcode
                </button>
              )}
              {scannerActive && (
                <button
                  onClick={() => setScannerActive(false)}
                  className="w-full text-xs font-semibold text-red-500 py-2">
                  Batal Scan
                </button>
              )}
              {antriBusy && (
                <p className="text-center text-xs text-gray-400">Memproses...</p>
              )}

              <p className="text-[10px] text-gray-400 leading-relaxed">
                {selectedBranch?.lat
                  ? `Target: ${selectedBranch.name} (radius ${selectedBranch.default_radius_meters ?? 500}m + 100m tolerance)`
                  : 'Cabang tanpa koordinat — GPS validation di-skip.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
