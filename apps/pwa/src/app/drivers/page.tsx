'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Search, Car, Phone, MapPin } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'

interface Driver {
  id: string
  id_maxim: string
  nama_driver: string
  cabang: string
  zone: string
  driver_type: string
  is_active: boolean
  phone?: string
  vehicle_plate?: string
}

const PAGE_SIZE = 20

export default function DriversPage() {
  const router = useRouter()
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState<'all' | 'airport' | 'non_airport'>('all')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const loadDrivers = useCallback(async (pageNum: number, searchTerm: string, zone: string) => {
    setLoading(true)
    let query = supabase
      .from('drivers')
      .select('id, id_maxim, nama_driver, cabang, zone, driver_type, is_active, phone, vehicle_plate', { count: 'exact' })
      .eq('is_active', true)
      .order('nama_driver')
      .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1)

    if (searchTerm) {
      query = query.or(`nama_driver.ilike.%${searchTerm}%,id_maxim.ilike.%${searchTerm}%`)
    }
    if (zone !== 'all') {
      query = query.eq('zone', zone)
    }

    const { data, count } = await query
    setDrivers(data ?? [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      loadDrivers(0, '', 'all')
    }
    init()
  }, [router, loadDrivers])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(0)
      loadDrivers(0, search, zoneFilter)
    }, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, zoneFilter])

  function goToPage(p: number) {
    setPage(p)
    loadDrivers(p, search, zoneFilter)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base">Kendaraan & Driver</h1>
            <p className="text-white/50 text-xs">{totalCount} driver aktif terdaftar</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
          <input
            type="text"
            placeholder="Cari nama driver atau ID Maxim..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-white/40 text-sm
                       pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none"
          />
        </div>
      </div>

      <div className="px-4 py-2 flex gap-2 bg-white border-b border-gray-100">
        {([
          { key: 'all', label: 'Semua' },
          { key: 'airport', label: 'Airport' },
          { key: 'non_airport', label: 'Non-Airport' },
        ] as const).map(z => (
          <button
            key={z.key}
            onClick={() => setZoneFilter(z.key)}
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-medium',
              zoneFilter === z.key ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-600'
            )}
          >
            {z.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 space-y-2">
        {loading && (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat data driver...</div>
        )}

        {!loading && drivers.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">Tidak ada driver ditemukan</div>
        )}

        {!loading && drivers.map(driver => (
          <div key={driver.id} className="card flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
              <Car size={18} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-800 truncate">{driver.nama_driver}</p>
              <p className="text-xs text-gray-400">{driver.id_maxim} • {driver.cabang}</p>
              <div className="flex items-center gap-3 mt-1">
                {driver.phone && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Phone size={10} /> {driver.phone}
                  </span>
                )}
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <MapPin size={10} /> {driver.zone === 'airport' ? 'Airport' : 'Non-Airport'}
                </span>
              </div>
            </div>
            <span className={clsx(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0',
              driver.driver_type === 'ask' ? 'bg-purple-100 text-purple-700' :
              driver.driver_type === 'external' ? 'bg-orange-100 text-orange-700' :
              'bg-blue-100 text-blue-700'
            )}>
              {driver.driver_type}
            </span>
          </div>
        ))}

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
