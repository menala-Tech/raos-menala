// Pure notification state reducers for /notifications page and tests.
// No React, no side effects. Keeps local UI optimistic and predictable.

type NotificationBase = {
  id: string
  is_read: boolean
  status?: string
  read_at?: string | null
}

export function markNotificationRead<T extends NotificationBase>(
  items: T[],
  id: string,
  now: string,
): T[] {
  return items.map((n) =>
    n.id === id
      ? ({ ...n, is_read: true, status: 'read', read_at: now } as T)
      : n,
  )
}

export function archiveNotification<T extends NotificationBase>(items: T[], id: string): T[] {
  return items.map((n) => (n.id === id ? ({ ...n, status: 'archived' } as T) : n))
}

export function unarchiveNotification<T extends NotificationBase>(
  items: T[],
  id: string,
  now: string,
): T[] {
  return items.map((n) =>
    n.id === id
      ? ({ ...n, is_read: true, status: 'read', read_at: now } as T)
      : n,
  )
}

export function countUnread<T extends NotificationBase>(items: T[]): number {
  return items.filter((n) => !n.is_read && n.status !== 'archived').length
}

export function dashboardUnreadCacheKey(userId: string): (string | null)[] {
  return ['dashboard-unread-notif', userId]
}
