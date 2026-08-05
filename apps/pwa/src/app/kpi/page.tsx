'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCachedQuery } from '@/lib/apiCache'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Target, TrendingUp, CalendarCheck, Banknote } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/types'

const BULAN = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
]

export default function KpiPage() {
  const router = useRouter()
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)

  const now = new Date()
  const bulan = now.getMonth() + 1
  const tahun = now.getFullYear()
  const startMonth = `${tahun}-${String(bulan).padStart(2, '0')}-01`

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      setSessionUserId(session.user.id)
    })
  }, [router])

  // 3 query paralel cache-first — TTL 30m (KPI bulanan tidak sering berubah)
  const { data: user } = useCachedQuery<UserProfile>(
    ['user-profile', sessionUserId],
    async () => {
      const { data } = await supabase
        .from('user_profiles').select('*, branches(*)').eq('id', sessionUserId!).single()
      return data as UserProfile
    },
    { enabled: !!sessionUserId, ttlMs: 30 * 60 * 1000 }
  )

  const { data: kpi } = useCachedQuery<any>(
    ['kpi-target', sessionUserId, tahun, bulan],
    async () => {
      const { data } = await supabase
        .from('kpi_targets').select('*')
        .eq('staff_id', sessionUserId!).eq('month', bulan).eq('year', tahun).single()
      return data
    },
    { enabled: !!sessionUserId, ttlMs: 30 * 60 * 1000 }
  )

  const { data: scanStatsData, loading } = useCachedQuery(
    ['kpi-scan-stats', sessionUserId, tahun, bulan],
    async () => {
      const { data: scans } = await supabase
        .from('scan_orders').select('status, gmv')
        .eq('staff_id', sessionUserId!).gte('scanned_at', startMonth)
      const s = scans || []
      return {
        total: s.length,
        valid: s.filter(x => x.status === 'valid').length,
        gmv: s.reduce((sum, x) => sum + (parseFloat(x.gmv as any) || 0), 0),
      }
    },
    { enabled: !!sessionUserId, ttlMs: 15 * 60 * 1000, refreshIntervalMs: 15 * 60 * 1000 }
  )
  const scanStats = scanStatsData ?? { total: 0, valid: 0, gmv: 0 }

  const targetScan = kpi?.target_scan || 0
  const pctScan = targetScan > 0 ? Math.min((scanStats.valid / targetScan) * 100, 100) : 0

  const metrics = [
    {
      icon: Target,
      label: 'Scan Valid',
      value: `${scanStats.valid}${targetScan ? ` / ${targetScan}` : ''}`,
      pct: pctScan,
      color: 'bg-blue-500',
    },
    {
      icon: Banknote,
      label: 'GMV Bulan Ini',
      value: `Rp ${scanStats.gmv.toLocaleString('id-ID')}`,
      pct: kpi?.target_gmv > 0 ? Math.min((scanStats.gmv / kpi.target_gmv) * 100, 100) : 0,
      color: 'bg-green-500',
    },
    {
      icon: CalendarCheck,
      label: 'Kehadiran',
      value: `${kpi?.actual_attendance_pct ?? 0}%`,
      pct: parseFloat(kpi?.actual_attendance_pct ?? 0),
      color: 'bg-orange-500',
    },
  ]

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base">KPI Saya</h1>
            <p className="text-white/50 text-xs">{BULAN[bulan - 1]} {tahun}</p>
          </div>
        </div>

        {/* KPI Total Circle */}
        <div className="flex flex-col items-center py-2">
          <div className="relative w-28 h-28">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="#F5A623" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(parseFloat(kpi?.actual_kpi_pct ?? 0) / 100) * 264} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-primary">
                {kpi?.actual_kpi_pct ?? 0}%
              </span>
              <span className="text-[9px] text-white/50">KPI TOTAL</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading && (
          <div className="text-center py-6 text-gray-400 text-sm">Memuat KPI...</div>
        )}

        {!loading && !kpi && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <TrendingUp size={28} className="text-yellow-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-yellow-800">Target belum diset</p>
            <p className="text-xs text-yellow-600 mt-1">
              Hubungi Admin untuk menetapkan target KPI bulan ini
            </p>
          </div>
        )}

        {!loading && metrics.map(({ icon: Icon, label, value, pct, color }) => (
          <div key={label} className="card">
            <div className="flex items-center gap-3 mb-2">
              <div className={`${color} p-2 rounded-xl`}>
                <Icon size={16} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-bold text-gray-800">{value}</p>
              </div>
              <span className="text-sm font-bold text-gray-600">{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${color} rounded-full transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ))}

        {/* Info bobot KPI */}
        <div className="card bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 mb-2">BOBOT PENILAIAN KPI</p>
          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex justify-between"><span>Order (Scan Valid)</span><span className="font-semibold">40%</span></div>
            <div className="flex justify-between"><span>GMV</span><span className="font-semibold">20%</span></div>
            <div className="flex justify-between"><span>Kehadiran</span><span className="font-semibold">15%</span></div>
            <div className="flex justify-between"><span>Lainnya</span><span className="font-semibold">25%</span></div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
