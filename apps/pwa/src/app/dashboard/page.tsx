'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import {
  ScanLine, Clock, UserCheck, MessageCircle,
  Target, CheckCircle2, AlertCircle, Bell,
  TrendingUp, ShieldCheck
} from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/types'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState({ total: 0, valid: 0, pending: 0 })
  const [unreadNotif, setUnreadNotif] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*, branches(*)')
        .eq('id', session.user.id)
        .single()
      setUser(profile)

      const today = new Date().toISOString().split('T')[0]
      const { data: scans } = await supabase
        .from('scan_orders')
        .select('status')
        .eq('staff_id', session.user.id)
        .gte('scanned_at', today)

      if (scans) {
        setStats({
          total: scans.length,
          valid: scans.filter(s => s.status === 'valid').length,
          pending: scans.filter(s => s.status === 'pending').length,
        })
      }

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false)
      setUnreadNotif(count ?? 0)
    }
    load()
  }, [router])

  const isAdmin = user && ['koordinator', 'admin', 'direksi'].includes(user.role)

  const quick = [
    { href: '/scan',     icon: ScanLine,     label: 'Scan\nBarcode',  color: 'bg-blue-500' },
    { href: '/absensi',  icon: UserCheck,    label: 'Absensi',        color: 'bg-green-500' },
    { href: '/riwayat',  icon: Clock,        label: 'Riwayat',        color: 'bg-orange-500' },
    { href: '/chat',     icon: MessageCircle,label: 'Chat\nRoom',     color: 'bg-purple-500' },
    { href: '/kpi',      icon: TrendingUp,   label: 'KPI\nSaya',      color: 'bg-pink-500' },
    ...(isAdmin
      ? [{ href: '/admin', icon: ShieldCheck, label: 'Panel\nAdmin', color: 'bg-secondary' }]
      : []),
  ]

  return (
    <AppShell>
      {/* Header */}
      <div className="bg-secondary text-white px-4 pt-10 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/60 text-xs">Selamat datang,</p>
            <h1 className="font-bold text-lg leading-tight">
              {user?.full_name ?? '...'}
            </h1>
            <p className="text-primary text-xs mt-0.5 capitalize">
              {user?.role} • {(user as any)?.branches?.name ?? ''}
            </p>
          </div>
          <button className="relative mt-1">
            <Bell size={22} className="text-white/70" />
            {unreadNotif > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white
                               text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
                {unreadNotif}
              </span>
            )}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { label: 'Total Scan', value: stats.total, color: 'text-white' },
            { label: 'Valid', value: stats.valid, color: 'text-green-400' },
            { label: 'Pending', value: stats.pending, color: 'text-yellow-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/10 rounded-xl p-3 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-white/60 text-[10px] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Quick Access */}
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Menu Utama
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {quick.map(({ href, icon: Icon, label, color }) => (
              <Link key={href} href={href}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`${color} w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm`}>
                    <Icon size={26} className="text-white" />
                  </div>
                  <span className="text-[10px] text-gray-600 text-center leading-tight whitespace-pre-line">
                    {label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Status Hari Ini */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Target size={16} className="text-primary" />
            Target Hari Ini
          </h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Scan Valid</span>
              <div className="flex items-center gap-1.5">
                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${Math.min((stats.valid / 20) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-700">
                  {stats.valid}/20
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Aktivitas */}
        {stats.pending > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center gap-3">
            <AlertCircle size={20} className="text-yellow-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-yellow-800">
                {stats.pending} scan menunggu validasi
              </p>
              <p className="text-[10px] text-yellow-600">
                Koordinator belum memvalidasi
              </p>
            </div>
          </div>
        )}
        {stats.valid > 0 && stats.pending === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-green-800">
              Semua scan telah tervalidasi ✓
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
