'use client'

type DriverStatus = 'pending' | 'approved' | 'rejected' | 'active'
type QueueStatus = 'pending' | 'approved' | 'rejected' | 'done'

export type DriverPayload = {
  kind: 'driver'
  name: string
  status?: DriverStatus
  phone?: string
  license?: string
  vehicle?: string
  branch?: string
  requestedBy?: string
  note?: string
  [key: string]: any
}

export type QueuePayload = {
  kind: 'queue'
  plate: string
  status?: QueueStatus
  route?: string
  cargo?: string
  eta?: string
  requestedBy?: string
  note?: string
  [key: string]: any
}

export type ActionCardPayload = DriverPayload | QueuePayload

export function parseActionCard(rawContent: string): ActionCardPayload | null {
  if (!rawContent) return null
  try {
    const parsed = JSON.parse(rawContent)
    if (!parsed || typeof parsed !== 'object') return null

    if (parsed.kind === 'driver' || parsed.kind === 'queue') {
      return parsed as ActionCardPayload
    }

    if (typeof parsed.plate === 'string' || typeof parsed.route === 'string' || typeof parsed.cargo === 'string') {
      return { ...parsed, kind: 'queue' } as QueuePayload
    }

    if (typeof parsed.name === 'string' || typeof parsed.license === 'string' || typeof parsed.vehicle === 'string') {
      return { ...parsed, kind: 'driver' } as DriverPayload
    }

    return null
  } catch {
    return null
  }
}
