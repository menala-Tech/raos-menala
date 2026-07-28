'use client'

import { DriverActionCard } from '@/components/DriverActionCard'
import type { DriverPayload } from '@/lib/actionCardParser'

/**
 * DriverCard — timeline card for a driver approval workflow.
 * Reuses the underlying DriverActionCard renderer while keeping the
 * business-card naming convention used across the workspace timeline.
 * Backed by raos_drivers + chat_messages (kind='driver' action payload).
 */
interface Props {
  rawContent: string
  currentRole?: string | null
  busy?: boolean
  onApprove?: (payload: DriverPayload) => void | Promise<void>
  onReject?: (payload: DriverPayload) => void | Promise<void>
  onActivate?: (payload: DriverPayload) => void | Promise<void>
}

export default function DriverCard({ rawContent, currentRole, busy, onApprove, onReject, onActivate }: Props) {
  return (
    <DriverActionCard
      rawContent={rawContent}
      currentRole={currentRole}
      busy={busy}
      onApprove={onApprove}
      onReject={onReject}
      onActivate={onActivate}
    />
  )
}
