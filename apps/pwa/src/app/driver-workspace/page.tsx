'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { Car, CheckCircle2, Clock, LogOut, MessageCircle, Phone, Play, Wallet, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cacheReadSync, cacheWriteSync, cacheClearAll } from '@/lib/apiCache'
import { clearOfflineReadCache } from '@/lib/offlineReadCache'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import BrandLoadingShell from '@/components/BrandLoadingShell'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import DriverSaldoHistory from '@/components/DriverSaldoHistory'
import { formatInTimezone, tzLabel } from '@/lib/timezone'

/**
 * /driver-workspace — landing page untuk role='driver'.
 *
 * Tampilan read-only:
 *   1. Status antrean sekarang (posisi + status: menunggu/dipanggil)
 *   2. Riwayat pengajuan Isi Saldo yang di-address ke driver ini
 *   3. Shortcut ke Chat Room driver cabang
 *
 * Semua data dibaca melalui RLS driver-scoped yang ditambahkan di
 * migration `raos_057_driver_role_login`:
 *   - raos_driver_queue_driver_read (WHERE branch_id = get_my_driver_branch())
 *   - raos_saldo_requests_driver_own (WHERE driver_id = my driver_id)
 *
 * Driver TIDAK bisa write ke antrean atau saldo — semua manajemen
 * dilakukan role yang memiliki capability queue:operate melalui /antrian-driver dan Finance Dashboard.
 */

interface DriverProfile {
  id: string
  full_name: string
  driver_id: string | null
  raos_drivers: { id: string; driver_id: string; name: string; branch_id: string | null; vehicle_plate: string | null } | null
}

interface QueueEntry {
  id: string
  position: number
  status: 'waiting' | 'called' | 'completed' | 'left'
  joined_at: string
  called_at: string | null
}

interface SaldoEntry {
  id: string
  request_no: string
  nominal: number
  status: string
  is_processed: boolean
  requested_at: string
  processed_at: string | null
  rejection_reason: string | null
}

