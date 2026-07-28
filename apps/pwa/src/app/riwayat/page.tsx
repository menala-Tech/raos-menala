'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import {
  ArrowLeft, Search, ScanLine, UserCheck, Filter, CheckCircle2, Clock,
  X, BarChart3, MapPin, Car, User, Calendar, Wallet, XCircle,
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { ScanOrder, Attendance } from '@/types'

type Tab = 'semua' | 'scan' | 'absensi' | 'saldo'

interface SaldoRequest {
  id: string
  request_no: string
  nominal: number
  status: string
  is_processed: boolean
  requested_at: string
  approved_at: string | null
  processed_at: string | null
  rejection_reason: string | null
  note: string | null
  driver_name: string | null
  approved_by_user: { full_name: string } | null
  processed_by_user: { full_name: string } | null
}
type StatusFilter = 'semua' | 'valid' | 'pending'
type DateRange = 'hari-ini' | 'kemarin' | '7-hari' | '30-hari'

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: 'hari-ini', label: 'Hari Ini' },
  { key: 'kemarin',  label: 'Kemarin' },
  { key: '7-hari',   label: '7 Hari' },
  { key: '30-hari',  label: '30 Hari' },
]

function rangeToDates(range: DateRange): { from: Date; to: Date } {
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const to = new Date(now)
  let from = startOfDay(now)
  if (range === 'kemarin') {
    from = new Date(from.getTime() - 86400000)
    return { from, to: startOfDay(now) }
  }
  if (range === '7-hari')  from = new Date(startOfDay(now).getTime() - 6 * 86400000)
  if (range === '30-hari') from = new Date(startOfDay(now).getTime() - 29 * 86400000)
  return { from, to }
}

