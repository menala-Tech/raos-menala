'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { cacheReadSync, cacheWriteSync } from '@/lib/apiCache'
import AppShell from '@/components/layout/AppShell'
import BrandLoadingShell from '@/components/BrandLoadingShell'
import { ArrowLeft, Download, FileSpreadsheet, Printer, TrendingUp, Banknote, UserCheck, ScanLine } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/types'
import { can } from '@/lib/accessPolicy'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

type RangeKey = 'harian' | 'mingguan' | 'bulanan'

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: 'harian', label: 'Harian', days: 1 },
  { key: 'mingguan', label: 'Mingguan', days: 7 },
  { key: 'bulanan', label: 'Bulanan', days: 30 },
]

interface DayRow {
  date: string
  totalScan: number
  valid: number
  pending: number
  rejected: number
  gmv: number
  absensi: number
}

export default function LaporanPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [range, setRange] = useState<RangeKey>('harian')
  const [rows, setRows] = useState<DayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  const loadReport = useCallback(async (days: number, opts: { forceRefresh?: boolean } = {}, profile?: UserProfile | null) => {
    const cacheKey = ['laporan','aggregate',profile?.id,profile?.role,profile?.branch_id,days]

    // Phase 1: instant render kalau cache ada
    if (!opts.forceRefresh) {
      const cached = cacheReadSync<DayRow[]>(cacheKey, 30 * 60 * 1000)
      if (cached) {
        setRows(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
    } else {
      setLoading(true)
    }

    // Phase 2: fetch fresh selalu (background/foreground)
    const since = new Date()
    since.setDate(since.getDate() - days + 1)
    since.setHours(0, 0, 0, 0)

    const [{ data: scans }, { data: attendance }] = await Promise.all([
      supabase
        .from('scan_orders')
        .select('scanned_at, status, gmv')
        .gte('scanned_at', since.toISOString()),
      supabase
        .from('raos_attendance')
        .select('date')
        .gte('date', since.toISOString().split('T')[0]),
    ])

    const byDate = new Map<string, DayRow>()
    for (let i = 0; i < days; i++) {
      const d = new Date(since)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().split('T')[0]
      byDate.set(key, { date: key, totalScan: 0, valid: 0, pending: 0, rejected: 0, gmv: 0, absensi: 0 })
    }

    scans?.forEach(s => {
      const key = new Date(s.scanned_at).toISOString().split('T')[0]
      const row = byDate.get(key)
      if (!row) return
      row.totalScan++
      if (s.status === 'valid') row.valid++
      else if (s.status === 'pending') row.pending++
      else if (s.status === 'rejected') row.rejected++
      row.gmv += parseFloat(s.gmv as unknown as string) || 0
    })

    attendance?.forEach(a => {
      const row = byDate.get(a.date)
      if (row) row.absensi++
    })

    const fresh = Array.from(byDate.values()).reverse()
    setRows(fresh)
    cacheWriteSync(cacheKey, fresh)
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*, branches(*)')
        .eq('id', session.user.id)
        .single()
      if (!profile || !can(profile.role, 'report:read')) {
        router.push('/dashboard')
        return
      }
      setUser(profile)
      setAuthorized(true)
      loadReport(RANGES.find(r => r.key === range)!.days,{},profile)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  function changeRange(key: RangeKey) {
    setRange(key)
    loadReport(RANGES.find(r => r.key === key)!.days,{},user)
  }

  useRealtimeRefresh(`laporan-${user?.id ?? 'anon'}`,[{table:'scan_orders'},{table:'raos_attendance'}],()=>authorized?loadReport(RANGES.find(r=>r.key===range)!.days,{},user):undefined,500,authorized&&!!user?.id)

  const totals = rows.reduce(
    (acc, r) => ({
      totalScan: acc.totalScan + r.totalScan,
      valid: acc.valid + r.valid,
      gmv: acc.gmv + r.gmv,
      absensi: acc.absensi + r.absensi,
    }),
    { totalScan: 0, valid: 0, gmv: 0, absensi: 0 }
  )

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const sheetData = rows.map(r => ({
      Tanggal: r.date,
      'Total Scan': r.totalScan,
      Valid: r.valid,
      Pending: r.pending,
      Ditolak: r.rejected,
      'GMV (Rp)': r.gmv,
      Absensi: r.absensi,
    }))
    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan')
    XLSX.writeFile(wb, `RAOS_Laporan_${range}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  function exportPdf() {
    window.print()
  }

  if (!authorized) return <BrandLoadingShell label="Memverifikasi akses laporan..." />

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 print:hidden">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base">Laporan & Analitik</h1>
            <p className="text-white/50 text-xs capitalize">{user?.role}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => changeRange(r.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${range === r.key ? 'bg-primary text-white' : 'bg-white/10 text-white/60'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="hidden print:block mb-4">
          <h1 className="font-bold text-lg">Laporan RAOS — {range}</h1>
          <p className="text-xs text-gray-500">Dicetak: {new Date().toLocaleString('id-ID')}</p>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat laporan...</div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: ScanLine, label: 'Total Scan', value: totals.totalScan, color: 'bg-blue-500' },
                { icon: TrendingUp, label: 'Valid', value: totals.valid, color: 'bg-green-500' },
                { icon: Banknote, label: 'Total GMV', value: `Rp ${totals.gmv.toLocaleString('id-ID')}`, color: 'bg-yellow-500' },
                { icon: UserCheck, label: 'Total Absensi', value: totals.absensi, color: 'bg-purple-500' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="card">
                  <div className={`${color} w-8 h-8 rounded-lg flex items-center justify-center mb-2`}>
                    <Icon size={16} className="text-white" />
                  </div>
                  <p className="text-lg font-black text-gray-800">{value}</p>
                  <p className="text-[10px] text-gray-400">{label}</p>
                </div>
              ))}
            </div>

            {/* Export Buttons */}
            <div className="flex gap-2 print:hidden">
              <button onClick={exportExcel} className="flex-1 bg-green-600 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                <FileSpreadsheet size={16} /> Export Excel
              </button>
              <button onClick={exportPdf} className="flex-1 bg-secondary text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                <Printer size={16} /> Cetak / PDF
              </button>
            </div>

            {/* Table */}
            <div className="card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b">
                    <th className="pb-2 pr-2">Tanggal</th>
                    <th className="pb-2 pr-2 text-right">Scan</th>
                    <th className="pb-2 pr-2 text-right">Valid</th>
                    <th className="pb-2 pr-2 text-right">GMV</th>
                    <th className="pb-2 text-right">Absensi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.date} className="border-b border-gray-50">
                      <td className="py-2 pr-2 text-gray-700">
                        {new Date(r.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="py-2 pr-2 text-right text-gray-700">{r.totalScan}</td>
                      <td className="py-2 pr-2 text-right text-green-600 font-medium">{r.valid}</td>
                      <td className="py-2 pr-2 text-right text-gray-700">
                        {r.gmv > 0 ? `${(r.gmv / 1000).toFixed(0)}k` : '-'}
                      </td>
                      <td className="py-2 text-right text-gray-700">{r.absensi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.every(r => r.totalScan === 0 && r.absensi === 0) && (
              <p className="text-center text-gray-400 text-xs py-4">
                Belum ada aktivitas pada periode ini
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
