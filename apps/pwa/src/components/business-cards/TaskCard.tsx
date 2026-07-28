'use client'

import { CalendarClock, CheckCircle2, ListTodo, User } from 'lucide-react'
import clsx from 'clsx'

export interface TaskPayload {
  title: string
  description?: string
  assignee_name?: string
  due_at?: string
  status?: 'open' | 'in_progress' | 'done' | 'cancelled'
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

const STATUS_META: Record<NonNullable<TaskPayload['status']>, { label: string; cls: string }> = {
  open:        { label: 'Terbuka',   cls: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'Berjalan',  cls: 'bg-blue-100 text-blue-700' },
  done:        { label: 'Selesai',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:   { label: 'Dibatalkan', cls: 'bg-red-100 text-red-700' },
}

const PRIORITY_META: Record<NonNullable<TaskPayload['priority']>, { label: string; cls: string }> = {
  low:    { label: 'Rendah',  cls: 'bg-gray-100 text-gray-600' },
  normal: { label: 'Normal',  cls: 'bg-sky-100 text-sky-700' },
  high:   { label: 'Tinggi',  cls: 'bg-amber-100 text-amber-700' },
  urgent: { label: 'Urgent',  cls: 'bg-red-100 text-red-700' },
}

function parse(raw: string): TaskPayload | null {
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object' || typeof p.title !== 'string') return null
    return p as TaskPayload
  } catch {
    return null
  }
}

interface Props {
  raw: string
  onToggleDone?: () => void
}

/**
 * TaskCard — renders a `chat_messages` payload describing a task item.
 * Task ownership stays with whatever upstream module (Smart Office /
 * project tracker) sent the payload. This card only visualises.
 */
export default function TaskCard({ raw, onToggleDone }: Props) {
  const data = parse(raw)
  if (!data) return <p className="text-xs text-red-500">Task (data tidak terbaca)</p>

  const status = STATUS_META[data.status ?? 'open']
  const priority = data.priority ? PRIORITY_META[data.priority] : null
  const isDone = data.status === 'done'

  return (
    <div className={clsx(
      'min-w-[240px] max-w-[320px] rounded-xl border p-3 shadow-sm text-gray-900',
      isDone ? 'bg-gray-50 border-gray-200 opacity-80' : 'bg-white border-teal-200'
    )}>
      <div className="flex items-center gap-2 mb-2">
        <div className={clsx('rounded-lg p-1.5', isDone ? 'bg-emerald-100' : 'bg-teal-100')}>
          {isDone ? <CheckCircle2 size={16} className="text-emerald-600" /> : <ListTodo size={16} className="text-teal-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={clsx('text-xs font-bold truncate', isDone ? 'text-gray-500 line-through' : 'text-gray-800')}>
            {data.title}
          </p>
          {priority && (
            <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold mt-0.5', priority.cls)}>
              {priority.label}
            </span>
          )}
        </div>
        <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold', status.cls)}>
          {status.label}
        </span>
      </div>

      {data.description && (
        <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap break-words mb-2">{data.description}</p>
      )}

      <div className="space-y-0.5 text-[11px] text-gray-500">
        {data.assignee_name && (
          <div className="flex items-center gap-1">
            <User size={11} />
            <span>{data.assignee_name}</span>
          </div>
        )}
        {data.due_at && (
          <div className="flex items-center gap-1">
            <CalendarClock size={11} />
            <span>
              {new Date(data.due_at).toLocaleString('id-ID', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        )}
      </div>

      {onToggleDone && !isDone && data.status !== 'cancelled' && (
        <button
          onClick={onToggleDone}
          className="mt-3 w-full text-xs font-semibold py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          Tandai Selesai
        </button>
      )}
    </div>
  )
}
