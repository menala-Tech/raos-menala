'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'

export interface RaosMicrophoneBridge {
  getMicrophonePermissionStatus(): Promise<{ status: 'granted' | 'prompt' | 'denied' }>
  requestMicrophonePermission(): Promise<{ status: 'granted' | 'denied' | 'prompt' }>
  openAppSettings(): Promise<void>
}

const RaosMicrophoneBridge = registerPlugin<RaosMicrophoneBridge>('RaosMicrophoneBridge', {
  web: () => ({
    getMicrophonePermissionStatus: async () => ({ status: 'granted' as const }),
    requestMicrophonePermission: async () => ({ status: 'granted' as const }),
    openAppSettings: async () => undefined,
  }),
})

export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export async function getMicrophonePermissionStatus(): Promise<{ status: 'granted' | 'prompt' | 'denied' }> {
  if (!isNativeAndroid()) return { status: 'granted' }
  return RaosMicrophoneBridge.getMicrophonePermissionStatus()
}

export async function requestMicrophonePermission(): Promise<{ status: 'granted' | 'denied' | 'prompt' }> {
  if (!isNativeAndroid()) return { status: 'granted' }
  return RaosMicrophoneBridge.requestMicrophonePermission()
}

export async function openMicrophoneAppSettings(): Promise<void> {
  if (!isNativeAndroid()) return
  await RaosMicrophoneBridge.openAppSettings()
}
