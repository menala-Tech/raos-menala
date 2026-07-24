'use client'

import { Car, CheckCircle2, Phone, LogOut, PlayCircle } from 'lucide-react'
import clsx from 'clsx'

/**
 * Render bubble type='driver_queue' event.
 * Content JSON: { event: 'joined'|'called'|'completed'|'left', driver_name, driver_id, position, queue_id }
 */
interface Content {
  event: 'joined' | 'called' | 'completed' | 'left'
  driver_name?: string
  driver_id?: string
  position?: number
  queue_id?: string
}

function parse(raw: string): Content | null {
  try { return JSON.parse(raw) } catch { return null }
}

export default function DriverQueueCard({ raw }: { raw: string }) {
  const data = parse(raw)
  if (!data) return <p className="text-xs text-red-500">Antrian driver (data tidak terbaca)</p>

  const eventMeta = (() => {
    switch (data.event) {
      case 'joined':
        return { icon: PlayCircle, label: 'MASUK ANTREAN', cls: 'bg-amber-100 text-amber-700 border-amber-200' }
      case 'called':
        return { icon: Phone, label: 'DIPANGGIL', cls: 'bg-blue-100 text-blue-700 border-blue-200' }
      case 'completed':
        return { icon: CheckCircle2, label: 'SELESAI', cls: 'bg-green-100 text-green-700 border-green-200' }
      case 'left':
        return { icon: LogOut, label: 'KELUAR', cls: 'bg-gray-100 text-gray-600 border-gray-200' }
    }
  })()
  const Icon = eventMeta.icon

  return (
    <div className={clsx('min-w-[220px] max-w-[300px] rounded-xl border p-3', eventMeta.cls)}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={16} />
        <span className="text-[10px] font-bold uppercase tracking-wider">{eventMeta.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-white/60 rounded-lg p-1.5 flex-shrink-0">
          <Car size={16} className="text-gray-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{data.driver_name ?? '(unknown)'}</p>
          <p className="text-[11px] text-gray-500">{data.driver_id ?? '-'}</p>
        </div>
        {data.position != null && (
          <div className="bg-white/80 rounded-lg px-2 py-1 text-center">
            <p className="text-[9px] text-gray-500 font-semibold">POSISI</p>
            <p className="text-lg font-black text-secondary leading-none">{data.position}</p>
          </div>
        )}
      </div>
    </div>
  )
}
