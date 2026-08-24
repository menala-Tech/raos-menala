'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'

export interface NativeWorkReminderPlan {
  reminderKey: string
  userId: string
  branchId: string
  shiftCode: string
  shiftLabel: string
  workDate: string
  shiftStartAt: string
  reminderAt: string
  reminderAtEpochMs: number
  route: string
  title: string
  body: string
}

interface RaosWorkReminderBridge {
  syncWorkReminders(opts: {
    userId: string
    role: string
    plans: NativeWorkReminderPlan[]
  }): Promise<{ scheduled: number; accepted?: number; cancelled?: number; reason?: string }>
  cancelWorkReminder(opts: { key: string }): Promise<{ cancelled: boolean }>
  cancelAllWorkRemindersForCurrentUser(opts: { userId: string }): Promise<{ cancelled: number }>
  getWorkReminderStatus(opts?: { userId?: string }): Promise<{ scheduled: number; currentUserId?: string | null }>
}

const RaosWorkReminderBridge = registerPlugin<RaosWorkReminderBridge>('RaosWorkReminderBridge', {
  web: () => ({
    syncWorkReminders: async () => ({ scheduled: 0, reason: 'not_native' }),
    cancelWorkReminder: async () => ({ cancelled: false }),
    cancelAllWorkRemindersForCurrentUser: async () => ({ cancelled: 0 }),
    getWorkReminderStatus: async () => ({ scheduled: 0, currentUserId: null }),
  }),
})

export const isNativeAndroidShell = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export async function syncNativeWorkReminders(userId: string, role: string, plans: NativeWorkReminderPlan[]) {
  if (!isNativeAndroidShell()) return { scheduled: 0, reason: 'not_native' }
  return RaosWorkReminderBridge.syncWorkReminders({ userId, role, plans })
}

export async function cancelNativeWorkReminder(key: string) {
  if (!isNativeAndroidShell()) return { cancelled: false }
  return RaosWorkReminderBridge.cancelWorkReminder({ key })
}

export async function cancelNativeWorkRemindersForUser(userId: string) {
  if (!isNativeAndroidShell()) return { cancelled: 0 }
  return RaosWorkReminderBridge.cancelAllWorkRemindersForCurrentUser({ userId })
}

export async function getNativeWorkReminderStatus(userId?: string) {
  if (!isNativeAndroidShell()) return { scheduled: 0, currentUserId: null }
  return RaosWorkReminderBridge.getWorkReminderStatus({ userId })
}
