'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import { ArrowLeft, Car, Phone, CheckCircle2, Clock, RefreshCw } from 'lucide-react'

/**
 * Halaman monitoring antrian driver — real-time via Supabase subscription.
 * Staff bisa panggil/selesaikan langsung dari sini (short-cut, alternatif chat command).
 * RLS enforce scope by cabang.
 */

interface QueueItem {
  id: string
  position: number
  status: 'waiting' | 'called' | 'completed' | 'left'
  joined_at: string
  called_at: string | null
  branch_id: string
  driver: { id: string; driver_id: string; name: string; vehicle_plate?: string | null } | null
  branch: { id: string; name: string } | null
}

export default function AntrianDriverPage() {
  const router = useRouter()
  const [me, setMe] = useState<{ id: string; role: string; branch_id: string | null } | null>(null)
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }
    const { data: profile } = await supabase.from('user_profiles')
      .select('id, role, branch_id').eq('id', session.user.id).single()
    if (!profile) { router.push('/dashboard'); return }
    setMe({ id: profile.id, role: profile.role, branch_id: profile.branch_id })

    const { data } = await supabase.from('raos_driver_queue')
      .select('id, position, status, joined_at, called_at, branch_id,' +
        'driver:raos_drivers(id, driver_id, name, vehicle_plate),' +
        'branch:branches(id, name)')
      .in('status', ['waiting', 'called'])
      .order('branch_id')
      .order('position')
      .limit(200)
    setItems((data ?? []) as unknown as QueueItem[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Realtime subscribe
    const ch = supabase.channel('driver-queue-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raos_driver_queue' },
        () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groupedByBranch = items.reduce((acc, item) => {
    const key = item.branch?.id ?? item.branch_id
    const name = item.branch?.name ?? 'Cabang'
    if (!acc[key]) acc[key] = { name, items: [] }
    acc[key].items.push(item)
    return acc
  }, {} as Record<string, { name: string; items: QueueItem[] }>)

  async function handleCall(branchId: string, position: number) {
    setBusyId(`${branchId}:${position}`)
    const { error } = await supabase.rpc('raos_call_driver', { p_branch_id: branchId, p_position: position })
    if (error) alert('Gagal panggil: ' + error.message)
    else await load()
    setBusyId(null)
  }
  async function handleComplete(queueId: string) {
    setBusyId(queueId)
    const { error } = await supabase.rpc('raos_complete_queue', { p_queue_id: queueId })
    if (error) alert('Gagal selesai: ' + error.message)
    else await load()
    setBusyId(null)
  }
  async function handleLeave(queueId: string) {
    if (!confirm('Keluarkan driver ini dari antrean?')) return
    setBusyId(queueId)
    const { error } = await supabase.rpc('raos_leave_queue', { p_queue_id: queueId })
    if (error) alert('Gagal keluar: ' + error.message)
    else await load()
    setBusyId(null)
  }

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} className="text-white/70" /></Link>
          <div className="flex-1"><MenalaLogo size={28} showText /></div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-xl">Antrian Driver</h1>
            <p className="text-white/50 text-xs mt-0.5">Real-time monitor per cabang</p>
          </div>
          <div className="flex items-start gap-2">
            <DateTimeStack />
            <button onClick={load}
              className="bg-white/10 rounded-xl p-2 active:scale-95">
              <RefreshCw size={18} className="text-primary" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-24">
        {loading && <p className="text-center text-xs text-gray-400 py-8">Memuat...</p>}

        {!loading && Object.keys(groupedByBranch).length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Car size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Tidak ada antrean aktif</p>
            <p className="text-[11px] text-gray-300 mt-1">
              Driver bisa masuk antrean via chat: <code className="bg-gray-100 px-1 rounded">/antri &lt;id_driver&gt;</code>
            </p>
          </div>
        )}

        {Object.entries(groupedByBranch).map(([branchId, group]) => (
          <div key={branchId} className="space-y-2">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
              {group.name} · {group.items.length} driver
            </p>
            {group.items.map(item => {
              const isCalled = item.status === 'called'
              return (
                <div key={item.id}
                  className={clsx(
                    'card flex items-center gap-3',
                    isCalled && 'border-2 border-blue-300 bg-blue-50/50'
                  )}>
                  <div className={clsx(
                    'rounded-xl w-11 h-11 flex flex-col items-center justify-center flex-shrink-0',
                    isCalled ? 'bg-blue-500 text-white' : 'bg-amber-100 text-amber-700'
                  )}>
                    <span className="text-[8px] font-bold leading-none">POS</span>
                    <span className="text-lg font-black leading-none">{item.position}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{item.driver?.name ?? '(unknown)'}</p>
                    <p className="text-[11px] text-gray-500">
                      {item.driver?.driver_id ?? '-'}
                      {item.driver?.vehicle_plate ? ` · ${item.driver.vehicle_plate}` : ''}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {isCalled ? (
                        <>Dipanggil {item.called_at ? new Date(item.called_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}</>
                      ) : (
                        <>Antre sejak {new Date(item.joined_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {!isCalled && (
                      <button
                        disabled={busyId === `${item.branch_id}:${item.position}`}
                        onClick={() => handleCall(item.branch_id, item.position)}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-500 text-white disabled:opacity-50 flex items-center gap-1">
                        <Phone size={10} /> PANGGIL
                      </button>
                    )}
                    {isCalled && (
                      <button
                        disabled={busyId === item.id}
                        onClick={() => handleComplete(item.id)}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-600 text-white disabled:opacity-50 flex items-center gap-1">
                        <CheckCircle2 size={10} /> SELESAI
                      </button>
                    )}
                    <button
                      disabled={busyId === item.id}
                      onClick={() => handleLeave(item.id)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-600 disabled:opacity-50">
                      Keluar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        <div className="card bg-gray-50 text-[11px] text-gray-500 space-y-1">
          <p className="font-bold text-gray-700 text-xs">Chat Command Cheat Sheet</p>
          <p>• <code className="bg-white px-1 rounded">/antri &lt;id_driver&gt;</code> — masuk antrean</p>
          <p>• <code className="bg-white px-1 rounded">/panggil &lt;nomor&gt;</code> — panggil driver</p>
          <p>• <code className="bg-white px-1 rounded">/selesai &lt;nomor&gt;</code> — selesai jemput</p>
          <p>• <code className="bg-white px-1 rounded">/keluar &lt;id_driver&gt;</code> — keluar antrean</p>
          <p className="pt-1 text-gray-400">Command hanya jalan di chat room cabang spesifik.</p>
        </div>
      </div>
    </AppShell>
  )
}
