'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { cacheReadSync, cacheWriteSync } from '@/lib/apiCache'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import AppShell from '@/components/layout/AppShell'
import {
  ArrowLeft, Bell, CheckCircle2, ScanLine, UserCheck, Megaphone,
  MessageCircle, TrendingUp, Wallet, Car, Archive, ArchiveRestore,
  AlertTriangle, Zap,
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { Notification, NotificationPriority, NotificationStatus } from '@/types'

type Filter = 'today' | '7d' | '30d' | 'all'
type StatusFilter = 'unread' | 'all' | 'archived'

const PAYLOAD_ICONS: Record<string, typeof Bell> = {
  absensi: UserCheck,
  attendance: UserCheck,
  scan: ScanLine,
  kpi: TrendingUp,
  dashboard: TrendingUp,
  pengumuman: Megaphone,
  chat: MessageCircle,
  chat_room: MessageCircle,
  saldo: Wallet,
  saldo_request: Wallet,
  queue: Car,
  system: Bell,
}

const PAYLOAD_LABELS: Record<string, string> = {
  saldo: 'Saldo',
  queue: 'Antrian',
  attendance: 'Absensi',
  absensi: 'Absensi',
  chat: 'Chat',
  chat_room: 'Chat',
  dashboard: 'Dashboard',
  kpi: 'Dashboard',
  pengumuman: 'Pengumuman',
  scan: 'Scan',
  system: 'Sistem',
}

const PRIORITY_STYLES: Record<NotificationPriority, { chip: string; ring: string; label: string; Icon?: typeof Bell }> = {
  critical: { chip: 'bg-red-100 text-red-700 border-red-300',    ring: 'ring-red-300',    label: 'Kritis',  Icon: AlertTriangle },
  high:     { chip: 'bg-orange-100 text-orange-700 border-orange-300', ring: 'ring-orange-300', label: 'Tinggi', Icon: Zap },
  normal:   { chip: 'bg-primary/10 text-secondary border-primary/20',  ring: 'ring-primary/30', label: 'Normal' },
  low:      { chip: 'bg-gray-100 text-gray-500 border-gray-200',       ring: 'ring-gray-200',   label: 'Rendah' },
}

function payloadKey(n: Notification): string {
  return (n.payload_type as string) || n.type || 'system'
}

function windowStart(f: Filter): Date | null {
  const now = new Date()
  if (f === 'today') { now.setHours(0, 0, 0, 0); return now }
  if (f === '7d')    return new Date(Date.now() - 7  * 24 * 60 * 60 * 1000)
  if (f === '30d')   return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return null
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('7d')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unread')
  const [userId, setUserId] = useState<string | null>(null)

  const loadNotifications = useCallback(async (uid: string, f: Filter, s: StatusFilter) => {
    const cacheKey=['notifications',uid,f,s] as const
    const cached=cacheReadSync<Notification[]>(cacheKey, 10*60*1000)
    if(cached){ setNotifications(cached); setLoading(false) } else setLoading(true)
    let q = supabase.from('notifications').select('*').eq('user_id', uid)
    const since = windowStart(f)
    if (since) q = q.gte('created_at', since.toISOString())
    if (s === 'unread')   q = q.neq('status', 'read').neq('status', 'archived')
    if (s === 'archived') q = q.eq('status', 'archived')
    const { data } = await q.order('created_at', { ascending: false }).limit(100)
    const rows=(data ?? []) as Notification[]
    setNotifications(rows)
    cacheWriteSync(cacheKey,rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      setUserId(session.user.id)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!userId) return
    void loadNotifications(userId, filter, statusFilter)
  }, [userId, filter, statusFilter, loadNotifications])


  useRealtimeRefresh(
    `notifications-${userId ?? 'anon'}-${filter}-${statusFilter}`,
    [{table:'notifications',filter:userId?`user_id=eq.${userId}`:undefined}],
    ()=>userId?void loadNotifications(userId,filter,statusFilter):undefined,
    250,
    !!userId,
  )

  // Auto-mark read: batch semua unread saat halaman dibuka (RPC cross-device sync)
  useEffect(() => {
    if (!userId) return
    const unread = notifications.filter(n => !n.is_read && n.status !== 'archived').map(n => n.id)
    if (unread.length === 0) return
    void supabase.rpc('raos_mark_notifications_read', { p_ids: unread })
  }, [userId, notifications])

  async function archiveOne(id: string) {
    await supabase.from('notifications').update({ status: 'archived' }).eq('id', id)
  }

  async function unarchiveOne(id: string) {
    await supabase.from('notifications').update({ status: 'read', is_read: true, read_at: new Date().toISOString() }).eq('id', id)
  }

  // Group by payload_type untuk header pemisah
  const grouped = useMemo(() => {
    const map = new Map<string, Notification[]>()
    for (const n of notifications) {
      const k = payloadKey(n)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(n)
    }
    return Array.from(map.entries())
  }, [notifications])

  const totalUnread = notifications.filter(n => !n.is_read && n.status !== 'archived').length

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div className="flex-1">
            <h1 className="font-bold text-base">Notifikasi</h1>
            <p className="text-[10px] text-white/50 mt-0.5">
              {loading ? 'Memuat...' : `${notifications.length} item${totalUnread > 0 ? ` · ${totalUnread} belum dibaca` : ''}`}
            </p>
          </div>
        </div>

        {/* Time window filter */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto -mx-4 px-4 pb-1">
          {(['today','7d','30d','all'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx('flex-shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold border transition-colors',
                filter === f
                  ? 'bg-primary text-secondary border-primary'
                  : 'bg-white/5 text-white/70 border-white/20 hover:bg-white/10')}>
              {f === 'today' ? 'Hari Ini' : f === '7d' ? '7 Hari' : f === '30d' ? '30 Hari' : 'Semua'}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto -mx-4 px-4">
          {(['unread','all','archived'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={clsx('flex-shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold border transition-colors',
                statusFilter === s
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10')}>
              {s === 'unread' ? 'Belum Dibaca' : s === 'archived' ? 'Diarsipkan' : 'Semua Status'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {loading && (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat notifikasi...</div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="text-center py-16">
            <Bell size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm font-medium">Tidak ada notifikasi</p>
            <p className="text-gray-300 text-xs mt-1">
              Coba ubah filter waktu atau status di atas
            </p>
          </div>
        )}

        {!loading && grouped.map(([groupKey, items]) => {
          const Icon = PAYLOAD_ICONS[groupKey] ?? Bell
          const label = PAYLOAD_LABELS[groupKey] ?? groupKey
          return (
            <div key={groupKey} className="space-y-2">
              <div className="flex items-center gap-1.5 pt-2">
                <Icon size={12} className="text-gray-400" />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {label} · {items.length}
                </p>
              </div>
              {items.map(notif => {
                const ItemIcon = PAYLOAD_ICONS[payloadKey(notif)] ?? Bell
                const prio = (notif.priority ?? 'normal') as NotificationPriority
                const style = PRIORITY_STYLES[prio]
                const PriorityIcon = style.Icon
                const isArchived = notif.status === 'archived'
                const targetUrl = (notif.data as any)?.url as string | undefined
                return (
                  <div
                    key={notif.id}
                    className={clsx(
                      'card flex items-start gap-3 transition-colors',
                      !notif.is_read && !isArchived && 'bg-primary/5 ring-1 ring-primary/20',
                      isArchived && 'opacity-70'
                    )}
                  >
                    <div className={clsx(
                      'p-2 rounded-xl flex-shrink-0 border',
                      prio === 'critical' ? 'bg-red-50 border-red-200'
                        : prio === 'high' ? 'bg-orange-50 border-orange-200'
                        : 'bg-primary/10 border-primary/10'
                    )}>
                      <ItemIcon size={16} className={clsx(
                        prio === 'critical' ? 'text-red-600'
                          : prio === 'high' ? 'text-orange-600'
                          : 'text-primary'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-sm text-gray-800">{notif.title}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {prio !== 'normal' && prio !== 'low' && (
                            <span className={clsx(
                              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold border',
                              style.chip
                            )}>
                              {PriorityIcon && <PriorityIcon size={8} />}
                              {style.label}
                            </span>
                          )}
                          {!notif.is_read && !isArchived && <span className="w-2 h-2 bg-primary rounded-full" />}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 whitespace-pre-wrap break-words">{notif.body}</p>
                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <p className="text-[10px] text-gray-400">
                          {new Date(notif.created_at).toLocaleString('id-ID', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                        <div className="flex items-center gap-1">
                          {targetUrl && (
                            <Link href={targetUrl}
                              className="text-[10px] font-semibold text-primary hover:underline"
                            >
                              Buka →
                            </Link>
                          )}
                          {!isArchived && (
                            <button
                              onClick={() => archiveOne(notif.id)}
                              className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
                              title="Arsipkan"
                            >
                              <Archive size={11} />
                            </button>
                          )}
                          {isArchived && (
                            <button
                              onClick={() => unarchiveOne(notif.id)}
                              className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
                              title="Pulihkan"
                            >
                              <ArchiveRestore size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {!loading && notifications.length > 0 && statusFilter === 'unread' && totalUnread === 0 && (
          <div className="flex items-center justify-center gap-1.5 text-gray-400 pt-4 pb-2">
            <CheckCircle2 size={12} />
            <span className="text-[10px]">Semua notifikasi sudah dibaca</span>
          </div>
        )}
      </div>
    </AppShell>
  )
}
