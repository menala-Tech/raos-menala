'use client'

import { useEffect, useRef } from 'react'
import { createNativePushHealer } from './nativePushLifecycle'
import { subscribeNativePush } from './nativePush'
import { supabase } from './supabase'

/**
 * Auto-register FCM token on Capacitor Android when permission is already granted.
 * Mirrors the web auto-heal pattern but uses the native token path.
 * No-ops on browser (not a native platform).
 *
 * Retries when the user signs in, so the first AppShell mount (which often
 * happens before auth is ready) does not permanently miss the registration.
 */
export function useNativePushSubscribe(): void {
  const runningRef = useRef(false)

  useEffect(() => {
    const { heal, unsubscribe } = createNativePushHealer({
      runningRef,
      subscribeNativePush,
      supabaseClient: supabase,
      storage: typeof sessionStorage !== 'undefined' ? sessionStorage : undefined,
    })

    // First mount: attempt immediately in case session already exists.
    void heal()

    return unsubscribe
  }, [])
}
