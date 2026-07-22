'use client'

import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, Clock } from 'lucide-react'

/**
 * Chip kecil tanggal + jam realtime WIB — dipakai di header halaman utama.
 * Tick tiap detik. Format: "Rab, 22 Jul 2026 • 06.51 WIB".
 */
export default function DateTimeHeader({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const dateStr = now.toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
  }).replace(':', '.')

  return (
    <div className={
      'inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 ' +
      (compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]') +
      ' text-white/80 font-medium tabular-nums'
    }>
      <CalendarIcon size={compact ? 11 : 12} className="text-primary flex-shrink-0" />
      <span>{dateStr}</span>
      <span className="text-white/30">•</span>
      <Clock size={compact ? 11 : 12} className="text-primary flex-shrink-0" />
      <span>{timeStr} WIB</span>
    </div>
  )
}
