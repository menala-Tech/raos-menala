'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCachedQuery } from '@/lib/apiCache'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import MiniCalendar from '@/components/MiniCalendar'
import {
  ScanLine, Clock, UserCheck, MessageCircle,
  Target, CheckCircle2, AlertCircle, Bell,
  TrendingUp, ShieldCheck, Car, FileBarChart,
  ClipboardCheck,
} from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/types'
import { can } from '@/lib/accessPolicy'
import { branchDateKey, branchHour } from '@/lib/branchTime'
import { useNetworkStatus } from '@/lib/useNetworkStatus'

export default function DashboardPage() {
  const router = useRouter()
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)

  // Auth check — blocking, tidak di-cache (session harus fresh)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      setSessionUserId(session.user.id)
    })
  }, [router])

  // 3 query paralel — cache-first, background refresh
  const { data: user } = useCachedQuery<UserProfile>(
    ['user-profile', sessionUserId],
    async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('*, branches(*)')
        .eq('id', sessionUserId!)
        .single()
      return data as UserProfile
    },
    { enabled: !!sessionUserId, ttlMs: 30 * 60 * 1000 }
  )

  const branchTimeZone=(user as any)?.branches?.timezone as string | undefined
  const today = branchDateKey(branchTimeZone)
  const { data: stats } = useCachedQuery(
    ['dashboard-stats', sessionUserId, branchTimeZone ?? 'default', today],
    async () => {
      // 36h network window safely covers one local civil day across WIB/WITA/WIT.
      const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
      const { data: scans } = await supabase
        .from('scan_orders')
        .select('status, scanned_at')
        .eq('staff_id', sessionUserId!)
        .gte('scanned_at', since)
      const s = (scans || []).filter(x =>
        !!x.scanned_at && branchDateKey(branchTimeZone, new Date(x.scanned_at)) === today
      )
      return {
        total: s.length,
        valid: s.filter(x => x.status === 'valid').length,
        pending: s.filter(x => x.status === 'pending').length,
      }
    },
    { enabled: !!sessionUserId && !!user, ttlMs: 5 * 60 * 1000, refreshIntervalMs: 5 * 60 * 1000 }
  )

  const { data: unreadNotifData } = useCachedQuery(
    ['dashboard-unread-notif', sessionUserId],
    async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', sessionUserId!)
        .eq('is_read', false)
      return count ?? 0
    },
    { enabled: !!sessionUserId, ttlMs: 60 * 1000, refreshIntervalMs: 2 * 60 * 1000 }
  )
  const unreadNotif = unreadNotifData ?? 0
  const statsData = stats ?? { total: 0, valid: 0, pending: 0 }

  const role = user?.role ?? ''
  const online = useNetworkStatus()


  const quick = [
    ...(can(role,'scan:create') ? [{ href:'/scan', icon:ScanLine, label:'Scan\nBarcode', color:'bg-blue-600', bg:'bg-blue-50' }] : []),
    ...(can(role,'attendance:self') ? [{ href:'/absensi', icon:UserCheck, label:'Absensi', color:'bg-green-600', bg:'bg-green-50' }] : []),
    ...((can(role,'history:self')||can(role,'history:branch:read')) ? [{ href:'/riwayat', icon:Clock, label:'Riwayat', color:'bg-orange-500', bg:'bg-orange-50' }] : []),
    { href:'/chat', icon:MessageCircle, label:'Chat\nRoom', color:'bg-purple-600', bg:'bg-purple-50' },
    ...((can(role,'kpi:self')||can(role,'kpi:branch:read')) ? [{ href:'/kpi', icon:TrendingUp, label:'KPI &\nTarget', color:'bg-pink-600', bg:'bg-pink-50' }] : []),
    // Fix A: "Status Scan" shortcut removed -- /riwayat is now the canonical
    // operational history UI (Scan/Absensi/Isi Saldo/Antrian tabs, date +
    // status filters, search, detail, summary) and fully supersedes the
    // aggregate-only /status page. /status itself is kept as a redirect
    // (see app/status/page.tsx) for anyone with the URL bookmarked/linked.
    ...(can(role,'driver:read') ? [{ href:'/drivers', icon:Car, label:'Driver &\nKendaraan', color:'bg-indigo-600', bg:'bg-indigo-50' }] : []),
    ...(can(role,'queue:branch:read') ? [{ href:'/antrian-driver', icon:Car, label:'Antrian\nDriver', color:'bg-amber-600', bg:'bg-amber-50' }] : []),
    ...(can(role,'saldo:branch:read') ? [{ href:'/validasi-saldo', icon:ClipboardCheck, label:'Riwayat\nSaldo', color:'bg-amber-600', bg:'bg-amber-50' }] : []),
    ...(can(role,'admin:panel') ? [{ href:'/admin', icon:ShieldCheck, label:'Panel\nAdmin', color:'bg-secondary', bg:'bg-gray-50' }] : []),
    ...(can(role,'report:read') ? [{ href:'/laporan', icon:FileBarChart, label:'Laporan &\nAnalitik', color:'bg-cyan-700', bg:'bg-cyan-50' }] : []),
  ]

  const greeting = () => {
    const h = branchHour((user as any)?.branches?.timezone)
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
                {online ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
          <DateTimeStack timeZone={(user as any)?.branches?.timezone} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Scan Hari Ini', value: statsData.total,   color: 'text-white',        accent: 'bg-white/10' },
            { label: 'Valid',         value: statsData.valid,   color: 'text-green-400',    accent: 'bg-green-500/20' },
            { label: 'Pending',       value: statsData.pending, color: 'text-yellow-400',   accent: 'bg-yellow-500/20' },
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

        {/* Aktivitas Hari Ini */}
        <div className="card">
          <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Target size={16} className="text-primary" />
            Aktivitas Hari Ini
          </h2>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Scan Valid Hari Ini</span>
                <span className="text-xs font-bold text-gray-700">{statsData.valid}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Alert */}
        {statsData.pending > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center gap-3">
            <AlertCircle size={20} className="text-yellow-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-yellow-800">
                {statsData.pending} scan menunggu proses
              </p>
              <p className="text-[10px] text-yellow-600 mt-0.5">Menunggu proses sesuai hak akses Admin/Direksi</p>
            </div>
          </div>
        )}
        {statsData.valid > 0 && statsData.pending === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
            <p className="text-xs font-bold text-green-800">Semua scan telah tervalidasi ✓</p>
          </div>
        )}

        {/* Footer brand */}
        <div className="pt-2 pb-4 flex items-center justify-center gap-2 opacity-40">
          <ShieldCheck size={12} className="text-gray-500" />
          <span className="text-[10px] text-gray-500">MENALA AIRPORT OPERATION SYSTEM • {(user as any)?.branches?.name ?? 'Multi Cabang'}</span>
        </div>
      </div>
    </AppShell>
  )
}
