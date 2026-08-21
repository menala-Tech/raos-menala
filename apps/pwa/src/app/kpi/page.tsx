'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCachedQuery } from '@/lib/apiCache'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Target, TrendingUp, CalendarCheck, Banknote, Users, Building2 } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/types'
import { useCanonicalKpi } from '@/lib/useCanonicalKpi'
import { can } from '@/lib/accessPolicy'
import { branchMonthKey } from '@/lib/branchTime'

interface BranchKpiBreakdownRow{
  staff_id:string
  full_name:string
  role:string
  target_saldo:number
  realized_saldo:number
  pct_saldo:number
  target_order:number
  realized_order:number
  pct_order:number
}

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      setSessionUserId(session.user.id)
    })
  }, [router])

  const { data: user } = useCachedQuery<UserProfile>(
    ['user-profile', sessionUserId],
    async () => {
      const { data } = await supabase
        .from('user_profiles').select('*, branches(*)').eq('id', sessionUserId!).single()
      return data as UserProfile
    },
    { enabled: !!sessionUserId, ttlMs: 30 * 60 * 1000 }
  )

  const canonicalKpi=useCanonicalKpi(
    sessionUserId,
    user?.branch_id ?? null,
    (user as any)?.branches?.timezone ?? null,
    user?.role ?? null,
  )

  const loading=canonicalKpi.loading
  const snap=canonicalKpi.data
  const isOrder=snap?.mode==='order'
  // 2026-08-21 fix: scope is mode-agnostic on the canonical RPC response --
  // raos_saldo_kpi_snapshot() now returns scope:'branch' for
  // admin/management/direksi/direktur exactly like raos_order_kpi_snapshot()
  // already did, so isBranch must not be restricted to order mode.
  const isBranch=snap?.scope==='branch'
  const progress=Math.min(Number(snap?.achievementPct ?? 0),100)

  // Koordinator branch-KPI section (2026-08-20): "KPI Saya" above stays
  // personal (snap.scope never becomes 'branch' for koordinator, only
  // admin/management/direksi/direktur reach isBranch=true) -- this is a
  // SEPARATE, additional section built from `snap.branch` (populated only
  // for koordinator by raos_saldo_kpi_snapshot()/raos_order_kpi_snapshot(),
  // see raos_106 migration) plus a dedicated per-person breakdown RPC.
  // Gated on kpi:branch:read per the business rule -- normal Staff never
  // sees this even though the underlying RPC would reject their role
  // server-side anyway (defense in depth, not the only gate).
  const isKoordinator=String(user?.role ?? '').toLowerCase()==='koordinator'
  const showBranchSection=isKoordinator && can(user?.role,'kpi:branch:read') && !!snap?.branch
  const branchMonth=branchMonthKey((user as any)?.branches?.timezone ?? null)

  const { data: breakdown, loading: breakdownLoading } = useCachedQuery<BranchKpiBreakdownRow[]>(
    ['kpi-branch-breakdown', sessionUserId, branchMonth],
    async () => {
      const { data, error } = await supabase.rpc('raos_branch_kpi_breakdown')
      if (error) throw error
      return (data ?? []) as BranchKpiBreakdownRow[]
    },
    { enabled: showBranchSection, ttlMs: 15 * 60 * 1000 }
  )

  const metrics = isOrder ? [
    {
      icon: Target,
      label: isBranch ? 'Scan Valid Cabang' : 'Scan Valid Saya',
      value: `${Number(snap?.realized ?? 0).toLocaleString('id-ID')} / ${Number(snap?.target ?? 0).toLocaleString('id-ID')}`,
      pct: progress,
      color: 'bg-blue-500',
    },
    {
      icon: Users,
      label: isBranch ? 'Target Cabang' : 'Target Cabang / Staff Aktif',
      value: isBranch
        ? Number(snap?.branchTarget ?? snap?.target ?? 0).toLocaleString('id-ID')
        : `${Number(snap?.branchTarget ?? 0).toLocaleString('id-ID')} / ${Number(snap?.activeStaff ?? 0)} staff`,
      pct: 0,
      color: 'bg-purple-500',
    },
    {
      icon: CalendarCheck,
      label: 'Kehadiran',
      value: 'Lihat HRIS',
      pct: 0,
      color: 'bg-orange-500',
    },
  ] : [
    {
      icon: Banknote,
      label: isBranch ? 'Realisasi Saldo Cabang' : 'Realisasi Saldo',
      value: `Rp ${Number(snap?.realized ?? 0).toLocaleString('id-ID')}`,
      pct: progress,
      color: 'bg-green-500',
    },
    {
      icon: Target,
      label: isBranch ? 'Target Saldo Cabang' : 'Target Saldo',
      value: `Rp ${Number(snap?.target ?? 0).toLocaleString('id-ID')}`,
      pct: progress,
      color: 'bg-blue-500',
    },
    {
      icon: CalendarCheck,
      label: 'Kehadiran',
      value: 'Lihat HRIS',
      pct: 0,
      color: 'bg-orange-500',
    },
  ]

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-6 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base">{isBranch ? 'KPI Cabang' : 'KPI Saya'}</h1>
            <p className="text-white/50 text-xs">{BULAN[bulan - 1]} {tahun}</p>
          </div>
        </div>

        <div className="flex flex-col items-center py-2">
          <div className="relative w-28 h-28">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="#F5A623" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(progress / 100) * 264} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-primary">{Number(snap?.achievementPct ?? 0).toFixed(0)}%</span>
              <span className="text-[9px] text-white/50">PENCAPAIAN TARGET</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading && <div className="text-center py-6 text-gray-400 text-sm">Memuat KPI...</div>}

        {!loading && !snap?.target && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <TrendingUp size={28} className="text-yellow-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-yellow-800">Target belum diset</p>
            <p className="text-xs text-yellow-600 mt-1">Hubungi Admin untuk menetapkan target KPI bulan ini</p>
          </div>
        )}

        {!loading && metrics.map(({ icon: Icon, label, value, pct, color }) => (
          <div key={label} className="card">
            <div className="flex items-center gap-3 mb-2">
              <div className={`${color} p-2 rounded-xl`}><Icon size={16} className="text-white" /></div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-bold text-gray-800">{value}</p>
              </div>
              {pct > 0 && <span className="text-sm font-bold text-gray-600">{pct.toFixed(0)}%</span>}
            </div>
            {pct > 0 && (
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        ))}

        {isOrder && !isBranch && snap?.source==='derived_equal_share' && (
          <div className="card bg-blue-50 text-xs text-blue-700">
            Target Staff dihitung otomatis dari Target Cabang ÷ jumlah Staff aktif. Admin dapat memberi target order khusus per Staff bila diperlukan.
          </div>
        )}
        <div className="card bg-gray-50 text-xs text-gray-500">Target dan realisasi mengikuti canonical engine. Hanya scan berstatus VALID yang masuk realisasi order.</div>

        {/* Koordinator branch-supervisory section — separate from KPI Saya
            above, own branch only (kpi:branch:read). */}
        {showBranchSection && snap?.branch && (
          <div className="pt-2 space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Building2 size={16} className="text-secondary" />
              <h2 className="font-bold text-sm text-gray-700">
                TARGET CABANG — {(user as any)?.branches?.name ?? 'Cabang'}
              </h2>
            </div>

            <div className="card">
              <div className="flex items-center gap-3 mb-2">
                <div className={`${isOrder ? 'bg-blue-500' : 'bg-green-500'} p-2 rounded-xl`}>
                  {isOrder ? <Target size={16} className="text-white" /> : <Banknote size={16} className="text-white" />}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">{isOrder ? 'Realisasi Order Cabang' : 'Realisasi Saldo Cabang'}</p>
                  <p className="font-bold text-gray-800">
                    {isOrder
                      ? Number(snap.branch.realized).toLocaleString('id-ID')
                      : `Rp ${Number(snap.branch.realized).toLocaleString('id-ID')}`}
                    {' / '}
                    {isOrder
                      ? Number(snap.branch.target).toLocaleString('id-ID')
                      : `Rp ${Number(snap.branch.target).toLocaleString('id-ID')}`}
                  </p>
                </div>
                <span className="text-sm font-bold text-gray-600">{Math.min(snap.branch.achievementPct,100).toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${isOrder ? 'bg-blue-500' : 'bg-green-500'} rounded-full transition-all`}
                  style={{ width: `${Math.min(snap.branch.achievementPct,100)}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card !p-3">
                <p className="text-[10px] text-gray-500">Sisa Target {isOrder ? 'Order' : 'Saldo'}</p>
                <p className="font-bold text-gray-800 text-sm">
                  {isOrder
                    ? Number(snap.branch.remaining).toLocaleString('id-ID')
                    : `Rp ${Number(snap.branch.remaining).toLocaleString('id-ID')}`}
                </p>
              </div>
              <div className="card !p-3">
                <p className="text-[10px] text-gray-500">Orang Target Aktif</p>
                <p className="font-bold text-gray-800 text-sm">{snap.branch.activePeople} (Staff + Koordinator)</p>
              </div>
            </div>

            <div className="card !p-0 overflow-hidden">
              <p className="text-xs font-bold text-gray-600 px-3 pt-3 pb-2">Breakdown Staff + Koordinator</p>
              {breakdownLoading && <div className="text-center py-4 text-gray-400 text-xs">Memuat breakdown...</div>}
              {!breakdownLoading && (!breakdown || breakdown.length===0) && (
                <div className="text-center py-4 text-gray-400 text-xs">Belum ada Staff/Koordinator aktif di cabang ini.</div>
              )}
              {!breakdownLoading && breakdown && breakdown.length>0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-3 py-2 font-semibold">Nama</th>
                        <th className="text-left px-3 py-2 font-semibold">Role</th>
                        <th className="text-right px-3 py-2 font-semibold">Target</th>
                        <th className="text-right px-3 py-2 font-semibold">Realisasi</th>
                        <th className="text-right px-3 py-2 font-semibold">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.map(row => {
                        const t = isOrder ? row.target_order : row.target_saldo
                        const r = isOrder ? row.realized_order : row.realized_saldo
                        const pct = isOrder ? row.pct_order : row.pct_saldo
                        return (
                          <tr key={row.staff_id} className="border-t border-gray-100">
                            <td className="px-3 py-2 font-medium text-gray-800">{row.full_name}</td>
                            <td className="px-3 py-2 text-gray-500 capitalize">{row.role}</td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {isOrder ? t.toLocaleString('id-ID') : `Rp${t.toLocaleString('id-ID')}`}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {isOrder ? r.toLocaleString('id-ID') : `Rp${r.toLocaleString('id-ID')}`}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-gray-700">{pct.toFixed(0)}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
