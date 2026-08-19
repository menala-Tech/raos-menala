'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, CalendarCheck, Target, TrendingUp, Users } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { supabase } from '@/lib/supabase'

type BranchRow = {
  id: string
  code: string
  name: string
  timezone?: string | null
}

type TargetRow = {
  branch_id: string
  effective_month: string
  mode: 'saldo' | 'order'
  target_cabang: number | null
}

type Snapshot = {
  effectiveMonth: string
  selectedBranchId: string
  targetBranchId: string
  branchCode: string
  branchName: string
  timezone: string
  mode: 'saldo' | 'order' | 'unset'
  target: number
  realized: number
  achievementPct: number
  activeStaff: number
  derivedStaffTarget?: number | null
}

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function monthLabel(monthKey?: string) {
  const value = monthKey ? new Date(`${monthKey}T00:00:00Z`) : new Date()
  return `${BULAN[value.getUTCMonth()]} ${value.getUTCFullYear()}`
}

export default function AdminKpiPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role,is_active')
        .eq('id', session.user.id)
        .single()

      const role = String(profile?.role ?? '').toLowerCase()
      if (!profile?.is_active || !['admin','management','direksi','direktur'].includes(role)) {
        router.replace('/dashboard')
        return
      }

      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-01`
      const [{ data: branchRows, error: branchError }, { data: targetRows, error: targetError }] = await Promise.all([
        supabase.from('branches').select('id,code,name,timezone').eq('is_active', true).order('name'),
        supabase.from('raos_kpi_targets_branch').select('branch_id,effective_month,mode,target_cabang').eq('effective_month', month),
      ])

      if (branchError || targetError) {
        setError(branchError?.message || targetError?.message || 'Gagal memuat target cabang.')
        setLoading(false)
        return
      }

      const targetList = (targetRows ?? []) as TargetRow[]
      const targetIds = new Set(targetList.map(t => t.branch_id))
      const canonicalBranches = ((branchRows ?? []) as BranchRow[]).filter(b => targetIds.has(b.id))
      setTargets(targetList)
      setBranches(canonicalBranches)
      if (canonicalBranches.length) setSelectedBranch(canonicalBranches[0].id)
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!selectedBranch) return
    let cancelled = false
    async function loadSnapshot() {
      setError('')
      const { data, error: rpcError } = await supabase.rpc('raos_admin_branch_kpi_snapshot', { p_branch_id: selectedBranch })
      if (cancelled) return
      if (rpcError) {
        setSnapshot(null)
        setError(rpcError.message || 'Gagal memuat KPI cabang.')
        return
      }
      setSnapshot((data ?? null) as Snapshot | null)
    }
    void loadSnapshot()
    return () => { cancelled = true }
  }, [selectedBranch])

  const selectedTarget = useMemo(() => targets.find(t => t.branch_id === selectedBranch) ?? null, [targets, selectedBranch])
  const progress = Math.min(Number(snapshot?.achievementPct ?? 0), 100)
  const isOrder = snapshot?.mode === 'order'
  const isSaldo = snapshot?.mode === 'saldo'

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base">KPI Nasional</h1>
            <p className="text-white/50 text-xs">Head Office • {monthLabel(snapshot?.effectiveMonth ?? selectedTarget?.effective_month)}</p>
          </div>
        </div>

        <div className="bg-white/10 rounded-xl p-3">
          <label className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Pilih Cabang</label>
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white text-gray-900 px-3 py-2 text-sm font-semibold"
          >
            {branches.map(branch => {
              const t = targets.find(x => x.branch_id === branch.id)
              return <option key={branch.id} value={branch.id}>{branch.name} • {t?.mode === 'order' ? 'Order' : 'Saldo'}</option>
            })}
          </select>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading && <div className="text-center py-8 text-sm text-gray-400">Memuat KPI nasional...</div>}
        {error && <div className="card bg-red-50 text-red-600 text-sm">{error}</div>}

        {!loading && snapshot && (
          <>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500 p-2 rounded-xl"><Building2 size={18} className="text-white" /></div>
                <div>
                  <p className="text-xs text-gray-500">Cabang Aktif</p>
                  <p className="font-bold text-gray-800">{snapshot.branchName}</p>
                  <p className="text-[10px] text-gray-400">{snapshot.branchCode} • {snapshot.timezone}</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-blue-500 p-2 rounded-xl"><TrendingUp size={18} className="text-white" /></div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">{isOrder ? 'Scan Valid Cabang' : isSaldo ? 'Realisasi Saldo Cabang' : 'Realisasi'}</p>
                  <p className="font-bold text-gray-800">
                    {isSaldo ? `Rp ${Number(snapshot.realized).toLocaleString('id-ID')}` : Number(snapshot.realized).toLocaleString('id-ID')}
                    {' / '}
                    {isSaldo ? `Rp ${Number(snapshot.target).toLocaleString('id-ID')}` : Number(snapshot.target).toLocaleString('id-ID')}
                  </p>
                </div>
                <span className="font-black text-primary">{Number(snapshot.achievementPct ?? 0).toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3">
                <div className="bg-purple-500 p-2 rounded-xl"><Target size={18} className="text-white" /></div>
                <div>
                  <p className="text-xs text-gray-500">Target Cabang</p>
                  <p className="font-bold text-gray-800">{isSaldo ? `Rp ${Number(snapshot.target).toLocaleString('id-ID')}` : Number(snapshot.target).toLocaleString('id-ID')}</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3">
                <div className="bg-green-500 p-2 rounded-xl"><Users size={18} className="text-white" /></div>
                <div>
                  <p className="text-xs text-gray-500">Staff Aktif dalam Scope</p>
                  <p className="font-bold text-gray-800">{Number(snapshot.activeStaff).toLocaleString('id-ID')} staff</p>
                  {isOrder && snapshot.derivedStaffTarget != null && (
                    <p className="text-[10px] text-gray-400">Target Staff otomatis: {Number(snapshot.derivedStaffTarget).toLocaleString('id-ID')} / staff</p>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500 p-2 rounded-xl"><CalendarCheck size={18} className="text-white" /></div>
                <div>
                  <p className="text-xs text-gray-500">Mode KPI</p>
                  <p className="font-bold text-gray-800">{isOrder ? 'ORDER / SCAN' : isSaldo ? 'SALDO' : 'Belum diset'}</p>
                </div>
              </div>
            </div>

            <div className="card bg-blue-50 text-xs text-blue-700">
              Admin bekerja dari Head Office dan dapat memilih seluruh cabang. Koordinator tetap hanya melihat cabangnya sendiri; Staff tetap hanya KPI dirinya sendiri.
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
