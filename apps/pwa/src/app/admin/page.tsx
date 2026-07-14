'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import {
  ArrowLeft, CheckCircle2, XCircle, ShieldCheck,
  Users, ScanLine, Loader2
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { UserProfile } from '@/types'

type Tab = 'validasi' | 'staff'

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [tab, setTab] = useState<Tab>('validasi')
  const [pendingScans, setPendingScans] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const loadData = useCallback(async (uid: string) => {
    const [{ data: scans }, { data: staff }] = await Promise.all([
      supabase
        .from('scan_orders')
        .select('*, drivers(id_maxim, nama_driver, cabang), user_profiles!scan_orders_staff_id_fkey(full_name, staff_id)')
        .eq('status', 'pending')
        .order('scanned_at', { ascending: false })
        .limit(100),
      supabase
        .from('user_profiles')
        .select('*, branches(name)')
        .order('full_name'),
    ])
    setPendingScans(scans ?? [])
    setStaffList(staff ?? [])
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
      if (!profile || !['koordinator', 'admin', 'direksi'].includes(profile.role)) {
        router.push('/dashboard')
        return
      }
      setUser(profile)
      loadData(session.user.id)
    }
    init()
  }, [router, loadData])

  async function validateScan(scanId: string, status: 'valid' | 'rejected') {
    if (!user) return
    setProcessing(scanId)
    const { error } = await supabase
      .from('scan_orders')
      .update({
        status,
        koordinator_id: user.id,
        validated_at: new Date().toISOString(),
      })
      .eq('id', scanId)
    if (!error) {
      setPendingScans(prev => prev.filter(s => s.id !== scanId))
    }
    setProcessing(null)
  }

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" />
              Panel Admin
            </h1>
            <p className="text-white/50 text-xs capitalize">{user?.role} • Validasi & Manajemen</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4">
        {([
          { key: 'validasi', label: `Validasi (${pendingScans.length})`, icon: ScanLine },
          { key: 'staff', label: 'Staff', icon: Users },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
              tab === key ? 'text-primary border-b-2 border-primary' : 'text-gray-500'
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 space-y-2">
        {loading && (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat data...</div>
        )}

        {/* TAB VALIDASI */}
        {!loading && tab === 'validasi' && pendingScans.length === 0 && (
          <div className="text-center py-10">
            <CheckCircle2 size={40} className="text-green-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm font-medium">Tidak ada scan pending</p>
            <p className="text-gray-400 text-xs">Semua order sudah tervalidasi</p>
          </div>
        )}

        {!loading && tab === 'validasi' && pendingScans.map(scan => (
          <div key={scan.id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-sm text-gray-800">
                  {scan.drivers?.nama_driver ?? 'Driver?'}
                </p>
                <p className="text-xs text-gray-400">
                  {scan.scan_id} • {scan.drivers?.id_maxim}
                </p>
                <p className="text-xs text-gray-400">
                  Scanner: {scan.user_profiles?.full_name} •{' '}
                  {new Date(scan.scanned_at).toLocaleString('id-ID', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
              <span className="badge-pending">PENDING</span>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => validateScan(scan.id, 'valid')}
                disabled={processing === scan.id}
                className="flex-1 bg-green-600 text-white text-xs font-bold py-2 rounded-lg
                           flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50"
              >
                {processing === scan.id
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CheckCircle2 size={14} />}
                VALIDASI
              </button>
              <button
                onClick={() => validateScan(scan.id, 'rejected')}
                disabled={processing === scan.id}
                className="flex-1 bg-red-50 text-red-600 text-xs font-bold py-2 rounded-lg
                           flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50"
              >
                <XCircle size={14} />
                TOLAK
              </button>
            </div>
          </div>
        ))}

        {/* TAB STAFF */}
        {!loading && tab === 'staff' && staffList.map(s => (
          <div key={s.id} className="card flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center
                            text-primary font-bold">
              {s.full_name?.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-gray-800">{s.full_name}</p>
              <p className="text-xs text-gray-400 capitalize">
                {s.staff_id} • {s.role} • {s.branches?.name ?? '-'}
              </p>
            </div>
            <span className={clsx(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full',
              s.is_active ? 'badge-valid' : 'badge-rejected'
            )}>
              {s.is_active ? 'AKTIF' : 'NONAKTIF'}
            </span>
          </div>
        ))}
      </div>
    </AppShell>
  )
}
