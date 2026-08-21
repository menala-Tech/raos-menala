'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'

export interface RaosCameraBridge {
  getCameraPermissionStatus(): Promise<{ status: 'granted' | 'prompt' | 'denied' }>
  requestCameraPermission(): Promise<{ status: 'granted' | 'denied' | 'prompt' }>
  openAppSettings(): Promise<void>
}

const RaosCameraBridge = registerPlugin<RaosCameraBridge>('RaosCameraBridge', {
  web: () => ({
    getCameraPermissionStatus: async () => ({ status: 'granted' as const }),
    requestCameraPermission: async () => ({ status: 'granted' as const }),
    openAppSettings: async () => undefined,
  }),
})

export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export async function getCameraPermissionStatus(): Promise<{ status: 'granted' | 'prompt' | 'denied' }> {
  if (!isNativeAndroid()) return { status: 'granted' }
  return RaosCameraBridge.getCameraPermissionStatus()
}

export async function requestCameraPermission(): Promise<{ status: 'granted' | 'denied' | 'prompt' }> {
  if (!isNativeAndroid()) return { status: 'granted' }
  return RaosCameraBridge.requestCameraPermission()
}

export async function openAppSettings(): Promise<void> {
  if (!isNativeAndroid()) return
  await RaosCameraBridge.openAppSettings()
}
