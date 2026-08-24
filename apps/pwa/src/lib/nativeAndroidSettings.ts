'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'

export type NativePermissionStatus = 'granted' | 'denied' | 'prompt'

export interface AndroidPermissionSummary {
  camera: NativePermissionStatus
  microphone: NativePermissionStatus
  notifications: NativePermissionStatus
  chatChannelId: string
  operationalChannelId: string
  workReminderChannelId?: string
  callsChannelId: string
}

interface RaosAndroidSettingsBridge {
  getPermissionSummary(): Promise<AndroidPermissionSummary>
  requestNotificationPermission(): Promise<{ status: NativePermissionStatus }>
  openAppSettings(): Promise<void>
  openNotificationSettings(): Promise<void>
  openChatNotificationSettings(): Promise<void>
  openWorkReminderNotificationSettings(): Promise<void>
  openAlarmSettings(): Promise<void>
  openPictureInPictureSettings(): Promise<void>
}

const RaosAndroidSettingsBridge = registerPlugin<RaosAndroidSettingsBridge>('RaosAndroidSettingsBridge', {
  web: () => ({
    getPermissionSummary: async () => ({
      camera: 'granted' as const,
      microphone: 'granted' as const,
      notifications: typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'granted' as const : 'prompt' as const,
      chatChannelId: 'raos_chat',
      operationalChannelId: 'raos_operational',
      workReminderChannelId: 'raos_work_reminders',
      callsChannelId: 'raos_calls',
    }),
    requestNotificationPermission: async () => {
      if (typeof Notification === 'undefined' || !Notification.requestPermission) return { status: 'denied' as const }
      const result = await Notification.requestPermission()
      return { status: result === 'granted' ? 'granted' as const : 'denied' as const }
    },
    openAppSettings: async () => undefined,
    openNotificationSettings: async () => undefined,
    openChatNotificationSettings: async () => undefined,
    openWorkReminderNotificationSettings: async () => undefined,
    openAlarmSettings: async () => undefined,
    openPictureInPictureSettings: async () => undefined,
  }),
})

export const isNativeAndroidShell = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export async function getAndroidPermissionSummary(): Promise<AndroidPermissionSummary> {
  return RaosAndroidSettingsBridge.getPermissionSummary()
}

export async function requestAndroidNotificationPermission(): Promise<{ status: NativePermissionStatus }> {
  return RaosAndroidSettingsBridge.requestNotificationPermission()
}

export async function openAndroidAppSettings(): Promise<void> {
  if (!isNativeAndroidShell()) return
  await RaosAndroidSettingsBridge.openAppSettings()
}

export async function openAndroidNotificationSettings(): Promise<void> {
  if (!isNativeAndroidShell()) return
  await RaosAndroidSettingsBridge.openNotificationSettings()
}

export async function openAndroidChatNotificationSettings(): Promise<void> {
  if (!isNativeAndroidShell()) return
  await RaosAndroidSettingsBridge.openChatNotificationSettings()
}

export async function openAndroidWorkReminderNotificationSettings(): Promise<void> {
  if (!isNativeAndroidShell()) return
  await RaosAndroidSettingsBridge.openWorkReminderNotificationSettings()
}

export async function openAndroidAlarmSettings(): Promise<void> {
  if (!isNativeAndroidShell()) return
  await RaosAndroidSettingsBridge.openAlarmSettings()
}

export async function openAndroidPictureInPictureSettings(): Promise<void> {
  if (!isNativeAndroidShell()) return
  await RaosAndroidSettingsBridge.openPictureInPictureSettings()
}
