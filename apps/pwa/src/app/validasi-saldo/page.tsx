'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadProfileLabels } from '@/lib/chatProfileDirectory'
import { can } from '@/lib/accessPolicy'
import { cacheReadSync, cacheWriteSync } from '@/lib/apiCache'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import { branchDateTimeLabel } from '@/lib/branchTime'
import CoordinatorSaldoHistory from '@/components/CoordinatorSaldoHistory'
import CoordinatorInvoiceValidation from '@/components/CoordinatorInvoiceValidation'
import Link from 'next/link'
import clsx from 'clsx'
import { ArrowLeft, Wallet, CheckCircle2, Clock, XCircle, Search } from 'lucide-react'

/**
 * Halaman validasi koordinator untuk pengajuan Isi Saldo cabang-nya.
 * - Total nominal per status (Menunggu / Sudah Diisi / Ditolak)
 * - List semua request cabang scope (RLS enforce is_branch_in_scope)
 * - View-only untuk Koordinator/Management; Finance mutation tetap melalui RPC canonical Admin/Direksi.
 *
 * Roadmap poin 12: "Di halaman Validasi Koordinator ada Jumlah nominal
 * seluruh pengisian saldo di Cabang tersebut yg sudah di isi oleh admin
 * dengan Validasi centang di sheet Form isi saldo"
 */

interface SaldoRequest {
  id: string
  request_no: string
  nominal: number
  status: string
  is_processed: boolean
  requested_at: string
  processed_at: string | null
  rejection_reason: string | null
  staff: { full_name: string; staff_id: string } | null
  branch: { name: string; slug: string; timezone: string | null } | null
}

