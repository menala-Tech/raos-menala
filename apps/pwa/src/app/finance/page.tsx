'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import {
  ArrowLeft, CheckCircle2, Clock, Filter, Loader2, Search, Wallet, XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import { markSaldoRequestProcessed } from '@/lib/saldoRequest'

/**
 * Finance Dashboard — halaman tersentralisir gaya Google Sheets untuk
 * melunasi pengajuan Isi Saldo dari seluruh cabang.
 *
 * Business ownership: RAOS. SSOT: `raos_saldo_requests`. Tidak ada
 * tabel atau logika baru — halaman ini hanya:
 *
 *   - Membaca `raos_saldo_requests` lintas cabang (RLS
 *     `is_branch_in_scope` yang sudah ada + admin/mgmt/direksi bypass).
 *   - Menandai lunas via RPC/helper `markSaldoRequestProcessed` yang
 *     sudah ada (set `is_processed=true`, `processed_at`, `processed_by`).
 *
 * Role akses: admin, management, direksi (staff & koordinator ditolak).
 * Realtime subscribe ke `raos_saldo_requests` supaya centang lain masuk
 * langsung.
 */

type StatusFilter = 'semua' | 'pending' | 'approved' | 'rejected' | 'paid'

interface Row {
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
  driver_login_id: string | null
  driver_name: string | null
  branch: { id: string; name: string; slug: string | null } | null
  staff: { id: string; full_name: string; staff_id: string } | null
  approved_by_user: { full_name: string } | null
  processed_by_user: { full_name: string } | null
}

interface BranchOpt { id: string; name: string; slug: string | null }

const FINANCE_ROLES = ['admin', 'management', 'direksi']

