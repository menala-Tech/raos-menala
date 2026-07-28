'use client'

import DriverQueueCard from '@/components/DriverQueueCard'
import { QueueActionCard } from '@/components/QueueActionCard'
import type { QueuePayload } from '@/lib/actionCardParser'

/**
 * QueueCard — timeline card for anything queue-related.
 *
 * There are two shapes on the wire that both belong to the queue business
 * domain of the RAOS project:
 *
 *   - `driver_queue`   → raos_driver_queue event bubble (joined/called/
 *                        completed/left) rendered read-only.
 *   - action-card JSON → operations approval workflow (approve/reject/
 *                        complete) for a plate/route.
 *
 * The card auto-selects the correct renderer so the timeline only needs to
 * know it is dealing with a "queue" business event.
 */

interface Props {
  rawContent: string
  variant: 'event' | 'action'
  currentRole?: string | null
  busy?: boolean
  onApprove?: (payload: QueuePayload) => void | Promise<void>
  onReject?: (payload: QueuePayload) => void | Promise<void>
  onComplete?: (payload: QueuePayload) => void | Promise<void>
}

export default function QueueCard({ rawContent, variant, currentRole, busy, onApprove, onReject, onComplete }: Props) {
  if (variant === 'event') return <DriverQueueCard raw={rawContent} />
  return (
    <QueueActionCard
      rawContent={rawContent}
      currentRole={currentRole}
      busy={busy}
      onApprove={onApprove}
      onReject={onReject}
      onComplete={onComplete}
    />
  )
}