export default function DriverWorkspacePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<DriverProfile | null>(null)
  const [branchName, setBranchName] = useState<string>('')
  const [branchTz, setBranchTz] = useState<string | null>(null)
  const [myQueue, setMyQueue] = useState<QueueEntry | null>(null)
  const [saldoHistory, setSaldoHistory] = useState<SaldoEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }

    const { data: prof } = await supabase.from('user_profiles')
      .select('id, full_name, driver_id, raos_drivers(id, driver_id, name, branch_id, vehicle_plate)')
      .eq('id', session.user.id)
      .single()
    if (!prof || prof.driver_id === null) {
      router.push('/dashboard'); return
    }
    setProfile(prof as unknown as DriverProfile)
    const branchId = (prof as any).raos_drivers?.branch_id ?? null
    const cacheKey=['driver-workspace',session.user.id,'driver',branchId] as const
    const cached=cacheReadSync<{branchName:string;branchTz:string|null;myQueue:QueueEntry|null;saldoHistory:SaldoEntry[]}>(cacheKey,10*60*1000)
    if(cached){setBranchName(cached.branchName);setBranchTz(cached.branchTz);setMyQueue(cached.myQueue);setSaldoHistory(cached.saldoHistory);setLoading(false)}
    let resolvedBranchName=''
    let resolvedBranchTz:string|null=null
    if (branchId) {
      const { data: b } = await supabase.from('branches').select('name, timezone').eq('id', branchId).single()
      if (b) {
        resolvedBranchName=b.name
        resolvedBranchTz=b.timezone ?? null
        setBranchName(resolvedBranchName)
        setBranchTz(resolvedBranchTz)
      }
    }

    // Antrean aktif driver ini (status waiting/called)
    let qRow:QueueEntry|null=null
    if (prof.driver_id) {
      const { data: q } = await supabase.from('raos_driver_queue')
        .select('id, position, status, joined_at, called_at')
        .eq('driver_id', prof.driver_id)
        .in('status', ['waiting', 'called'])
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      qRow=q as QueueEntry | null
      setMyQueue(qRow)
    }

    // Riwayat Isi Saldo 30 hari terakhir yang di-address ke driver ini
    const from = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data: sh } = await supabase.from('raos_saldo_requests')
      .select('id, request_no, nominal, status, is_processed, requested_at, processed_at, rejection_reason')
      .eq('driver_id', prof.driver_id)
      .gte('requested_at', from)
      .order('requested_at', { ascending: false })
      .limit(30)
    const saldoRows=(sh ?? []) as SaldoEntry[]
    setSaldoHistory(saldoRows)
    cacheWriteSync(cacheKey,{branchName:resolvedBranchName,branchTz:resolvedBranchTz,myQueue:qRow,saldoHistory:saldoRows})

    setLoading(false)
  }, [router])

  const refreshOperational = useCallback(async () => {
    if (!profile?.driver_id) return
    const from = new Date(Date.now() - 30 * 86400000).toISOString()
    const [{ data: q }, { data: sh }] = await Promise.all([
      supabase.from('raos_driver_queue')
        .select('id, position, status, joined_at, called_at')
        .eq('driver_id', profile.driver_id)
        .in('status', ['waiting', 'called'])
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('raos_saldo_requests')
        .select('id, request_no, nominal, status, is_processed, requested_at, processed_at, rejection_reason')
        .eq('driver_id', profile.driver_id)
        .gte('requested_at', from)
        .order('requested_at', { ascending: false })
        .limit(30),
    ])
    const qRow=q as QueueEntry | null
    const saldoRows=(sh ?? []) as SaldoEntry[]
    setMyQueue(qRow)
    setSaldoHistory(saldoRows)
    cacheWriteSync(['driver-workspace',profile.id,'driver',profile.raos_drivers?.branch_id ?? null],{branchName,branchTz,myQueue:qRow,saldoHistory:saldoRows})
  },[profile,branchName,branchTz])

  useEffect(() => { void load() }, [load])
  useRealtimeRefresh(`driver-workspace-${profile?.id ?? 'anon'}`,[
    {table:'raos_driver_queue',filter:profile?.driver_id?`driver_id=eq.${profile.driver_id}`:undefined},
    {table:'raos_saldo_requests',filter:profile?.driver_id?`driver_id=eq.${profile.driver_id}`:undefined},
  ],refreshOperational,300,!!profile?.driver_id)


  async function logout() {
    cacheClearAll()
    await clearOfflineReadCache()
    localStorage.removeItem('raos_install_variant')
    // A8: stop Android background-location tracking + clear native
    // session bridge before signOut — no-op on the browser PWA.
    await (await import('@/lib/nativeLocationBridge')).stopTrackingOnLogout()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading && !profile) return <BrandLoadingShell label="Memuat Driver Workspace..." />

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
          <button onClick={logout} title="Keluar" className="text-white/60 hover:text-white active:scale-95">
            <LogOut size={20} />
          </button>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl truncate">
              {profile?.raos_drivers?.name ?? 'Driver'}
            </h1>
            <p className="text-white/50 text-xs mt-0.5 truncate">
              {profile?.raos_drivers?.driver_id ?? '-'}
              {branchName && <> · {branchName}</>}
              {branchTz && <> · <span className="font-semibold text-primary/90">{tzLabel(branchTz)}</span></>}
              {profile?.raos_drivers?.vehicle_plate && <> · {profile.raos_drivers.vehicle_plate}</>}
            </p>
          </div>
          <DateTimeStack timeZone={branchTz ?? 'Asia/Jakarta'} />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {loading && <p className="text-center text-xs text-gray-400 py-8">Memuat...</p>}

        {!loading && (
          <>
            {/* Kartu status antrean */}
            <QueueStatusCard queue={myQueue} branchTz={branchTz} />

            {/* Shortcut chat */}
            <Link href="/chat"
              className="card flex items-center gap-3 active:scale-[0.99] transition-transform">
              <div className="bg-purple-100 rounded-xl p-3">
                <MessageCircle size={20} className="text-purple-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-800">Chat Room Cabang</p>
                <p className="text-[11px] text-gray-500">Komunikasi dengan staff & koordinator</p>
              </div>
            </Link>

            {/* Riwayat Saldo */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Wallet size={14} className="text-primary" />
                <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Riwayat Isi Saldo</p>
              </div>
              {saldoHistory.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">Belum ada riwayat 30 hari terakhir</p>
              )}
              <div className="space-y-2">
                {saldoHistory.map(s => <SaldoRow key={s.id} entry={s} branchTz={branchTz} />)}
              </div>
            </div>

            <DriverSaldoHistory />
          </>
        )}
      </div>
    </AppShell>
  )
}

