'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/accessPolicy'
import { cacheReadSync, cacheWriteSync } from '@/lib/apiCache'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { runtimeMessage, runtimeTechnicalMessage } from '@/lib/runtimeError'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Search, Car, Phone, X, Loader2, Radar, QrCode, PhoneCall, CheckCircle2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile, Driver } from '@/types'

const PAGE_SIZE = 20

type QueueEntry = { id: string; position: number; status: 'waiting' | 'called' }
type QueueMap = Record<string, QueueEntry>


export default function DriversPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [queueMap, setQueueMap] = useState<QueueMap>({})
  const [queueBusy, setQueueBusy] = useState<string | null>(null)
  const [queueErr, setQueueErr] = useState<string>('')

  const loadDrivers = useCallback(async (pageNum: number, searchTerm: string, uid?: string) => {
    const ck=['drivers',uid,pageNum,searchTerm] as const
    const cached=cacheReadSync<{drivers:Driver[];total:number}>(ck,15*60*1000)
    if(cached){setDrivers(cached.drivers);setTotalCount(cached.total);setLoading(false)} else setLoading(true)
    let query = supabase
      .from('raos_drivers')
      .select('id, driver_id, name, phone, vehicle_type, vehicle_plate, branch_id, barcode, is_active, source, branches(name)', { count: 'exact' })
      .eq('is_active', true)
      .order('name')
      .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1)

    if (searchTerm) {
      query = query.or(`name.ilike.%${searchTerm}%,driver_id.ilike.%${searchTerm}%`)
    }

    const { data, count } = await query
    const rows=(data as any) ?? []
    setDrivers(rows)
    setTotalCount(count ?? 0)
    cacheWriteSync(ck,{drivers:rows,total:count??0})
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
      setUser(profile)

      loadDrivers(0, '', session.user.id)
    }
    init()
  }, [router, loadDrivers])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(0)
      loadDrivers(0, search, user?.id)
    }, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const loadQueueStates = useCallback(async () => {
    const { data } = await supabase
      .from('raos_driver_queue')
      .select('id, driver_id, position, status')
      .in('status', ['waiting', 'called'])
    const map: QueueMap = {}
    for (const row of (data ?? []) as any[]) {
      map[row.driver_id] = { id: row.id, position: row.position, status: row.status }
    }
    setQueueMap(map)
  }, [])

  useEffect(() => {
    void loadQueueStates()
    const channel = supabase
      .channel('drivers_page_queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raos_driver_queue' },
        () => { void loadQueueStates() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loadQueueStates])

  function goToPage(p: number) {
    setPage(p)
    loadDrivers(p, search, user?.id)
  }

  const canManageBarcodes = !!user && can(user.role,'driver:barcode:manage')
  const canManageQueue = !!user && can(user.role,'queue:operate')
  const isDriverRole = user?.role === 'driver'
  useRealtimeRefresh(`drivers-${user?.id ?? 'anon'}`,[{table:'raos_drivers'},{table:'raos_driver_queue'}],()=>{void loadDrivers(page,search,user?.id);void loadQueueStates()},350,!!user?.id)

  async function handleRequestQueue(driver: Driver) {
    if (!driver.branch_id) { setQueueErr('Driver belum punya cabang — lengkapi data dulu.'); return }
    setQueueBusy(driver.id); setQueueErr('')
    const { error } = await supabase.rpc('raos_join_queue', {
      p_driver_id: driver.id,
      p_branch_id: driver.branch_id,
      p_room_id: null,
    })
    setQueueBusy(null)
    if (error) { console.warn('[drivers] queue mutation failed', runtimeTechnicalMessage(error)); setQueueErr(runtimeMessage(error,'Operasi antrean gagal.')); return }
    void loadQueueStates()
  }

  async function handlePanggil(driver: Driver) {
    const entry = queueMap[driver.id]
    if (!entry || entry.status !== 'waiting') { setQueueErr('Driver belum dalam antrian menunggu.'); return }
    if (!driver.branch_id) { setQueueErr('Driver belum punya cabang.'); return }
    setQueueBusy(driver.id); setQueueErr('')
    const { error } = await supabase.rpc('raos_call_driver', {
      p_branch_id: driver.branch_id,
      p_position: entry.position,
    })
    setQueueBusy(null)
    if (error) { console.warn('[drivers] queue mutation failed', runtimeTechnicalMessage(error)); setQueueErr(runtimeMessage(error,'Operasi antrean gagal.')); return }
    void loadQueueStates()
  }

  async function handleSelesai(driver: Driver) {
    const entry = queueMap[driver.id]
    if (!entry || entry.status !== 'called') { setQueueErr('Driver belum dalam status dipanggil.'); return }
    setQueueBusy(driver.id); setQueueErr('')
    const { error } = await supabase.rpc('raos_complete_queue', { p_queue_id: entry.id })
    setQueueBusy(null)
    if (error) { console.warn('[drivers] queue mutation failed', runtimeTechnicalMessage(error)); setQueueErr(runtimeMessage(error,'Operasi antrean gagal.')); return }
    void loadQueueStates()
  }
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard"><ArrowLeft size={22} /></Link>
            <div>
              <h1 className="font-bold text-base">Kendaraan & Driver</h1>
              <p className="text-white/50 text-xs">{totalCount} driver aktif terdaftar</p>
            </div>
          </div>
          {canManageBarcodes && (
            <div className="flex items-center gap-2">
              <Link
                href="/admin/barcodes"
                title="Generate & cetak QR code driver"
                className="bg-white/10 text-white p-2 rounded-xl border border-white/20"
              >
                <QrCode size={18} />
              </Link>
            </div>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
          <input
            type="text"
            placeholder="Cari nama driver atau ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-white/40 text-sm
                       pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none"
          />
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {loading && (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat data driver...</div>
        )}

        {!loading && drivers.length === 0 && (
          <div className="text-center py-16">
            <Car size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm font-medium">Belum ada driver terdaftar</p>
            <p className="text-gray-300 text-xs mt-1">
              Master Driver dikelola dari Database Driver SSOT
            </p>
          </div>
        )}

        {queueErr && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-xs px-3 py-2 rounded-lg flex items-start justify-between gap-2">
            <span className="flex-1">{queueErr}</span>
            <button onClick={() => setQueueErr('')} aria-label="Tutup"><X size={14} /></button>
          </div>
        )}

        {!loading && drivers.map(driver => {
          const entry = queueMap[driver.id]
          const busy = queueBusy === driver.id
          return (
            <div key={driver.id} className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Car size={18} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm text-gray-800 truncate">{driver.name}</p>
                    {driver.source === 'ssot_driver_airport' && (
                      <span title="Auto-sync dari Database Driver Airport (SSOT)"
                            className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                        <Radar size={9} /> SSOT
                      </span>
                    )}
                    {entry && (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        entry.status === 'waiting' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {entry.status === 'waiting' ? `Antri #${entry.position}` : `Dipanggil #${entry.position}`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {driver.driver_id} • {(driver as any).branches?.name ?? '-'}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {driver.phone && (
                      <span className="flex items-center gap-1 text-[10px] text-gray-400">
                        <Phone size={10} /> {driver.phone}
                      </span>
                    )}
                    {driver.vehicle_plate && (
                      <span className="text-[10px] text-gray-400">{driver.vehicle_plate}</span>
                    )}
                    {!driver.phone && !driver.vehicle_type && (
                      <span className="text-[10px] text-amber-600">Data kendaraan belum dilengkapi</span>
                    )}
                  </div>
                </div>
                {driver.vehicle_type && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
                    {driver.vehicle_type}
                  </span>
                )}
              </div>

              {(canManageQueue || isDriverRole) && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  {(canManageQueue || isDriverRole) && !entry && (
                    <button
                      onClick={() => handleRequestQueue(driver)}
                      disabled={busy || !driver.branch_id}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                      Request Antrian
                    </button>
                  )}
                  {canManageQueue && entry?.status === 'waiting' && (
                    <button
                      onClick={() => handlePanggil(driver)}
                      disabled={busy}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <PhoneCall size={12} />}
                      Panggil
                    </button>
                  )}
                  {canManageQueue && entry?.status === 'called' && (
                    <button
                      onClick={() => handleSelesai(driver)}
                      disabled={busy}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Selesai
                    </button>
                  )}
                  {canManageQueue && entry && (
                    <span className="text-[10px] text-gray-400 px-2">Aktif · #{entry.position}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => goToPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 rounded-lg disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <span className="text-xs text-gray-500">
              Halaman {page + 1} dari {totalPages}
            </span>
            <button
              onClick={() => goToPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 rounded-lg disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
