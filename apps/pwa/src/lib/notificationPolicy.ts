export const NOTIFICATION_ELIGIBLE_ROLES = ['staff', 'koordinator', 'admin', 'driver'] as const

export type NotificationEligibleRole = (typeof NOTIFICATION_ELIGIBLE_ROLES)[number]

const ELIGIBLE_SET = new Set<string>(NOTIFICATION_ELIGIBLE_ROLES)

export function normalizeNotificationRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase()
}

export function isNotificationEligibleRole(role: unknown): role is NotificationEligibleRole {
  return ELIGIBLE_SET.has(normalizeNotificationRole(role))
}
