'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, Target, User, ClipboardList, TrendingUp } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { supabase } from '@/lib/supabase'

type Branch = {
  id: string
  code: string
  name: string
}

type Staff = {
  user_id: string
  staff_id: string
  full_name: string
  role: string
}

function monthInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function numOrNull(v: string): number | null {
  const trimmed = v.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (Number.isNaN(n)) return null
  return n
}

export default function AdminSoetaKpiPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const [month, setMonth] = useState(monthInput(new Date()))
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [branchTarget, setBranchTarget] = useState<any>(null)

  const [staffList, setStaffList] = useState<Staff[]>([])
  const [selectedStaff, setSelectedStaff] = useState('')
  const [staffTarget, setStaffTarget] = useState<any>(null)
  const [manual, setManual] = useState<any>(null)

  const [mode, setMode] = useState<'order' | 'saldo'>('order')
  const [targetCabang, setTargetCabang] = useState('')
  const [targetStaffDefault, setTargetStaffDefault] = useState('')
  const [targetGmv, setTargetGmv] = useState('')

  const [targetOrder, setTargetOrder] = useState('')
  const [targetGmvStaff, setTargetGmvStaff] = useState('')
  const [memberParkir, setMemberParkir] = useState('0')

  const [sopScore, setSopScore] = useState('')
  const [coachingScore, setCoachingScore] = useState('')
  const [coordinatorScore, setCoordinatorScore] = useState('')
  const [notes, setNotes] = useState('')

  const [preview, setPreview] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role,is_active')
        .eq('id', session.user.id)
        .single()
      const role = String(profile?.role ?? '').toLowerCase()
      if (!profile?.is_active || !['admin','direksi','direktur'].includes(role)) {
        router.replace('/dashboard')
        return
      }
      setIsAdmin(true)
      loadBranches()
    })
  }, [router])

  async function loadBranches() {
    const { data } = await supabase
      .from('branches')
      .select('id,code,name')
      .eq('code', 'SOETA')
      .eq('is_active', true)
      .order('code')
    const list = (data ?? []) as Branch[]
    setBranches(list)
    if (list.length) setSelectedBranch(list[0].id)
    setLoading(false)
  }

  useEffect(() => {
    if (!selectedBranch || !month || !isAdmin) return
    loadBranchTarget()
    loadStaffList()
  }, [selectedBranch, month, isAdmin])

  useEffect(() => {
    if (!selectedStaff || !month || !isAdmin) return
    loadStaffTarget()
    loadManual()
    loadPreview()
  }, [selectedStaff, month, isAdmin])

  async function loadBranchTarget() {
    const { data } = await supabase
      .from('raos_kpi_targets_branch')
      .select('*')
      .eq('branch_id', selectedBranch)
      .eq('effective_month', month)
      .maybeSingle()
    setBranchTarget(data)
    if (data) {
      setMode(data.mode ?? 'order')
      setTargetCabang(data.target_cabang?.toString() ?? '')
      setTargetStaffDefault(data.target_staff_default?.toString() ?? '')
      setTargetGmv(data.target_gmv?.toString() ?? '')
    } else {
      setMode('order')
      setTargetCabang('')
      setTargetStaffDefault('')
      setTargetGmv('')
    }
  }

  async function loadStaffList() {
    const { data } = await supabase.rpc('raos_soeta_canonical_staff_list', { p_month: month })
    setStaffList((data ?? []) as Staff[])
    if ((data ?? []).length) setSelectedStaff((data as Staff[])[0].user_id)
  }

  async function loadStaffTarget() {
    const { data } = await supabase
      .from('raos_kpi_targets_staff')
      .select('target_order,target_gmv,member_parkir_amount')
      .eq('staff_id', selectedStaff)
      .eq('effective_month', month)
      .maybeSingle()
    setStaffTarget(data)
    setTargetOrder(data?.target_order?.toString() ?? '')
    setTargetGmvStaff(data?.target_gmv?.toString() ?? '')
    setMemberParkir(data?.member_parkir_amount?.toString() ?? '0')
  }

  async function loadManual() {
    const { data } = await supabase
      .from('raos_soeta_kpi_manual_inputs')
      .select('sop_score,coaching_score,coordinator_score,notes')
      .eq('staff_id', selectedStaff)
      .eq('effective_month', month)
      .maybeSingle()
    setManual(data)
    setSopScore(data?.sop_score?.toString() ?? '')
    setCoachingScore(data?.coaching_score?.toString() ?? '')
    setCoordinatorScore(data?.coordinator_score?.toString() ?? '')
    setNotes(data?.notes ?? '')
  }

  async function loadPreview() {
    const { data, error } = await supabase.rpc('raos_soeta_payroll_kpi_preview', {
      p_staff_id: selectedStaff,
      p_month: month
    })
    if (error) { setPreview(null); return }
    setPreview(data)
  }

  async function saveBranchTarget(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setMessage('')
    const { data, error } = await supabase.rpc('raos_kpi_targets_branch_upsert', {
      p_branch_id: selectedBranch,
      p_month: month,
      p_mode: mode,
      p_target_cabang: Number(targetCabang),
      p_target_staff_default: numOrNull(targetStaffDefault),
      p_target_gmv: numOrNull(targetGmv)
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setMessage('Target cabang disimpan.')
    setBranchTarget(data)
  }

  async function saveStaffTarget(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setMessage('')
    const { data, error } = await supabase.rpc('raos_kpi_targets_staff_upsert', {
      p_staff_id: selectedStaff,
      p_month: month,
      p_target_order: numOrNull(targetOrder),
      p_target_gmv: numOrNull(targetGmvStaff),
      p_member_parkir_amount: Number(memberParkir || 0)
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setMessage('Target staff disimpan.')
    setStaffTarget(data)
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setMessage('')
    const { data, error } = await supabase.rpc('raos_soeta_kpi_manual_inputs_upsert', {
      p_staff_id: selectedStaff,
      p_month: month,
      p_sop_score: numOrNull(sopScore),
      p_coaching_score: numOrNull(coachingScore),
      p_coordinator_score: numOrNull(coordinatorScore),
      p_notes: notes || null
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setMessage('Input manual KPI disimpan.')
    setManual(data)
    await loadPreview()
  }

  const missingPillars = useMemo(() => {
    if (!preview?.kpi?.pillars) return []
    const p = preview.kpi.pillars
    const list = []
    if ((p.order?.target ?? 0) <= 0) list.push('Target Order')
    if ((p.gmv?.target ?? 0) <= 0) list.push('Target GMV')
    if ((p.attendance?.expectedDays ?? 0) <= 0) list.push('Jadwal/Kehadiran')
    if (manual?.sop_score == null) list.push('SOP')
    if (manual?.coaching_score == null) list.push('Pembinaan Driver')
    if (manual?.coordinator_score == null) list.push('Penilaian Koordinator')
    return list
  }, [preview, manual])

  if (!isAdmin) return null

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base">SOETA KPI Admin</h1>
            <p className="text-white/50 text-xs">Target &amp; Manual KPI</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Bulan</label>
            <input
              type="date"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="mt-1 w-full rounded-lg bg-white text-gray-900 px-3 py-2 text-sm font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Cabang SOETA</label>
            <select
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              className="mt-1 w-full rounded-lg bg-white text-gray-900 px-3 py-2 text-sm font-semibold"
            >
              {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Staff Kanonik</label>
            <select
              value={selectedStaff}
              onChange={e => setSelectedStaff(e.target.value)}
              className="mt-1 w-full rounded-lg bg-white text-gray-900 px-3 py-2 text-sm font-semibold"
            >
              {staffList.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name} ({s.staff_id})</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {loading && <div className="text-center py-8 text-sm text-gray-400">Memuat...</div>}
        {error && <div className="card bg-red-50 text-red-600 text-sm">{error}</div>}
        {message && <div className="card bg-green-50 text-green-700 text-sm">{message}</div>}

        {/* Target Cabang */}
        <form onSubmit={saveBranchTarget} className="card space-y-3">
          <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
            <Building2 size={18} className="text-secondary" />
            Target Cabang
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500">Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value as any)} className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="order">ORDER / SCAN</option>
                <option value="saldo">SALDO</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Target Cabang</label>
              <input type="number" min={0} value={targetCabang} onChange={e => setTargetCabang(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="kosong = tidak dihitung" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Target Staff Default (opsional)</label>
              <input type="number" min={0} value={targetStaffDefault} onChange={e => setTargetStaffDefault(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="kosong = auto" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Target GMV Cabang (opsional)</label>
              <input type="number" min={0} step="0.01" value={targetGmv} onChange={e => setTargetGmv(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="kosong = 0" />
            </div>
          </div>
          <button disabled={saving} className="w-full py-2 bg-primary text-white rounded-lg text-sm font-bold">Simpan Target Cabang</button>
        </form>

        {/* Target Staff */}
        <form onSubmit={saveStaffTarget} className="card space-y-3">
          <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
            <User size={18} className="text-secondary" />
            Override Target Staff
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500">Target Order (opsional)</label>
              <input type="number" min={0} value={targetOrder} onChange={e => setTargetOrder(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="kosong = auto" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Target GMV Staff (opsional)</label>
              <input type="number" min={0} step="0.01" value={targetGmvStaff} onChange={e => setTargetGmvStaff(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="kosong = auto" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Member Parkir</label>
              <input type="number" min={0} value={memberParkir} onChange={e => setMemberParkir(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>
          <button disabled={saving} className="w-full py-2 bg-primary text-white rounded-lg text-sm font-bold">Simpan Override Staff</button>
        </form>

        {/* Manual KPI */}
        <form onSubmit={saveManual} className="card space-y-3">
          <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
            <ClipboardList size={18} className="text-secondary" />
            Input Manual KPI
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-gray-500">SOP (0-100)</label>
              <input type="number" min={0} max={100} step="0.01" value={sopScore} onChange={e => setSopScore(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="kosong" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Pembinaan Driver</label>
              <input type="number" min={0} max={100} step="0.01" value={coachingScore} onChange={e => setCoachingScore(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="kosong" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Penilaian Koordinator</label>
              <input type="number" min={0} max={100} step="0.01" value={coordinatorScore} onChange={e => setCoordinatorScore(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="kosong" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Catatan</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" rows={2} />
          </div>
          <button disabled={saving} className="w-full py-2 bg-primary text-white rounded-lg text-sm font-bold">Simpan Manual KPI</button>
        </form>

        {/* KPI Readiness */}
        <div className="card">
          <div className="flex items-center gap-2 text-gray-700 font-bold text-sm mb-2">
            <TrendingUp size={18} className="text-secondary" />
            KPI Readiness Preview
          </div>
          {preview ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">payrollReady</span>
                <span className={preview.payrollReady ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                  {preview.payrollReady ? 'Siap' : 'Belum'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">KPI Score</span>
                <span>{Number(preview.kpiScore ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Bonus KPI</span>
                <span>Rp {Number(preview.proposedBonusKpi ?? 0).toLocaleString('id-ID')}</span>
              </div>
              {missingPillars.length > 0 && (
                <div className="bg-yellow-50 rounded p-2 text-yellow-800 text-xs">
                  <p className="font-bold mb-1">Pilar yang belum lengkap:</p>
                  <ul className="list-disc pl-4">
                    {missingPillars.map(p => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">Pilih staff dan bulan untuk melihat preview.</div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