export default function RiwayatPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('semua')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua')
  const [dateRange, setDateRange] = useState<DateRange>('30-hari')
  const [search, setSearch] = useState('')
  const [scans, setScans] = useState<ScanOrder[]>([])
  const [absensies, setAbsensies] = useState<Attendance[]>([])
  const [saldoRequests, setSaldoRequests] = useState<SaldoRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<{ type: 'scan' | 'absensi'; data: any } | null>(null)
  const [showSummary, setShowSummary] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      setLoading(true)

      const { from, to } = rangeToDates(dateRange)
      const fromIso = from.toISOString()
      const fromDate = from.toISOString().split('T')[0]
      const toIso = to.toISOString()
      const toDate = to.toISOString().split('T')[0]

      const [{ data: scanData }, { data: attData }, { data: saldoData }] = await Promise.all([
        supabase.from('scan_orders')
          .select('*, raos_drivers(*), pickup_points(name)')
          .eq('staff_id', session.user.id)
          .gte('scanned_at', fromIso).lte('scanned_at', toIso)
          .order('scanned_at', { ascending: false }).limit(200),
        supabase.from('raos_attendance')
          .select('*, pickup_points(name), shifts(name, start_time, end_time)')
          .eq('staff_id', session.user.id)
          .gte('date', fromDate).lte('date', toDate)
          .order('date', { ascending: false }).limit(60),
        supabase.from('raos_saldo_requests')
          .select(
            'id, request_no, nominal, status, is_processed, requested_at,' +
            'approved_at, processed_at, rejection_reason, note, driver_name,' +
            'approved_by_user:user_profiles!approved_by(full_name),' +
            'processed_by_user:user_profiles!processed_by(full_name)'
          )
          .eq('staff_id', session.user.id)
          .gte('requested_at', fromIso).lte('requested_at', toIso)
          .order('requested_at', { ascending: false }).limit(200),
      ])
      setScans(scanData ?? [])
      setAbsensies(attData ?? [])
      setSaldoRequests((saldoData ?? []) as unknown as SaldoRequest[])
      setLoading(false)
    }
    load()
  }, [router, dateRange])

  const filteredScans = scans.filter(s => {
    if (statusFilter !== 'semua' && s.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const driverName = (s as any).raos_drivers?.name?.toLowerCase() ?? ''
      const scanId = s.scan_id.toLowerCase()
      const location = (s as any).pickup_points?.name?.toLowerCase() ?? ''
      if (!driverName.includes(q) && !scanId.includes(q) && !location.includes(q)) return false
    }
    return true
  })

  // Ringkasan bulanan (spec riwayat.md §5: metrik + grafik aktivitas harian)
  const summary = useMemo(() => {
    const validScans   = scans.filter(s => s.status === 'valid').length
    const pendingScans = scans.filter(s => s.status === 'pending').length
    const masuk  = absensies.filter(a => a.check_in_at).length
    const pulang = absensies.filter(a => a.check_out_at).length
    const rate = scans.length > 0 ? Math.round((validScans / scans.length) * 100) : 0

    // Grafik: aktivitas per hari (scan + absensi)
    const byDay = new Map<string, { scan: number; absensi: number }>()
    for (const s of scans) {
      const d = s.scanned_at.split('T')[0]
      const cur = byDay.get(d) ?? { scan: 0, absensi: 0 }
      cur.scan++
      byDay.set(d, cur)
    }
    for (const a of absensies) {
      const cur = byDay.get(a.date) ?? { scan: 0, absensi: 0 }
      cur.absensi++
      byDay.set(a.date, cur)
    }
    const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
    const maxVal = Math.max(1, ...days.map(([, v]) => v.scan + v.absensi))

    return {
      total: scans.length + absensies.length,
      validScans, pendingScans, masuk, pulang, rate, days, maxVal,
    }
  }, [scans, absensies])

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'semua',   label: 'Semua',   count: filteredScans.length + absensies.length + saldoRequests.length },
    { key: 'scan',    label: 'Scan',    count: filteredScans.length },
    { key: 'absensi', label: 'Absensi', count: absensies.length },
    { key: 'saldo',   label: 'Isi Saldo', count: saldoRequests.length },
  ]

  return (
    <AppShell>
      {/* HEADER */}
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} className="text-white/70" /></Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
        </div>

        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl">Riwayat Aktivitas</h1>
            <p className="text-white/50 text-xs mt-0.5">
              Semua aktivitas scan &amp; absensi tersimpan otomatis
            </p>
          </div>
          <div className="flex items-start gap-2 flex-shrink-0">
            <DateTimeStack />
            <button onClick={() => setShowSummary(true)}
              className="bg-white/10 hover:bg-white/20 rounded-xl p-2 active:scale-95 transition-transform">
              <BarChart3 size={20} className="text-primary" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
          <input
            type="text"
            placeholder="Cari nama driver, ID scan, lokasi..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-white/40 text-sm
                       pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none"
          />
        </div>
      </div>

      {/* Rentang tanggal (spec riwayat.md §4: Hari Ini/Kemarin/7 Hari/30 Hari) */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex gap-2 overflow-x-auto">
        <Calendar size={16} className="text-gray-400 flex-shrink-0 mt-1" />
        {DATE_RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setDateRange(r.key)}
            className={clsx(
              'flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors',
              dateRange === r.key ? 'bg-primary text-secondary' : 'bg-gray-100 text-gray-500'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary strip */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Total',   value: summary.total,        color: 'text-gray-800' },
            { label: 'Valid',   value: summary.validScans,   color: 'text-green-600' },
            { label: 'Pending', value: summary.pendingScans, color: 'text-yellow-600' },
            { label: 'Absensi', value: absensies.length,     color: 'text-blue-600' },
          ].map(s => (
            <div key={s.label}>
              <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-400 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
        {scans.length > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
              <span>Tingkat Validasi</span>
              <span className="font-bold text-green-600">{summary.rate}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${summary.rate}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-200 px-4">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5',
              tab === t.key ? 'text-primary border-b-2 border-primary' : 'text-gray-400'
            )}
          >
            {t.label}
            {(t.count ?? 0) > 0 && (
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                tab === t.key ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status Filter */}
      {(tab === 'semua' || tab === 'scan') && (
        <div className="px-4 py-2.5 flex gap-2 bg-white border-b border-gray-100">
          {(['semua', 'valid', 'pending'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors',
                statusFilter === s ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-500'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        {loading && (
          <div className="text-center py-10 text-gray-400 text-sm">
            <Clock size={24} className="mx-auto mb-2 opacity-40 animate-pulse" />
            Memuat riwayat...
          </div>
        )}

        {/* Scan list — tap untuk detail */}
        {!loading && (tab === 'semua' || tab === 'scan') && filteredScans.map(scan => (
          <button
            key={scan.id}
            onClick={() => setDetail({ type: 'scan', data: scan })}
            className="card w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
          >
            <div className={clsx(
              'p-2.5 rounded-xl flex-shrink-0',
              scan.status === 'valid' ? 'bg-green-50' : scan.status === 'pending' ? 'bg-yellow-50' : 'bg-red-50'
            )}>
              <ScanLine size={18} className={
                scan.status === 'valid' ? 'text-green-600' : scan.status === 'pending' ? 'text-yellow-600' : 'text-red-600'
              } />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm text-gray-800 truncate">
                  {(scan as any).raos_drivers?.name ?? 'Driver tidak diketahui'}
                </p>
                <span className={clsx(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0',
                  scan.status === 'valid'   ? 'badge-valid' :
                  scan.status === 'pending' ? 'badge-pending' : 'badge-rejected'
                )}>
                  {scan.status.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {scan.scan_id} •{' '}
                {new Date(scan.scanned_at).toLocaleString('id-ID', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
          </button>
        ))}

        {/* Absensi list — tap untuk detail */}
        {!loading && (tab === 'semua' || tab === 'absensi') && absensies.map(att => (
          <button
            key={att.id}
            onClick={() => setDetail({ type: 'absensi', data: att })}
            className="card w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
          >
            <div className="bg-blue-50 p-2.5 rounded-xl flex-shrink-0">
              <UserCheck size={18} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-gray-800">Absensi</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(att.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className={clsx(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full capitalize',
                  att.status === 'hadir' ? 'badge-valid'
                    : att.status === 'terlambat' ? 'badge-pending' : 'badge-rejected'
                )}>
                  {att.status.toUpperCase()}
                </span>
              </div>
              <div className="flex gap-3 mt-1">
                {att.check_in_at && (
                  <span className="text-[11px] text-green-600 font-semibold">
                    Masuk: {new Date(att.check_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {att.check_out_at && (
                  <span className="text-[11px] text-primary font-semibold">
                    Pulang: {new Date(att.check_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}

        {/* Isi Saldo list — 4-state lifecycle: Pending 🟡 → Approved 🟢 → Paid 🔵 / Rejected 🔴 */}
        {!loading && (tab === 'semua' || tab === 'saldo') && saldoRequests.map(req => {
          const meta = saldoLifecycleMeta(req)
          const Icon = meta.icon
          return (
            <div key={req.id} className="card flex items-start gap-3">
              <div className={clsx('p-2.5 rounded-xl flex-shrink-0 relative', meta.bgSoft)}>
                <Icon size={18} className={meta.textStrong} />
                <span className={clsx(
                  'absolute -top-1 -right-1 w-3 h-3 rounded-full ring-2 ring-white',
                  meta.dot,
                  meta.status === 'pending' && 'animate-pulse'
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm text-gray-800 truncate">
                    Isi Saldo Rp{Number(req.nominal).toLocaleString('id-ID')}
                  </p>
                  <span className={clsx(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap',
                    meta.badgeCls
                  )}>
                    {meta.emoji} {meta.label}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {req.request_no} · {new Date(req.requested_at).toLocaleString('id-ID', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                  {req.driver_name && <span className="text-gray-500"> · Driver: {req.driver_name}</span>}
                </p>
                {/* Info lifecycle sesuai state */}
                {meta.status === 'approved' && req.approved_by_user?.full_name && (
                  <p className="text-[11px] text-emerald-600 mt-0.5">
                    Disetujui oleh {req.approved_by_user.full_name}
                    {req.approved_at && ` · ${new Date(req.approved_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    <span className="block text-[10px] text-gray-400">Menunggu Finance untuk melunasi.</span>
                  </p>
                )}
                {meta.status === 'paid' && (
                  <p className="text-[11px] text-sky-700 mt-0.5">
                    Dilunasi{req.processed_by_user?.full_name ? ` oleh ${req.processed_by_user.full_name}` : ''}
                    {req.processed_at && ` · ${new Date(req.processed_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    {req.note && <span className="block text-[10px] text-gray-500">Catatan: {req.note}</span>}
                  </p>
                )}
                {meta.status === 'rejected' && req.rejection_reason && (
                  <p className="text-[11px] text-red-600 mt-0.5">
                    Alasan: {req.rejection_reason}
                  </p>
                )}
              </div>
            </div>
          )
        })}

        {!loading && filteredScans.length === 0 && absensies.length === 0 && saldoRequests.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Clock size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Belum ada riwayat di rentang ini</p>
            <p className="text-xs text-gray-300 mt-1">Coba ubah rentang tanggal di atas</p>
          </div>
        )}
      </div>

      {/* ===== MODAL: DETAIL AKTIVITAS (spec riwayat.md §3) ===== */}
      {detail && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center"
             onClick={() => setDetail(null)}>
          <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-black text-gray-800">Detail Aktivitas</h3>
              <button onClick={() => setDetail(null)} className="bg-gray-100 rounded-full p-1.5">
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Status besar */}
              <div className="text-center py-2">
                {detail.type === 'scan' ? (
                  <>
                    <div className={clsx(
                      'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2',
                      detail.data.status === 'valid' ? 'bg-green-100' :
                      detail.data.status === 'pending' ? 'bg-yellow-100' : 'bg-red-100'
                    )}>
                      <CheckCircle2 size={32} className={
                        detail.data.status === 'valid' ? 'text-green-500' :
                        detail.data.status === 'pending' ? 'text-yellow-500' : 'text-red-500'
                      } />
                    </div>
                    <p className={clsx('font-black text-lg uppercase',
                      detail.data.status === 'valid' ? 'text-green-600' :
                      detail.data.status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                    )}>
                      {detail.data.status}
                    </p>
                    {detail.data.status === 'pending' && (
                      <p className="text-xs text-gray-400">Menunggu validasi dari Koordinator</p>
                    )}
                    {detail.data.status === 'valid' && (
                      <p className="text-xs text-gray-400">Telah divalidasi Koordinator</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2">
                      <UserCheck size={32} className="text-blue-500" />
                    </div>
                    <p className="font-black text-lg text-blue-600 uppercase capitalize">{detail.data.status}</p>
                  </>
                )}
              </div>

              {/* Rincian */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                {detail.type === 'scan' ? (
                  <>
                    <DetailRow icon={ScanLine} label="Jenis Aktivitas" value="Scan Barcode" />
                    <DetailRow icon={Clock} label="Waktu"
                      value={new Date(detail.data.scanned_at).toLocaleString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      }) + ' WIB'} />
                    <DetailRow icon={ScanLine} label="ID Scan" value={detail.data.scan_id} />
                    <DetailRow icon={User} label="Driver" value={detail.data.raos_drivers?.name ?? '—'} />
                    <DetailRow icon={Car} label="Kendaraan"
                      value={[detail.data.raos_drivers?.vehicle_type, detail.data.raos_drivers?.vehicle_plate]
                        .filter(Boolean).join(' — ') || '—'} />
                    <DetailRow icon={MapPin} label="Lokasi Pickup"
                      value={detail.data.pickup_points?.name ?? '—'} />
                    <DetailRow icon={CheckCircle2} label="Admin Check"
                      value={detail.data.admin_checked ? 'Sudah dicek' : 'Belum dicek'} />
                  </>
                ) : (
                  <>
                    <DetailRow icon={UserCheck} label="Jenis Aktivitas" value="Absensi" />
                    <DetailRow icon={Calendar} label="Tanggal"
                      value={new Date(detail.data.date).toLocaleDateString('id-ID', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                      })} />
                    <DetailRow icon={Clock} label="Shift"
                      value={detail.data.shifts
                        ? `${detail.data.shifts.name} (${detail.data.shifts.start_time?.slice(0,5)}–${detail.data.shifts.end_time?.slice(0,5)})`
                        : '—'} />
                    <DetailRow icon={Clock} label="Masuk"
                      value={detail.data.check_in_at
                        ? new Date(detail.data.check_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
                        : '—'} />
                    <DetailRow icon={Clock} label="Pulang"
                      value={detail.data.check_out_at
                        ? new Date(detail.data.check_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
                        : '—'} />
                    <DetailRow icon={MapPin} label="Lokasi"
                      value={detail.data.pickup_points?.name ?? 'Tidak terdeteksi'} />
                    <DetailRow icon={MapPin} label="Status GPS"
                      value={detail.data.is_location_valid ? '✓ Dalam area valid' : 'Di luar radius'} />
                  </>
                )}
              </div>

              <button className="btn-primary" onClick={() => setDetail(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: RINGKASAN BULANAN (spec riwayat.md §5) ===== */}
      {showSummary && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center"
             onClick={() => setShowSummary(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-black text-gray-800">Ringkasan Aktivitas</h3>
              <button onClick={() => setShowSummary(false)} className="bg-gray-100 rounded-full p-1.5">
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Metrik */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total Aktivitas', value: summary.total,        color: 'bg-gray-50 text-gray-800' },
                  { label: 'Scan Valid',      value: summary.validScans,   color: 'bg-green-50 text-green-700' },
                  { label: 'Scan Pending',    value: summary.pendingScans, color: 'bg-yellow-50 text-yellow-700' },
                  { label: 'Absensi Masuk',   value: summary.masuk,        color: 'bg-blue-50 text-blue-700' },
                  { label: 'Absensi Pulang',  value: summary.pulang,       color: 'bg-indigo-50 text-indigo-700' },
                  { label: 'Tingkat Validasi', value: `${summary.rate}%`,  color: 'bg-primary/10 text-primary' },
                ].map(m => (
                  <div key={m.label} className={`${m.color} rounded-xl p-3 text-center`}>
                    <p className="text-xl font-black">{m.value}</p>
                    <p className="text-[9px] font-semibold mt-0.5 opacity-70">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Grafik Aktivitas harian */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                  Grafik Aktivitas Harian
                </p>
                {summary.days.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-6">Belum ada data di rentang ini</p>
                ) : (
                  <div className="flex items-end gap-1 h-32 border-b border-gray-200 pb-1">
                    {summary.days.map(([date, v]) => {
                      const total = v.scan + v.absensi
                      const hScan = (v.scan / summary.maxVal) * 100
                      const hAbs  = (v.absensi / summary.maxVal) * 100
                      return (
                        <div key={date} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5">
                          <span className="text-[8px] text-gray-400 font-bold">{total}</span>
                          <div className="w-full flex flex-col justify-end" style={{ height: '85%' }}>
                            <div className="w-full bg-blue-400 rounded-t-sm" style={{ height: `${hAbs}%` }} />
                            <div className="w-full bg-green-500" style={{ height: `${hScan}%` }} />
                          </div>
                          <span className="text-[8px] text-gray-400">{date.slice(8)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="flex gap-4 mt-2 justify-center">
                  <span className="flex items-center gap-1 text-[10px] text-gray-500">
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-sm" /> Scan
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-gray-500">
                    <span className="w-2.5 h-2.5 bg-blue-400 rounded-sm" /> Absensi
                  </span>
                </div>
              </div>

              <button className="btn-primary" onClick={() => setShowSummary(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

interface SaldoLifecycleMeta {
  status: 'pending' | 'approved' | 'paid' | 'rejected'
  label: string
  emoji: string
  icon: typeof Wallet
  badgeCls: string
  bgSoft: string
  textStrong: string
  dot: string
}

/**
 * 4-state lifecycle Isi Saldo — dipetakan dari kolom SSOT
 * raos_saldo_requests (tidak ada kolom baru diperkenalkan):
 *   🟡 Pending  = status='pending' && !is_processed
 *   🟢 Approved = status='approved' && !is_processed (koord validasi, tunggu Finance)
 *   🔵 Paid     = is_processed=true (Finance/admin lunasi)
 *   🔴 Rejected = status='rejected' | 'cancelled'
 */
function saldoLifecycleMeta(req: {
  status: string
  is_processed: boolean
}): SaldoLifecycleMeta {
  if (req.is_processed) {
    return {
      status: 'paid', label: 'PAID', emoji: '🔵', icon: Wallet,
      badgeCls: 'bg-sky-100 text-sky-700', bgSoft: 'bg-sky-50', textStrong: 'text-sky-600', dot: 'bg-sky-500',
    }
  }
  if (req.status === 'rejected' || req.status === 'cancelled') {
    return {
      status: 'rejected', label: req.status.toUpperCase(), emoji: '🔴', icon: XCircle,
      badgeCls: 'bg-red-100 text-red-700', bgSoft: 'bg-red-50', textStrong: 'text-red-600', dot: 'bg-red-500',
    }
  }
  if (req.status === 'approved') {
    return {
      status: 'approved', label: 'APPROVED', emoji: '🟢', icon: CheckCircle2,
      badgeCls: 'bg-emerald-100 text-emerald-700', bgSoft: 'bg-emerald-50', textStrong: 'text-emerald-600', dot: 'bg-emerald-500',
    }
  }
  return {
    status: 'pending', label: 'PENDING', emoji: '🟡', icon: Clock,
    badgeCls: 'bg-amber-100 text-amber-700', bgSoft: 'bg-amber-50', textStrong: 'text-amber-600', dot: 'bg-amber-400',
  }
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 flex items-start justify-between gap-2">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-semibold text-gray-800 text-right">{value}</span>
      </div>
    </div>
  )
}