function QueueStatusCard({ queue, branchTz }: { queue: QueueEntry | null; branchTz: string | null }) {
  if (!queue) {
    return (
      <div className="card bg-gray-50 text-center">
        <Car size={28} className="text-gray-300 mx-auto mb-2" />
        <p className="text-sm font-bold text-gray-600">Tidak dalam antrean</p>
        <p className="text-[11px] text-gray-400">Tunggu staff cabang memasukkan Anda ke antrean.</p>
      </div>
    )
  }
  const isCalled = queue.status === 'called'
  return (
    <div className={clsx(
      'card border-2',
      isCalled ? 'bg-blue-50 border-blue-300' : 'bg-amber-50 border-amber-200'
    )}>
      <div className="flex items-center gap-3">
        <div className={clsx(
          'rounded-2xl w-16 h-16 flex flex-col items-center justify-center flex-shrink-0',
          isCalled ? 'bg-blue-500 text-white' : 'bg-amber-200 text-amber-800'
        )}>
          <span className="text-[10px] font-bold leading-none">POSISI</span>
          <span className="text-2xl font-black leading-none">{queue.position}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={clsx('text-xs font-bold uppercase tracking-wider', isCalled ? 'text-blue-700' : 'text-amber-700')}>
            {isCalled ? 'DIPANGGIL' : 'Menunggu'}
          </p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">
            {isCalled ? 'Silakan menuju titik penjemputan' : 'Tunggu giliran Anda dipanggil'}
          </p>
          <p className="text-[10px] text-gray-500 mt-1">
            {isCalled
              ? <>Dipanggil {queue.called_at
                  ? <>{formatInTimezone(queue.called_at, branchTz, { hour: '2-digit', minute: '2-digit' })} {tzLabel(branchTz)}</>
                  : ''}</>
              : <>Masuk antre {formatInTimezone(queue.joined_at, branchTz, { hour: '2-digit', minute: '2-digit' })} {tzLabel(branchTz)}</>}
          </p>
        </div>
        {isCalled
          ? <Phone size={20} className="text-blue-500 flex-shrink-0 animate-pulse" />
          : <Play size={20} className="text-amber-500 flex-shrink-0" />}
      </div>
    </div>
  )
}

function SaldoRow({ entry, branchTz }: { entry: SaldoEntry; branchTz: string | null }) {
  const meta = (() => {
    if (entry.is_processed) return { icon: Wallet, label: 'PAID', cls: 'bg-sky-100 text-sky-700' }
    if (entry.status === 'rejected' || entry.status === 'cancelled') {
      return { icon: XCircle, label: 'REJECTED', cls: 'bg-red-100 text-red-700' }
    }
    if (entry.status === 'approved') return { icon: CheckCircle2, label: 'APPROVED', cls: 'bg-emerald-100 text-emerald-700' }
    return { icon: Clock, label: 'PENDING', cls: 'bg-amber-100 text-amber-700' }
  })()
  const Icon = meta.icon
  return (
    <div className="card !p-3 flex items-center gap-3">
      <Icon size={16} className="text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-800">Rp{Number(entry.nominal).toLocaleString('id-ID')}</p>
        <p className="text-[10px] text-gray-500 truncate">
          {entry.request_no} · {formatInTimezone(entry.requested_at, branchTz, {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })} {tzLabel(branchTz)}
        </p>
        {entry.rejection_reason && (
          <p className="text-[10px] text-red-600 mt-0.5">{entry.rejection_reason}</p>
        )}
      </div>
      <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap', meta.cls)}>
        {meta.label}
      </span>
    </div>
  )
}
