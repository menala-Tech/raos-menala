'use client'

import { CheckCircle2, Clock, ClipboardCheck, XCircle } from 'lucide-react'
import clsx from 'clsx'
import type { ScanOrder } from '@/types'

const STATUS_META: Record<ScanOrder['status'], { icon: typeof CheckCircle2; label: string; cls: string }> = {
  pending:  { icon: Clock,        label: 'Menunggu Validasi', cls: 'bg-amber-100 text-amber-700' },
  valid:    { icon: CheckCircle2, label: 'Divalidasi',        cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { icon: XCircle,      label: 'Ditolak',           cls: 'bg-red-100 text-red-700' },
}

interface Props {
  entity: ScanOrder
  staffName?: string
  pickupPointName?: string
  onApprove?: () => void
  onReject?: () => void
  canDecide?: boolean
  busy?: boolean
}

/**
 * ApprovalCard — renders a scan_orders approval workflow (RAOS SSOT).
 * Business owner: RAOS (`scan_orders` table). Owns no data of its own.
 * Displays scan metadata; optional inline approve/reject when
 * `canDecide=true`. Handler callbacks are wired by the caller to the
 * existing scan validation API (no new endpoint introduced).
 */
export default function ApprovalCard({ entity, staffName, pickupPointName, onApprove, onReject, canDecide, busy }: Props) {
  const status = STATUS_META[entity.status]
  const StatusIcon = status.icon

  return (
    <div className="min-w-[240px] max-w-[320px] rounded-xl bg-white border border-gray-200 p-3 shadow-sm text-gray-900">
      <div className="flex items-center gap-2 mb-2">
        <div className="bg-indigo-100 rounded-lg p-1.5">
          <ClipboardCheck size={16} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">Persetujuan Scan Order</p>
          <p className="text-[10px] text-gray-500 truncate font-mono">{entity.scan_id}</p>
        </div>
        <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold', status.cls)}>
          <StatusIcon size={10} />
          {status.label}
        </span>
      </div>

      <div className="space-y-0.5 text-xs">
        {staffName && (
          <div className="flex justify-between">
            <span className="text-gray-500">Staff</span>
            <span className="font-medium truncate max-w-[180px] text-right">{staffName}</span>
          </div>
        )}
        {entity.drivers?.name && (
          <div className="flex justify-between">
            <span className="text-gray-500">Driver</span>
            <span className="font-medium truncate max-w-[180px] text-right">{entity.drivers.name}</span>
          </div>
        )}
        {pickupPointName && (
          <div className="flex justify-between">
            <span className="text-gray-500">Pickup</span>
            <span className="font-medium truncate max-w-[180px] text-right">{pickupPointName}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">Waktu</span>
          <span className="text-[11px]">
            {new Date(entity.scanned_at).toLocaleString('id-ID', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
        {entity.gmv > 0 && (
          <div className="flex justify-between pt-1 border-t border-gray-100">
            <span className="text-gray-500">GMV</span>
            <span className="font-semibold text-indigo-600">Rp{entity.gmv.toLocaleString('id-ID')}</span>
          </div>
        )}
      </div>

      {canDecide && entity.status === 'pending' && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            disabled={busy}
            onClick={onReject}
            className="text-xs font-semibold py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            Tolak
          </button>
          <button
            disabled={busy}
            onClick={onApprove}
            className="text-xs font-semibold py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Validasi
          </button>
        </div>
      )}
    </div>
  )
}
