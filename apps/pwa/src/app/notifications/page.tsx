'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Bell, CheckCircle2, ScanLine, UserCheck, Megaphone, MessageCircle, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { Notification } from '@/types'

const ICONS: Record<string, typeof Bell> = {
  absensi: UserCheck,
  scan: ScanLine,
  kpi: TrendingUp,
  pengumuman: Megaphone,
  chat: MessageCircle,
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      setNotifications(data ?? [])
      setLoading(false)

      // Tandai semua sudah dibaca setelah dilihat
      const unreadIds = (data ?? []).filter(n => !n.is_read).map(n => n.id)
      if (unreadIds.length > 0) {
        await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
      }
    }
    init()
  }, [router])

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 flex items-center gap-3">
        <Link href="/dashboard"><ArrowLeft size={22} /></Link>
        <h1 className="font-bold text-base">Notifikasi</h1>
      </div>

      <div className="px-4 py-3 space-y-2">
        {loading && (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat notifikasi...</div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="text-center py-16">
            <Bell size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm font-medium">Belum ada notifikasi</p>
            <p className="text-gray-300 text-xs mt-1">
              Notifikasi absensi, scan, dan pengumuman akan muncul di sini
            </p>
          </div>
        )}

        {!loading && notifications.map(notif => {
          const Icon = ICONS[notif.type] ?? Bell
          return (
            <div
              key={notif.id}
              className={clsx('card flex items-start gap-3', !notif.is_read && 'bg-primary/5 border border-primary/20')}
            >
              <div className="bg-primary/10 p-2 rounded-xl flex-shrink-0">
                <Icon size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm text-gray-800">{notif.title}</p>
                  {!notif.is_read && <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{notif.body}</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {new Date(notif.created_at).toLocaleString('id-ID', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          )
        })}

        {!loading && notifications.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-gray-400 pt-2">
            <CheckCircle2 size={12} />
            <span className="text-[10px]">Semua notifikasi telah ditandai dibaca</span>
          </div>
        )}
      </div>
    </AppShell>
  )
}
