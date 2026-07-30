'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck, AlertTriangle, Send, Archive, XCircle, Loader2, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'

interface DailyPoint { day: string; total: number; read_count: number; priority_count: number }
interface Summary {
  scope: 'all' | 'own'
  window_days: number
  total: number
  sent: number
  delivered: number
  read: number
  archived: number
  expired: number
  pending: number
  failed: number
  critical: number
  high: number
  read_rate_pct: number
  delivery_rate_pct: number
  by_payload: Record<string, number>
  by_day: DailyPoint[]
}

const PAYLOAD_LABEL: Record<string, string> = {
  saldo: 'Saldo', queue: 'Antrian', attendance: 'Absensi', absensi: 'Absensi',
  chat: 'Chat', chat_room: 'Chat', pengumuman: 'Pengumuman',
  scan: 'Scan', kpi: 'KPI', dashboard: 'Dashboard', system: 'Sistem',
}

/**
 * Panel metrik Notification Engine (F4). Scope otomatis dari RPC:
 *  - staff/koordinator/driver_manager -> hanya milik sendiri
 *  - admin/management/direksi         -> semua (executive view)
 */
export default function NotificationStatsPanel() {
  const [days, setDays] = useState<7 | 30>(7)
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: res, error } = await supabase.rpc('raos_notification_stats_summary', { p_days: days })
    if (error) console.warn('[NotificationStatsPanel] gagal:', error)
    setData((res ?? null) as Summary | null)
    setLoading(false)
  }, [days])

  useEffect(() => { void load() }, [load])

  // Realtime: kalau ada notif baru masuk, refresh (debounced)
  useEffect(() => {
    const ch = supabase
      .channel('notif-stats-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' },
        () => { void load() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  if (loading && !data) {
    return (
      <div className="card flex items-center gap-2 text-gray-400 text-sm">
        <Loader2 size={14} className="animate-spin" /> Memuat metrik notifikasi...
      </div>
    )
  }
  if (!data) return null

  const maxDayTotal = Math.max(1, ...data.by_day.map(d => d.total))
  const byPayloadEntries = Object.entries(data.by_payload ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-1.5 rounded-lg"><Bell size={14} className="text-primary" /></div>
          <div>
            <p className="font-bold text-sm text-gray-800">Notification Engine — Metrik</p>
            <p className="text-[10px] text-gray-400">
              Scope: <span className="font-semibold">{data.scope === 'all' ? 'Semua User' : 'Milik Anda'}</span>
              {' · '} {data.window_days} hari terakhir
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {([7, 30] as const).map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={clsx('rounded-full px-2.5 py-0.5 text-[10px] font-semibold border',
                days === d ? 'bg-primary text-secondary border-primary' : 'bg-gray-50 text-gray-500 border-gray-200')}>
              {d}h
            </button>
          ))}
        </div>
      </div>

      {/* Top-line KPI */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard icon={Send}       label="Terkirim" value={data.total}    tint="primary" />
        <StatCard icon={CheckCheck} label={`Read (${data.read_rate_pct}%)`} value={data.read} tint="green" />
        <StatCard icon={AlertTriangle} label="Pending" value={data.pending} tint="amber" />
        <StatCard icon={XCircle}    label="Failed"  value={data.failed}   tint="red" />
      </div>

      {/* Priority + Archive breakdown */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <MiniPill label="Kritis" value={data.critical} color="red" />
        <MiniPill label="Tinggi" value={data.high} color="orange" />
        <MiniPill label="Diarsipkan" value={data.archived} color="gray" />
      </div>

      {/* Trend 7-day sparkline (simple bar) */}
      {data.by_day.length > 0 && (
        <div className="border-t border-gray-100 pt-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp size={11} className="text-gray-400" />
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Trend 7 hari terakhir</p>
          </div>
          <div className="flex items-end gap-1 h-16">
            {data.by_day.map(d => {
              const h = Math.max(2, Math.round((d.total / maxDayTotal) * 60))
              const readH = Math.round((d.read_count / Math.max(1, d.total)) * h)
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full bg-gray-100 rounded-t relative" style={{ height: h }}>
                    <div className="absolute bottom-0 left-0 right-0 bg-green-400 rounded-t" style={{ height: readH }} />
                    {d.priority_count > 0 && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500" />
                    )}
                  </div>
                  <p className="text-[8px] text-gray-400">
                    {new Date(d.day).toLocaleDateString('id-ID', { day: '2-digit' })}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[9px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-sm" /> Read</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-200 rounded-sm" /> Sent</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-red-500 rounded-full" /> Ada kritis/tinggi</span>
          </div>
        </div>
      )}

      {/* Breakdown per kategori */}
      {byPayloadEntries.length > 0 && (
        <div className="border-t border-gray-100 pt-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Per Kategori</p>
          <div className="grid grid-cols-2 gap-1.5">
            {byPayloadEntries.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between bg-gray-50 rounded-lg px-2 py-1">
                <span className="text-[11px] text-gray-700">{PAYLOAD_LABEL[k] ?? k}</span>
                <span className="text-[11px] font-bold text-gray-800">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-gray-400 text-center">
        Delivery rate: <span className="font-bold text-gray-500">{data.delivery_rate_pct}%</span>
        {' · '} Failed = push gagal (in-app tetap tersimpan)
      </p>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, tint }: {
  icon: typeof Bell; label: string; value: number
  tint: 'primary' | 'green' | 'amber' | 'red'
}) {
  const tints: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'bg-primary/10', text: 'text-secondary' },
    green:   { bg: 'bg-green-50',   text: 'text-green-700' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700' },
    red:     { bg: 'bg-red-50',     text: 'text-red-700' },
  }
  const t = tints[tint]
  return (
    <div className={clsx('rounded-xl p-2', t.bg)}>
      <div className="flex items-center gap-1 mb-0.5">
        <Icon size={10} className={t.text} />
        <p className={clsx('text-[9px] font-semibold uppercase truncate', t.text)}>{label}</p>
      </div>
      <p className={clsx('text-lg font-black', t.text)}>{value.toLocaleString('id-ID')}</p>
    </div>
  )
}

function MiniPill({ label, value, color }: { label: string; value: number; color: 'red'|'orange'|'gray' }) {
  const styles = {
    red:    'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    gray:   'bg-gray-50 text-gray-600',
  }
  return (
    <div className={clsx('flex items-center justify-between rounded-lg px-2 py-1', styles[color])}>
      <span className="font-semibold">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  )
}
