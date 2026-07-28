'use client'

import { CheckCircle2, Circle, GitBranch, Loader2 } from 'lucide-react'
import clsx from 'clsx'

export interface WorkflowStep {
  label: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  actor?: string
  at?: string
}

export interface WorkflowPayload {
  title: string
  description?: string
  steps: WorkflowStep[]
}

const STEP_META: Record<WorkflowStep['status'], { icon: typeof CheckCircle2; cls: string }> = {
  pending:     { icon: Circle,        cls: 'text-gray-400' },
  in_progress: { icon: Loader2,       cls: 'text-blue-500 animate-spin' },
  done:        { icon: CheckCircle2,  cls: 'text-emerald-600' },
  blocked:     { icon: Circle,        cls: 'text-red-500' },
}

interface Props {
  raw: string
}

function parse(raw: string): WorkflowPayload | null {
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object' || !Array.isArray(p.steps)) return null
    return p as WorkflowPayload
  } catch {
    return null
  }
}

/**
 * WorkflowCard — renders a Smart Office workflow step payload posted as
 * `chat_messages.content` JSON. Owns no data — Smart Office remains the
 * upstream owner (RULE_PROJECT §business ownership). This card only
 * visualises what the caller sent.
 */
export default function WorkflowCard({ raw }: Props) {
  const data = parse(raw)
  if (!data) return <p className="text-xs text-red-500">Workflow (data tidak terbaca)</p>

  return (
    <div className="min-w-[240px] max-w-[320px] rounded-xl bg-white border border-gray-200 p-3 shadow-sm text-gray-900">
      <div className="flex items-center gap-2 mb-2">
        <div className="bg-purple-100 rounded-lg p-1.5">
          <GitBranch size={16} className="text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">{data.title || 'Workflow'}</p>
          {data.description && <p className="text-[10px] text-gray-500 truncate">{data.description}</p>}
        </div>
      </div>
      <ol className="space-y-1.5 text-xs">
        {data.steps.map((step, i) => {
          const meta = STEP_META[step.status] ?? STEP_META.pending
          const Icon = meta.icon
          return (
            <li key={i} className="flex items-start gap-2">
              <Icon size={14} className={clsx('mt-0.5 flex-shrink-0', meta.cls)} />
              <div className="flex-1 min-w-0">
                <p className={clsx('font-semibold', step.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-800')}>
                  {step.label}
                </p>
                {(step.actor || step.at) && (
                  <p className="text-[10px] text-gray-400">
                    {step.actor && <span>{step.actor}</span>}
                    {step.actor && step.at && <span> · </span>}
                    {step.at && (
                      <span>
                        {new Date(step.at).toLocaleString('id-ID', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
