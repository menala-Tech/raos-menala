'use client'
import { useEffect } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from './supabase'

/**
 * A7 — thin web-side wrapper around the native RaosLocationBridge
 * Capacitor plugin (android/app/src/main/java/com/rifim/raos/location/
 * RaosLocationBridgePlugin.kt). No-ops everywhere when running as the
 * regular browser PWA (Capacitor.isNativePlatform() === false) — this file
 * changes nothing about the existing web experience.
 *
 * A5 auth bridge: subscribes to the same `supabase.auth.onAuthStateChange`
 * the rest of the app already uses, and forwards the session to the native
 * layer only when running inside the Android shell. The native side never
 * gets its own credential — this is the "smallest safe bridge between web
 * session and native service" the task asked for.
 */
export interface RaosLocationBridgePlugin {
  setSessionToken(opts: {
    supabaseUrl: string
    publicKey: string
    accessToken: string
    userId: string
    branchId?: string | null
    expiresAtEpochSeconds: number
  }): Promise<void>
  clearSessionToken(): Promise<void>
  requestLocationPermissions(): Promise<{ granted: boolean; reason?: string }>
  startBackgroundTracking(opts: { userId: string; branchId?: string | null }): Promise<{ tracking: boolean }>
  stopBackgroundTracking(): Promise<{ tracking: boolean }>
  getBackgroundTrackingStatus(): Promise<{
    tracking: boolean
    hasValidSession: boolean
    hasRequiredPermissions: boolean
    queuedPointCount: number
  }>
}

const RaosLocationBridge = registerPlugin<RaosLocationBridgePlugin>('RaosLocationBridge')

export const isNativeAndroidShell = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

/**
 * Call once near app root (or lazily from Settings, per A7 "minimal UI
 * integration") — safe to call multiple times, no-ops on web.
 */
export function installNativeLocationAuthBridge() {
  if (!isNativeAndroidShell()) return () => {}

  const push = async (session: { access_token: string; user: { id: string }; expires_at?: number } | null) => {
    if (!session) {
      await RaosLocationBridge.clearSessionToken()
      return
    }
    await RaosLocationBridge.setSessionToken({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      publicKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      accessToken: session.access_token,
      userId: session.user.id,
      expiresAtEpochSeconds: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    })
  }

  supabase.auth.getSession().then(({ data }) => void push(data.session as any))
  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { void RaosLocationBridge.clearSessionToken(); return }
    void push(session as any)
  })
  return () => sub.subscription.unsubscribe()
}

/** A7 web-callable surface — call from a Settings/operational screen action, not automatically. */
export async function requestLocationPermissions() {
  if (!isNativeAndroidShell()) return { granted: false, reason: 'not_native' }
  return RaosLocationBridge.requestLocationPermissions()
}

export async function startBackgroundTracking(userId: string, branchId?: string | null) {
  if (!isNativeAndroidShell()) return { tracking: false }
  return RaosLocationBridge.startBackgroundTracking({ userId, branchId })
}

export async function stopBackgroundTracking() {
  if (!isNativeAndroidShell()) return { tracking: false }
  return RaosLocationBridge.stopBackgroundTracking()
}

export async function getBackgroundTrackingStatus() {
  if (!isNativeAndroidShell()) return null
  return RaosLocationBridge.getBackgroundTrackingStatus()
}

/** Mount once at app root (AppShell) — mirrors the useAutoPushSubscribe() pattern. No-ops on web. */
export function useNativeLocationAuthBridge() {
  useEffect(() => installNativeLocationAuthBridge(), [])
}

/** A8 — call from the existing logout handlers (settings/page.tsx, driver-workspace/page.tsx). */
export async function stopTrackingOnLogout() {
  if (!isNativeAndroidShell()) return
  await stopBackgroundTracking()
  await RaosLocationBridge.clearSessionToken()
}
