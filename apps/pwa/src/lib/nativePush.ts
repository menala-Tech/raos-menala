'use client'

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'
import { createNativePushSubscriber, removeFcmToken as removeFcmTokenLifecycle } from './nativePushLifecycle'
import { isNotificationEligibleRole } from './notificationPolicy'

/**
 * Request permission and register for FCM on Android native shell.
 * Safe to call repeatedly: upsert is idempotent and listeners are reset.
 */
export const subscribeNativePush = createNativePushSubscriber({
  supabaseClient: supabase,
  pushNotifications: PushNotifications,
  isNativePlatform: () => Capacitor.isNativePlatform(),
  getUserAgent: () => (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
  isNotificationEligibleRole,
})

export async function removeFcmToken(token: string): Promise<void> {
  await removeFcmTokenLifecycle({ supabaseClient: supabase, token })
}
