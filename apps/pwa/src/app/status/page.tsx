'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/types'

type RangeKey = 'today' | '7d' | '30d'

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: '30d', label: '30 Hari' },
]

export default function StatusPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [range, setRange] = useState<RangeKey>('today')
  const [counts, setCounts] = useState({ valid: 0, pending: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)

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

      const isAdmin = profile && ['koordinator', 'admin', 'direksi'].includes(profile.role)

      const since = new Date()
      if (range === 'today') since.setHours(0, 0, 0, 0)
      else if (range === '7d') since.setDate(since.getDate() - 7)
      else since.setDate(since.getDate() - 30)

      let query = supabase
        .from('scan_orders')
        .select('status')
        .gte('scanned_at', since.toISOString())

      if (!isAdmin) query = query.eq('staff_id', session.user.id)

      const { data: scans } = await query

      setCounts({
        valid: scans?.filter(s => s.status === 'valid').length ?? 0,
        pending: scans?.filter(s => s.status === 'pending').length ?? 0,
        rejected: scans?.filter(s => s.status === 'rejected').length ?? 0,
      })
      setLoading(false)
    }
    setLoading(true)
    load()
  }, [router, range])

  const total = counts.valid + counts.pending + counts.rejected
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  // Donut chart via conic-gradient
  const validDeg = pct(counts.valid) * 3.6
  const pendingDeg = pct(counts.pending) * 3.6
  const gradient = `conic-gradient(
    #22C55E 0deg ${validDeg}deg,
    #EAB308 ${validDeg}deg ${validDeg + pendingDeg}deg,
    #EF4444 ${validDeg + pendingDeg}deg 360deg
  )`

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <h1 className="font-bold text-base">Status Validasi</h1>
        </div>

        <div className="flex gap-2">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${range === r.key ? 'bg-primary text-white' : 'bg-white/10 text-white/60'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-6">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat data...</div>
        ) : total === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-400 text-sm">Belum ada aktivitas scan pada periode ini</p>
          </div>
        ) : (
          <>
            {/* Donut Chart */}
            <div className="flex flex-col items-center mb-6">
              <div
                className="w-48 h-48 rounded-full flex items-center justify-center relative"
                style={{ background: gradient }}
              >
                <div className="w-32 h-32 bg-white rounded-full flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-gray-800">{total}</span>
                  <span className="text-xs text-gray-400">Total Scan</span>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2">
              {[
                { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50', label: 'Valid', value: counts.valid },
                { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Pending', value: counts.pending },
                { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Ditolak', value: counts.rejected },
              ].map(({ icon: Icon, color, bg, label, value }) => (
                <div key={label} className={`card flex items-center justify-between ${bg}`}>
                  <div className="flex items-center gap-2">
                    <Icon size={18} className={color} />
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-gray-800">{value}</span>
                    <span className="text-xs text-gray-400 ml-1">({pct(value).toFixed(0)}%)</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="card mt-4 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                Tingkat Validasi:{' '}
                <span className="font-bold text-primary">{pct(counts.valid).toFixed(0)}%</span>
              </p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