export default function ValidasiSaldoPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<SaldoRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<{ id: string; role: string; branch_id: string | null } | null>(null)
  const [filter, setFilter] = useState<'semua' | 'pending' | 'sudah' | 'ditolak'>('semua')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }
    const { data: profile } = await supabase.from('user_profiles')
      .select('id, role, branch_id').eq('id', session.user.id).single()
    if (!profile) { router.push('/dashboard'); return }
    const role = profile.role
    if (!can(role,'saldo:branch:read')) {
      router.push('/dashboard'); return
    }
    setMe({ id: profile.id, role, branch_id: profile.branch_id })
    const cached=cacheReadSync<SaldoRequest[]>(['saldo-history',profile.id,role,profile.branch_id],10*60*1000)
    if(cached){setRequests(cached);setLoading(false)}

    // RLS enforce scope by is_branch_in_scope — cukup query semua.
    const { data } = await supabase.from('raos_saldo_requests')
      .select('id, request_no, nominal, status, is_processed, requested_at, processed_at, rejection_reason,' +
        'staff_id,' +
        'branch:branches!branch_id(name, slug, timezone)')
      .order('requested_at', { ascending: false })
      .limit(500)
    const rawRows=(data ?? []) as any[]
    let labels:any[]=[]
    try{labels=await loadProfileLabels(rawRows.map(r=>r.staff_id))}catch(error){console.warn('[saldo-history] staff labels failed',error)}
    const labelMap=new Map(labels.map((p:any)=>[p.user_id,p]))
    const rows=rawRows.map(r=>({...r,staff:r.staff_id?{full_name:labelMap.get(r.staff_id)?.full_name ?? 'Staff',staff_id:labelMap.get(r.staff_id)?.staff_id ?? '-'}:null})) as unknown as SaldoRequest[]
    setRequests(rows)
    cacheWriteSync(['saldo-history',profile.id,role,profile.branch_id],rows)
    setLoading(false)
  }, [router])

  useEffect(() => { void load() }, [load])

  useRealtimeRefresh(`saldo-history-${me?.id ?? 'anon'}`,[{table:'raos_saldo_requests'}],()=>void load(),350,!!me?.id)

  const filtered = requests.filter(r => {
    if (filter === 'pending' && (r.is_processed || r.status !== 'pending')) return false
    if (filter === 'sudah' && !r.is_processed) return false
    if (filter === 'ditolak' && r.status !== 'rejected' && r.status !== 'cancelled') return false
    if (search) {
      const q = search.toLowerCase()
      const nama = r.staff?.full_name?.toLowerCase() ?? ''
      const rn = r.request_no.toLowerCase()
      if (!nama.includes(q) && !rn.includes(q)) return false
    }
    return true
  })

  const totals = {
    menunggu: requests.filter(r => !r.is_processed && r.status === 'pending').reduce((s, r) => s + Number(r.nominal), 0),
    sudah:    requests.filter(r => r.is_processed).reduce((s, r) => s + Number(r.nominal), 0),
    ditolak:  requests.filter(r => r.status === 'rejected' || r.status === 'cancelled').reduce((s, r) => s + Number(r.nominal), 0),
  }

  // View-only. Finance owns mark-paid mutation.

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} className="text-white/70" /></Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
        </div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl">Riwayat Isi Saldo</h1>
            <p className="text-white/50 text-xs mt-0.5">Cabang scope Anda</p>
          </div>
          <DateTimeStack />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama staff / no. request..."
            className="w-full pl-9 pr-3 py-2 bg-white/10 rounded-xl text-sm text-white placeholder-white/40 outline-none" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-24">
        {/* Total per status */}
        <div className="grid grid-cols-3 gap-2">
          <div className="card !p-3 text-center">
            <p className="text-[10px] font-bold text-amber-600 uppercase">Menunggu</p>
            <p className="text-sm font-black text-gray-800 mt-1">Rp{totals.menunggu.toLocaleString('id-ID')}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-[10px] font-bold text-green-600 uppercase">Sudah Diisi</p>
            <p className="text-sm font-black text-gray-800 mt-1">Rp{totals.sudah.toLocaleString('id-ID')}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-[10px] font-bold text-red-600 uppercase">Ditolak</p>
            <p className="text-sm font-black text-gray-800 mt-1">Rp{totals.ditolak.toLocaleString('id-ID')}</p>
          </div>
        </div>

        <CoordinatorSaldoHistory />
        <CoordinatorInvoiceValidation />

        {/* Filter tabs */}
        <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {(['semua','pending','sudah','ditolak'] as const).map(k => (
            <button key={k}
              onClick={() => setFilter(k)}
              className={clsx(
                'flex-1 text-xs font-semibold py-1.5 rounded-lg capitalize',
                filter === k ? 'bg-white shadow-sm text-secondary' : 'text-gray-500'
              )}>{k === 'pending' ? 'Menunggu' : k === 'sudah' ? 'Sudah Diisi' : k}</button>
          ))}
        </div>

        {/* List */}
        {loading && <p className="text-center text-xs text-gray-400 py-8">Memuat...</p>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Wallet size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Tidak ada request di filter ini</p>
          </div>
        )}
        {filtered.map(req => {
          const isDone = req.is_processed
          const isRejected = req.status === 'rejected' || req.status === 'cancelled'
          const isPending = req.status === 'pending' && !isDone
          const badge = isDone
            ? { icon: CheckCircle2, label: 'SUDAH DIISI', cls: 'bg-green-100 text-green-700' }
            : isRejected
              ? { icon: XCircle, label: req.status.toUpperCase(), cls: 'bg-red-100 text-red-700' }
              : { icon: Clock, label: 'MENUNGGU', cls: 'bg-amber-100 text-amber-700' }
          const BadgeIcon = badge.icon
          return (
            <div key={req.id} className="card">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 rounded-xl p-2 flex-shrink-0"><Wallet size={16} className="text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-bold text-gray-800 truncate">{req.staff?.full_name ?? '(unknown)'}</p>
                    <span className={clsx('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', badge.cls)}>
                      <BadgeIcon size={10} />{badge.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">{req.request_no}</p>
                  <div className="flex justify-between items-center mt-1 pt-1 border-t border-gray-100">
                    <span className="text-[11px] text-gray-500">
                      {branchDateTimeLabel(req.branch?.timezone, new Date(req.requested_at))}
                    </span>
                    <span className="text-sm font-black text-primary">Rp{Number(req.nominal).toLocaleString('id-ID')}</span>
                  </div>
                  {req.rejection_reason && (
                    <p className="text-[11px] text-red-500 mt-1">{req.rejection_reason}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
