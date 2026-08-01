'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import MiniCalendar from '@/components/MiniCalendar'
import {
  ScanLine, Clock, UserCheck, MessageCircle,
  Target, CheckCircle2, AlertCircle, Bell,
  TrendingUp, ShieldCheck, PieChart, Car, FileBarChart,
  ClipboardCheck,
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

  const role = user?.role ?? ''
  const isKoordPlus = ['koordinator', 'admin', 'management', 'direksi'].includes(role)
  const isAdmin     = isKoordPlus // legacy alias — kept untuk minimal diff
  const isDriverMgr = role === 'driver_manager'

  const quick = [
    { href: '/scan',     icon: ScanLine,      label: 'Scan\nBarcode',    color: 'bg-blue-600',   bg: 'bg-blue-50' },
    { href: '/absensi',  icon: UserCheck,     label: 'Absensi',          color: 'bg-green-600',  bg: 'bg-green-50' },
    { href: '/riwayat',  icon: Clock,         label: 'Riwayat',          color: 'bg-orange-500', bg: 'bg-orange-50' },
    { href: '/chat',     icon: MessageCircle, label: 'Chat\nRoom',       color: 'bg-purple-600', bg: 'bg-purple-50' },
    { href: '/kpi',      icon: TrendingUp,    label: 'KPI\nSaya',        color: 'bg-pink-600',   bg: 'bg-pink-50' },
    { href: '/status',   icon: PieChart,      label: 'Status\nValidasi', color: 'bg-teal-600',   bg: 'bg-teal-50' },
    { href: '/drivers',  icon: Car,           label: 'Driver &\nKendaraan', color: 'bg-indigo-600', bg: 'bg-indigo-50' },
    ...(isDriverMgr
      ? [{ href: '/antrian-driver', icon: Car, label: 'Antrian\nDriver', color: 'bg-amber-600', bg: 'bg-amber-50' }]
      : []),
    ...(isKoordPlus
      ? [{ href: '/validasi-saldo', icon: ClipboardCheck, label: 'Validasi\nSaldo', color: 'bg-amber-600', bg: 'bg-amber-50' }]
      : []),
    ...(isAdmin
      ? [
          { href: '/admin',   icon: ShieldCheck,  label: 'Panel\nAdmin',     color: 'bg-secondary', bg: 'bg-gray-50' },
          { href: '/laporan', icon: FileBarChart,  label: 'Laporan &\nAnalitik', color: 'bg-cyan-700', bg: 'bg-cyan-50' },
        ]
      : []),
  ]

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Selamat Pagi'
    if (h < 15) return 'Selamat Siang'
    if (h < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  }

  return (
    <AppShell>
      {/* ===== HEADER ===== */}
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        {/* Top row — logo + notif */}
        <div className="flex items-center justify-between mb-4">
          <MenalaLogo size={36} showText />
          <Link href="/notifications" className="relative">
            <Bell size={22} className="text-white/70" />
            {unreadNotif > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white
                               text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {unreadNotif}
              </span>
            )}
          </Link>
        </div>

        {/* User greeting + DateTime widget di kanan (tanggal atas, jam bawah) */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center
                          text-secondary font-black text-base shadow-md flex-shrink-0">
            {user?.full_name?.charAt(0) ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/60 text-xs">{greeting()},</p>
            <h1 className="font-bold text-base leading-tight truncate">{user?.full_name ?? '...'}</h1>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="capitalize text-xs text-primary font-semibold">{user?.role}</span>
              <span className="text-white/30 text-xs">•</span>
              <span className="text-xs text-white/50 truncate">{(user as any)?.branches?.name ?? ''}</span>
              <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                Online
              </span>
            </div>
          </div>
          <DateTimeStack />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Scan Hari Ini', value: stats.total,   color: 'text-white',        accent: 'bg-white/10' },
            { label: 'Valid',         value: stats.valid,   color: 'text-green-400',    accent: 'bg-green-500/20' },
            { label: 'Pending',       value: stats.pending, color: 'text-yellow-400',   accent: 'bg-yellow-500/20' },
          ].map(s => (
            <div key={s.label} className={`${s.accent} rounded-xl p-3 text-center border border-white/10`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-white/60 text-[10px] mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Quick Access — Menu Utama di atas supaya cepat diakses */}
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Menu Utama</h2>
          <div className="grid grid-cols-4 gap-3">
            {quick.map(({ href, icon: Icon, label, color, bg }) => (
              <Link key={href} href={href}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`${color} w-14 h-14 rounded-2xl flex items-center justify-center shadow-md
                                   active:scale-95 transition-transform`}>
                    <Icon size={26} className="text-white" />
                  </div>
                  <span className="text-[10px] text-gray-600 text-center leading-tight whitespace-pre-line font-medium">
                    {label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Kalender bulanan compact di bawah menu */}
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Kalender</h2>
          <MiniCalendar />
        </div>

        {/* Target Hari Ini */}
        <div className="card">
          <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Target size={16} className="text-primary" />
            Target Hari Ini
          </h2>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Scan Valid</span>
                <span className="text-xs font-bold text-gray-700">{stats.valid} / 20</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((stats.valid / 20) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Alert */}
        {stats.pending > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center gap-3">
            <AlertCircle size={20} className="text-yellow-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-yellow-800">
                {stats.pending} scan menunggu validasi koordinator
              </p>
              <p className="text-[10px] text-yellow-600 mt-0.5">Koordinator belum memvalidasi</p>
            </div>
          </div>
        )}
        {stats.valid > 0 && stats.pending === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
            <p className="text-xs font-bold text-green-800">Semua scan telah tervalidasi ✓</p>
          </div>
        )}

        {/* Footer brand */}
        <div className="pt-2 pb-4 flex items-center justify-center gap-2 opacity-40">
          <ShieldCheck size={12} className="text-gray-500" />
          <span className="text-[10px] text-gray-500">RIFIM AIRPORT OPERATION SYSTEM • Bandara Soekarno-Hatta</span>
        </div>
      </div>
    </AppShell>
  )
}
