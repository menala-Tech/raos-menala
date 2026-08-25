'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Banknote, Calendar, Play, Eye } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { supabase } from '@/lib/supabase'

function monthInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function AdminSoetaPayrollPreparePage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [month, setMonth] = useState(monthInput(new Date()))
  const [dryResult, setDryResult] = useState<any>(null)
  const [cutoverResult, setCutoverResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

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
    })
  }, [router])

  async function runDryRun() {
    setLoading(true); setError(''); setMessage(''); setDryResult(null); setCutoverResult(null)
    const { data, error } = await supabase.rpc('raos_soeta_payroll_base_prepare', {
      p_month: month,
      p_apply: false
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDryResult(data)
  }

  async function runApply() {
    setLoading(true); setError(''); setMessage(''); setDryResult(null); setCutoverResult(null)
    const { data, error } = await supabase.rpc('raos_soeta_payroll_base_prepare', {
      p_month: month,
      p_apply: true
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDryResult(data)
    setMessage('Payroll skeleton berhasil dibuat untuk SOETA.')
  }

  async function runCutoverDry() {
    setLoading(true); setError(''); setMessage(''); setCutoverResult(null)
    const { data, error } = await supabase.rpc('raos_soeta_payroll_kpi_cutover', {
      p_staff_id: null,
      p_month: month,
      p_apply: false
    } as any)
    setLoading(false)
    if (error) { setError(error.message); return }
    setCutoverResult(data)
  }

  async function runCutoverApply() {
    setLoading(true); setError(''); setMessage(''); setCutoverResult(null)
    const { data, error } = await supabase.rpc('raos_soeta_payroll_kpi_cutover', {
      p_staff_id: null,
      p_month: month,
      p_apply: true
    } as any)
    setLoading(false)
    if (error) { setError(error.message); return }
    setCutoverResult(data)
    setMessage('Payroll cutover berhasil diterapkan untuk SOETA.')
  }

  if (!isAdmin) return null

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base">SOETA Payroll Prepare</h1>
            <p className="text-white/50 text-xs">Base + KPI Cutover</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {error && <div className="card bg-red-50 text-red-600 text-sm">{error}</div>}
        {message && <div className="card bg-green-50 text-green-700 text-sm">{message}</div>}

        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
            <Calendar size={18} className="text-secondary" />
            Bulan Efektif
          </div>
          <input
            type="date"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
            <Banknote size={18} className="text-secondary" />
            1. Payroll Base Prepare (canonical 43 only)
          </div>
          <p className="text-xs text-gray-500">
            Membuat skeleton raos_payroll untuk 43 staff SOETA yang sudah linked &amp; activated.
            Tidak menyentuh staff preactivation atau drift.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={runDryRun}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold"
            >
              <Eye size={16} /> Dry Run
            </button>
            <button
              onClick={runApply}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-2 bg-primary text-white rounded-lg text-sm font-bold"
            >
              <Play size={16} /> Apply
            </button>
          </div>
          {dryResult && (
            <div className="text-sm space-y-1">
              <p><span className="text-gray-500">Apply:</span> {String(dryResult.apply)}</p>
              <p><span className="text-gray-500">Canonical staff:</span> {Number(dryResult.canonicalStaffCount ?? 0)}</p>
              <p><span className="text-gray-500">Inserted:</span> {Number(dryResult.insertedCount ?? 0)}</p>
              <p><span className="text-gray-500">Already existing:</span> {Number(dryResult.alreadyExistingCount ?? 0)}</p>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
            <Banknote size={18} className="text-secondary" />
            2. KPI Cutover (per staff — dry-run/apply)
          </div>
          <p className="text-xs text-gray-500">
            Gunakan setelah payroll skeleton tersedia. Hanya mengupdate bonus_kpi untuk staff yang KPI-nya complete.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={runCutoverDry}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold"
            >
              <Eye size={16} /> Cutover Dry
            </button>
            <button
              onClick={runCutoverApply}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-2 bg-primary text-white rounded-lg text-sm font-bold"
            >
              <Play size={16} /> Cutover Apply
            </button>
          </div>
          {cutoverResult && (
            <div className="text-sm space-y-1">
              <p><span className="text-gray-500">Apply:</span> {String(cutoverResult.apply)}</p>
              <p><span className="text-gray-500">payrollReady:</span> {cutoverResult.payrollReady ? 'Ya' : 'Tidak'}</p>
              <p><span className="text-gray-500">KPI Score:</span> {Number(cutoverResult.kpiScore ?? 0).toFixed(2)}</p>
              <p><span className="text-gray-500">Proposed bonus:</span> Rp {Number(cutoverResult.proposedBonusKpi ?? 0).toLocaleString('id-ID')}</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