export default function FinanceDashboardPage() {
  const router = useRouter()
  const [me, setMe] = useState<{ id: string; role: string; full_name: string } | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [branches, setBranches] = useState<BranchOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [branchFilter, setBranchFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('raos_saldo_requests')
      .select(
        'id, request_no, nominal, status, is_processed, requested_at,' +
        'approved_at, processed_at, rejection_reason, note,' +
        'driver_login_id, driver_name,' +
        'branch:branches!branch_id(id, name, slug),' +
        'staff:user_profiles!staff_id(id, full_name, staff_id),' +
        'approved_by_user:user_profiles!approved_by(full_name),' +
        'processed_by_user:user_profiles!processed_by(full_name)'
      )
      .order('requested_at', { ascending: false })
      .limit(1000)
    setRows((data ?? []) as unknown as Row[])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase.from('user_profiles')
        .select('id, role, full_name').eq('id', session.user.id).single()
      if (!profile || !FINANCE_ROLES.includes(profile.role)) {
        router.push('/dashboard'); return
      }
      setMe({ id: profile.id, role: profile.role, full_name: profile.full_name })

      const { data: bList } = await supabase.from('branches')
        .select('id, name, slug').eq('is_active', true).order('name')
      setBranches((bList ?? []) as BranchOpt[])

      await load()
    }
    init()
  }, [router, load])

  // Realtime — event apapun di raos_saldo_requests → reload
  useEffect(() => {
    if (!me) return
    const ch = supabase.channel('finance-saldo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raos_saldo_requests' },
        () => { void load() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [me, load])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (branchFilter && r.branch?.id !== branchFilter) return false
      if (statusFilter === 'pending' && (r.is_processed || r.status !== 'pending')) return false
      if (statusFilter === 'approved' && (r.is_processed || r.status !== 'approved')) return false
      if (statusFilter === 'rejected' && r.status !== 'rejected' && r.status !== 'cancelled') return false
      if (statusFilter === 'paid' && !r.is_processed) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = [
          r.request_no, r.driver_name, r.driver_login_id,
          r.staff?.full_name, r.staff?.staff_id, r.branch?.name,
        ].filter(Boolean).map(s => String(s).toLowerCase())
        if (!hay.some(h => h.includes(q))) return false
      }
      return true
    })
  }, [rows, branchFilter, statusFilter, search])

  const totals = useMemo(() => ({
    total:      rows.reduce((s, r) => s + Number(r.nominal), 0),
    pending:    rows.filter(r => !r.is_processed && r.status === 'pending').reduce((s, r) => s + Number(r.nominal), 0),
    approved:   rows.filter(r => !r.is_processed && r.status === 'approved').reduce((s, r) => s + Number(r.nominal), 0),
    paid:       rows.filter(r => r.is_processed).reduce((s, r) => s + Number(r.nominal), 0),
    rejected:   rows.filter(r => r.status === 'rejected' || r.status === 'cancelled').reduce((s, r) => s + Number(r.nominal), 0),
  }), [rows])

  async function handleTogglePaid(row: Row, next: boolean) {
    if (!me) return
    if (!next) {
      alert('Un-mark Paid belum didukung dari UI. Silakan koordinasi via GAS sheet.')
      return
    }
    if (row.is_processed) return
    if (!confirm(`Tandai LUNAS pengajuan ${row.request_no} sebesar Rp${Number(row.nominal).toLocaleString('id-ID')}?`)) return
    const note = prompt('Catatan transaksi (opsional):') ?? undefined
    setBusyId(row.id)
    const r = await markSaldoRequestProcessed(row.id, me.id, note)
    setBusyId(null)
    if (!r.ok) { alert('Gagal tandai lunas: ' + r.error); return }
    await load()
  }

  return (
    <AppShell>
      {/* HEADER */}
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard" aria-label="Kembali"><ArrowLeft size={22} className="text-white/70" /></Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
        </div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl">Finance — Pengisian Saldo</h1>
            <p className="text-white/50 text-xs mt-0.5">Semua cabang · centang untuk tandai lunas</p>
          </div>
          <DateTimeStack />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. request / driver / staff / cabang..."
            className="w-full pl-9 pr-3 py-2 bg-white/10 rounded-xl text-sm text-white placeholder-white/40 outline-none"
          />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Ringkasan nominal per status */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCard label="Menunggu" value={totals.pending} color="text-amber-700 bg-amber-50" />
          <SummaryCard label="Disetujui" value={totals.approved} color="text-emerald-700 bg-emerald-50" />
          <SummaryCard label="Lunas" value={totals.paid} color="text-sky-700 bg-sky-50" />
          <SummaryCard label="Ditolak" value={totals.rejected} color="text-red-700 bg-red-50" />
        </div>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="input !py-1.5 text-xs max-w-[200px]"
          >
            <option value="">Semua Cabang</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1">
            {(['semua', 'pending', 'approved', 'paid', 'rejected'] as StatusFilter[]).map(k => (
              <button
                key={k}
                onClick={() => setStatusFilter(k)}
                className={clsx(
                  'text-[11px] font-semibold px-2 py-1 rounded-lg capitalize',
                  statusFilter === k ? 'bg-white shadow-sm text-secondary' : 'text-gray-500'
                )}
              >
                {k === 'paid' ? 'Lunas' : k === 'pending' ? 'Menunggu' : k === 'approved' ? 'Disetujui' : k === 'rejected' ? 'Ditolak' : 'Semua'}
              </button>
            ))}
          </div>
        </div>

        {/* Tabel spreadsheet-style */}
        <div className="card overflow-x-auto !p-0">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <Th>Lunas</Th>
                <Th>No. Request</Th>
                <Th>Tanggal</Th>
                <Th>Cabang</Th>
                <Th>Driver ID</Th>
                <Th>Driver</Th>
                <Th>Nominal</Th>
                <Th>Staff</Th>
                <Th>Koordinator</Th>
                <Th>Status</Th>
                <Th>Paid At</Th>
                <Th>Catatan</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={12} className="text-center text-gray-400 py-8"><Loader2 size={16} className="animate-spin inline-block mr-1" />Memuat...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={12} className="text-center text-gray-400 py-8"><Filter size={20} className="mx-auto mb-1 opacity-40" />Tidak ada data.</td></tr>
              )}
              {!loading && filtered.map(row => (
                <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <Td>
                    {busyId === row.id ? (
                      <Loader2 size={14} className="animate-spin text-sky-500" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={row.is_processed}
                        onChange={e => handleTogglePaid(row, e.target.checked)}
                        disabled={row.status === 'rejected' || row.status === 'cancelled'}
                        className="w-4 h-4 accent-sky-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        title={row.is_processed ? 'Sudah lunas' : 'Klik untuk tandai lunas'}
                      />
                    )}
                  </Td>
                  <Td className="font-mono text-[10px] whitespace-nowrap">{row.request_no}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(row.requested_at)}</Td>
                  <Td className="whitespace-nowrap">{row.branch?.name ?? '—'}</Td>
                  <Td className="font-mono text-[10px] whitespace-nowrap">{row.driver_login_id ?? '—'}</Td>
                  <Td className="whitespace-nowrap max-w-[180px] truncate">{row.driver_name ?? '—'}</Td>
                  <Td className="text-right font-semibold whitespace-nowrap">Rp{Number(row.nominal).toLocaleString('id-ID')}</Td>
                  <Td className="whitespace-nowrap max-w-[180px] truncate">{row.staff?.full_name ?? '—'}</Td>
                  <Td className="whitespace-nowrap max-w-[180px] truncate">{row.approved_by_user?.full_name ?? '—'}</Td>
                  <Td><StatusBadge row={row} /></Td>
                  <Td className="whitespace-nowrap text-[11px] text-gray-500">
                    {row.processed_at ? formatDateTime(row.processed_at) : '—'}
                    {row.processed_by_user?.full_name && (
                      <span className="block text-[10px] text-gray-400">oleh {row.processed_by_user.full_name}</span>
                    )}
                  </Td>
                  <Td className="max-w-[220px] text-[11px] text-gray-500">
                    {row.rejection_reason && <span className="text-red-600">Alasan: {row.rejection_reason}</span>}
                    {row.note && <span className="block">{row.note}</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-center py-4 text-[10px] text-gray-400 leading-relaxed">
          Total nominal pada filter aktif ·
          <span className="font-semibold text-gray-600"> Rp{filtered.reduce((s, r) => s + Number(r.nominal), 0).toLocaleString('id-ID')}</span>
          {' '}dari {filtered.length} pengajuan
        </div>
      </div>
    </AppShell>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2">{children}</th>
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={clsx('px-3 py-2 text-[12px] text-gray-700', className)}>{children}</td>
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={clsx('rounded-xl p-3', color)}>
      <p className="text-[10px] font-bold uppercase opacity-70">{label}</p>
      <p className="text-sm font-black mt-1">Rp{value.toLocaleString('id-ID')}</p>
    </div>
  )
}

function StatusBadge({ row }: { row: Row }) {
  const meta = (() => {
    if (row.is_processed) return { icon: Wallet, label: 'LUNAS', cls: 'bg-sky-100 text-sky-700' }
    if (row.status === 'rejected' || row.status === 'cancelled') {
      return { icon: XCircle, label: row.status.toUpperCase(), cls: 'bg-red-100 text-red-700' }
    }
    if (row.status === 'approved') return { icon: CheckCircle2, label: 'DISETUJUI', cls: 'bg-emerald-100 text-emerald-700' }
    return { icon: Clock, label: 'MENUNGGU', cls: 'bg-amber-100 text-amber-700' }
  })()
  const Icon = meta.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap', meta.cls)}>
      <Icon size={10} />{meta.label}
    </span>
  )
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}
