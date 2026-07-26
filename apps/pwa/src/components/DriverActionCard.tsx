'use client'

import type React from 'react'
import { Phone, FileText, Car, Building2, User, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { parseActionCard, type DriverPayload } from '@/lib/actionCardParser'

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span className="text-purple-600">{icon}</span>
      <span className="font-semibold text-gray-700 w-16">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

const DRIVER_STATUS_STYLES: Record<NonNullable<DriverPayload['status']>, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

type DriverProps = {
  rawContent: string
  currentRole?: string | null
  onApprove?: (payload: DriverPayload) => void | Promise<void>
  onReject?: (payload: DriverPayload) => void | Promise<void>
  onActivate?: (payload: DriverPayload) => void | Promise<void>
  busy?: boolean
}

export function DriverActionCard({
  rawContent,
  currentRole,
  onApprove,
  onReject,
  onActivate,
  busy,
}: DriverProps) {
  const parsed = parseActionCard(rawContent)
  if (!parsed || parsed.kind !== 'driver') return null

  const status = parsed.status ?? 'pending'
  const canManage = ['admin', 'supervisor', 'hr', 'driver_manager'].includes((currentRole ?? '').toLowerCase())
  const initials = parsed.name
    .split(/\s+/)
    .map(s => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">Registrasi Driver</span>
        <span className={clsx('ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase', DRIVER_STATUS_STYLES[status])}>
          {status}
        </span>
      </div>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">
          {initials || 'DR'}
        </div>
        <div className="flex-1 space-y-1.5 text-sm text-gray-700">
          <p className="font-semibold text-gray-900">{parsed.name}</p>
          {parsed.phone && <Row icon={<Phone size={14} />} label="HP" value={parsed.phone} />}
          {parsed.license && <Row icon={<FileText size={14} />} label="SIM" value={parsed.license} />}
          {parsed.vehicle && <Row icon={<Car size={14} />} label="Unit" value={parsed.vehicle} />}
          {parsed.branch && <Row icon={<Building2 size={14} />} label="Cabang" value={parsed.branch} />}
          {parsed.requestedBy && <Row icon={<User size={14} />} label="Oleh" value={parsed.requestedBy} />}
          {parsed.note && <p className="rounded-md bg-purple-50 px-2 py-1 text-xs text-purple-900">{parsed.note}</p>}
        </div>
      </div>
      {canManage && status !== 'rejected' && status !== 'active' && (
        <div className="flex gap-2 border-t border-purple-100 px-3 py-2 bg-gray-50">
          {status === 'pending' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApprove?.(parsed)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Setujui
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReject?.(parsed)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <XCircle className="h-3.5 w-3.5" />
                Tolak
              </button>
            </>
          )}
          {status === 'approved' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onActivate?.(parsed)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Aktifkan Driver
            </button>
          )}
        </div>
      )}
    </div>
  )
}
