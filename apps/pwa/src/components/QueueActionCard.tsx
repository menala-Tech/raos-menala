'use client'

import type React from 'react'
import { MapPin, Package, Clock, User, Info } from 'lucide-react'
import clsx from 'clsx'
import { parseActionCard, type QueuePayload } from '@/lib/actionCardParser'

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span className="text-orange-600">{icon}</span>
      <span className="font-semibold text-gray-700 w-16">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

const QUEUE_STATUS_STYLES: Record<NonNullable<QueuePayload['status']>, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  done: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

type QueueProps = {
  rawContent: string
  currentRole?: string | null
  onApprove?: (payload: QueuePayload) => void | Promise<void>
  onReject?: (payload: QueuePayload) => void | Promise<void>
  onComplete?: (payload: QueuePayload) => void | Promise<void>
  busy?: boolean
}

export function QueueActionCard({
  rawContent,
}: QueueProps) {
  const parsed = parseActionCard(rawContent)
  if (!parsed || parsed.kind !== 'queue') return null

  const status = parsed.status ?? 'pending'

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">Antrian Truk</span>
        <span className={clsx('ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase', QUEUE_STATUS_STYLES[status])}>
          {status}
        </span>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm text-gray-700">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-orange-100 px-2 py-1 font-mono text-base font-bold tracking-wider text-orange-900">
            {parsed.plate}
          </span>
        </div>
        {parsed.route && <Row icon={<MapPin size={14} />} label="Rute" value={parsed.route} />}
        {parsed.cargo && <Row icon={<Package size={14} />} label="Muatan" value={parsed.cargo} />}
        {parsed.eta && <Row icon={<Clock size={14} />} label="ETA" value={parsed.eta} />}
        {parsed.requestedBy && <Row icon={<User size={14} />} label="Oleh" value={parsed.requestedBy} />}
        {parsed.note && <p className="rounded-md bg-orange-50 px-2 py-1 text-xs text-orange-900">{parsed.note}</p>}
      </div>
      <div className="flex items-center gap-2 border-t border-orange-100 px-3 py-2 bg-orange-50 text-[11px] text-orange-800">
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        <span>Presentation only - aksi antrean dilakukan melalui engine Queue canonical.</span>
      </div>
    </div>
  )
}
