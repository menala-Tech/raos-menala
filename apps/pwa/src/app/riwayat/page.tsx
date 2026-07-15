'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Filter, Search, ScanLine, UserCheck } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { ScanOrder, Attendance } from '@/types'

type Tab = 'semua' | 'scan' | 'absensi'
type StatusFilter = 'semua' | 'valid' | 'pending'

export default function RiwayatPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('semua')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua')
  const [search, setSearch] = useState('')
  const [scans, setScans] = useState<ScanOrder[]>([])
  const [absensies, setAbsensies] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      setUserId(session.user.id)

      const [{ data: scanData }, { data: attData }] = await Promise.all([
        supabase
          .from('scan_orders')
          .select('*, raos_drivers(*)')
          .eq('staff_id', session.user.id)
          .order('scanned_at', { ascending: false })
          .limit(100),
        supabase
          .from('attendance')
          .select('*')
          .eq('staff_id', session.user.id)
          .order('date', { ascending: false })
          .limit(30),
      ])
      setScans(scanData ?? [])
      setAbsensies(attData ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  const filteredScans = scans.filter(s => {
    if (statusFilter !== 'semua' && s.status !== statusFilter) return false
    if (search && !(s as any).raos_drivers?.name?.toLowerCase().includes(search.toLowerCase()) &&
        !s.scan_id.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const TABS: { key: Tab; label: string }[] = [
    { key: 'semua', label: 'Semua' },
    { key: 'scan', label: 'Scan' },
    { key: 'absensi', label: 'Absensi' },
  ]

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <h1 className="font-bold text-base">Riwayat Aktivitas</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
          <input
            type="text"
            placeholder="Cari driver, ID scan..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-white/40 text-sm
                       pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex-1 py-3 text-sm font-medium transition-colors',
              tab === t.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-gray-500'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Status Filter */}
      {(tab === 'semua' || tab === 'scan') && (
        <div className="px-4 py-2 flex gap-2 bg-white border-b border-gray-100">
          {(['semua', 'valid', 'pending'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-3 py-1 rounded-full text-xs font-medium capitalize',
                statusFilter === s
                  ? 'bg-secondary text-white'
                  : 'bg-gray-100 text-gray-600'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        {loading && (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat riwayat...</div>
        )}

        {/* Scan List */}
        {!loading && (tab === 'semua' || tab === 'scan') && filteredScans.map(scan => (
          <div key={scan.id} className="card flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-xl flex-shrink-0">
              <ScanLine size={18} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-gray-800 truncate">
                  {(scan as any).raos_drivers?.name ?? 'Driver tidak diketahui'}
                </p>
                <span className={clsx(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  scan.status === 'valid' ? 'badge-valid' :
                  scan.status === 'pending' ? 'badge-pending' : 'badge-rejected'
                )}>
                  {scan.status.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {scan.scan_id} •{' '}
                {new Date(scan.scanned_at).toLocaleString('id-ID', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        ))}

        {/* Absensi List */}
        {!loading && (tab === 'semua' || tab === 'absensi') && absensies.map(att => (
          <div key={att.id} className="card flex items-center gap-3">
            <div className="bg-green-50 p-2 rounded-xl flex-shrink-0">
              <UserCheck size={18} className="text-green-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-gray-800">Absensi</p>
                <span className={clsx(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  att.status === 'hadir' ? 'badge-valid' : 'badge-pending'
                )}>
                  {att.status.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(att.date).toLocaleDateString('id-ID', {
                  weekday: 'short', day: 'numeric', month: 'short'
                })}
                {att.check_in_at && ` • Masuk: ${new Date(att.check_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
                {att.check_out_at && ` • Pulang: ${new Date(att.check_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>
          </div>
        ))}

        {!loading && filteredScans.length === 0 && absensies.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            Belum ada riwayat aktivitas
          </div>
        )}
      </div>
    </AppShell>
  )
}
