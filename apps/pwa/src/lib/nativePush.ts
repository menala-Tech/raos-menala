'use client'

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'
import { isNotificationEligibleRole } from './notificationPolicy'

function isNativePushSupported(): boolean {
  return Capacitor.isNativePlatform()
}

async function currentUserMayReceivePush(): Promise<{
  ok: boolean
  userId?: string
  reason?: string
}> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { ok: false, reason: 'not_authenticated' }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', session.user.id)
    .single()

  if (error || !profile) return { ok: false, reason: 'profile_not_found' }
  if (profile.is_active !== true || !isNotificationEligibleRole(profile.role)) {
    return { ok: false, reason: 'role_not_eligible' }
  }

  return { ok: true, userId: session.user.id }
}

async function persistFcmToken(token: string): Promise<void> {
  if (!token) return
  const eligibility = await currentUserMayReceivePush()
  if (!eligibility.ok || !eligibility.userId) return

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: eligibility.userId,
    platform: 'fcm',
    token,
    user_agent: navigator.userAgent,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'token' })

  if (error) {
    // Do not print the token itself.
    console.warn('[nativePush] FCM upsert failed:', error.message)
  }
}

export async function removeFcmToken(token: string): Promise<void> {
  if (!token) return
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return
  await supabase.from('push_subscriptions').delete()
    .eq('token', token)
    .eq('user_id', session.user.id)
}

/**
 * Request permission and register for FCM on Android native shell.
 * Safe to call repeatedly: upsert is idempotent and listeners are reset.
 */
export async function subscribeNativePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isNativePushSupported()) return { ok: false, reason: 'not_native' }

  const eligibility = await currentUserMayReceivePush()
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason ?? 'not_eligible' }

  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') {
    return { ok: false, reason: 'permission_denied' }
  }

  try {
    await PushNotifications.removeAllListeners()

    PushNotifications.addListener('registration', async ({ value }) => {
      await persistFcmToken(value)
    })

    PushNotifications.addListener('registrationError', async (error) => {
      // Log the error object without exposing any token string.
      console.warn('[nativePush] FCM registration error:', error)
    })

    await PushNotifications.register()
    return { ok: true }
  } catch (e: any) {
    console.warn('[nativePush] register exception:', e?.message)
    return { ok: false, reason: e?.message ?? 'register_failed' }
  }
}
