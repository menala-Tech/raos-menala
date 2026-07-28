'use client'

import { Calendar, Clock, MapPin, ShieldCheck, ShieldOff } from 'lucide-react'
import clsx from 'clsx'
import type { Attendance } from '@/types'

const STATUS_META: Record<Attendance['status'], { label: string; cls: string }> = {
  hadir:        { label: 'Hadir',       cls: 'bg-green-100 text-green-700' },
  terlambat:    { label: 'Terlambat',   cls: 'bg-amber-100 text-amber-700' },
  tidak_hadir:  { label: 'Tidak Hadir', cls: 'bg-red-100 text-red-700'    },
  sakit:        { label: 'Sakit',       cls: 'bg-sky-100 text-sky-700'    },
  izin:         { label: 'Izin',        cls: 'bg-indigo-100 text-indigo-700' },
}

interface Props {
  entity: Attendance
  staffName?: string
  branchName?: string
  shiftName?: string
}

/**
 * AttendanceCard — reads a `raos_attendance` row (SSOT: Supabase table
 * `raos_attendance`) and renders it as a workspace timeline event. Owns
 * no data; visualization only.
 */
export default function AttendanceCard({ entity, staffName, branchName, shiftName }: Props) {
  const status = STATUS_META[entity.status]
  const hasCheckIn = Boolean(entity.check_in_at)
  const hasCheckOut = Boolean(entity.check_out_at)

  return (
    <div className="min-w-[240px] max-w-[320px] rounded-xl bg-white border border-gray-200 p-3 shadow-sm text-gray-900">
      <div className="flex items-center gap-2 mb-2">
        <div className="bg-emerald-100 rounded-lg p-1.5">
          <Calendar size={16} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">Absensi{staffName ? ` · ${staffName}` : ''}</p>
          <p className="text-[10px] text-gray-500 truncate">
            {new Date(entity.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            {shiftName ? ` · ${shiftName}` : ''}
          </p>
        </div>
        <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold', status.cls)}>
          {status.label}
        </span>
      </div>
      <div className="space-y-1 text-xs">
        {branchName && (
          <div className="flex justify-between">
            <span className="text-gray-500">Cabang</span>
            <span className="font-medium truncate max-w-[180px] text-right">{branchName}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">Masuk</span>
          <span className="font-mono text-[11px] inline-flex items-center gap-1">
            <Clock size={10} className="text-gray-400" />
            {hasCheckIn
              ? new Date(entity.check_in_at!).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Pulang</span>
          <span className="font-mono text-[11px] inline-flex items-center gap-1">
            <Clock size={10} className="text-gray-400" />
            {hasCheckOut
              ? new Date(entity.check_out_at!).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
        </div>
        <div className="flex justify-between items-center pt-1 border-t border-gray-100">
          <span className="text-gray-500 inline-flex items-center gap-1">
            <MapPin size={11} className="text-gray-400" /> Validasi lokasi
          </span>
          <span className={clsx(
            'inline-flex items-center gap-1 text-[11px] font-semibold',
            entity.is_location_valid ? 'text-emerald-600' : 'text-amber-600'
          )}>
            {entity.is_location_valid
              ? <><ShieldCheck size={11} /> Valid</>
              : <><ShieldOff size={11} /> Di luar radius</>}
          </span>
        </div>
      </div>
    </div>
  )
}
