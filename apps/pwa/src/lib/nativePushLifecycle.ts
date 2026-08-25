// Pure, environment-agnostic native FCM lifecycle logic.
//
// The runtime wrappers in nativePush.ts and useNativePushSubscribe.ts inject
// the platform-specific dependencies (Capacitor, PushNotifications, Supabase).
// This keeps the lifecycle testable in Node/Deno without loading native modules.

const NATIVE_HEAL_TS_KEY = 'raos_native_push_heal_v2'
const NATIVE_HEAL_MIN_INTERVAL_MS = 5 * 60 * 1000

// Storage-like interface so tests can inject an in-memory store.
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } | null } | null } }>
    onAuthStateChange(cb: (event: string, session: unknown) => void): {
      data?: { subscription?: { unsubscribe(): void } } | undefined
    }
  }
  from(table: string): any
}

export interface PushNotificationsLike {
  requestPermissions(): Promise<{ receive?: string }>
  removeAllListeners(): Promise<void>
  addListener(event: 'registration', cb: (payload: { value: string }) => void): void
  addListener(event: 'registrationError', cb: (error: unknown) => void): void
  register(): Promise<void>
}

export interface NativePushHealerDeps {
  runningRef: { current: boolean }
  subscribeNativePush(): Promise<{ ok: boolean; reason?: string }>
  supabaseClient: SupabaseLike
  storage?: StorageLike
}

export interface NativePushSubscriberDeps {
  supabaseClient: SupabaseLike
  pushNotifications: PushNotificationsLike
  isNativePlatform(): boolean
  getUserAgent(): string
  isNotificationEligibleRole(role: unknown): boolean
}

export function createNativePushHealer(deps: NativePushHealerDeps) {
  const { runningRef, subscribeNativePush, supabaseClient, storage } = deps

  function recentlyHealed(): boolean {
    try {
      const ts = Number(storage?.getItem(NATIVE_HEAL_TS_KEY) ?? '0')
      return Number.isFinite(ts) && ts > 0 && Date.now() - ts < NATIVE_HEAL_MIN_INTERVAL_MS
    } catch {
      return false
    }
  }

  function markHealAttempt(): void {
    try { storage?.setItem(NATIVE_HEAL_TS_KEY, String(Date.now())) } catch {}
  }

  const heal = async (force = false) => {
    if (runningRef.current) return
    if (!force && recentlyHealed()) return

    runningRef.current = true
    try {
      const result = await subscribeNativePush()
      // Throttle only stable outcomes. 'not_authenticated' is transient and
      // must allow a retry once the session arrives.
      if (result.ok || result.reason === 'not_eligible' || result.reason === 'permission_denied') {
        markHealAttempt()
      }
    } finally {
      runningRef.current = false
    }
  }

  const auth = supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      // Use heal(false): the first SIGNED_IN after not_authenticated must run
      // because no success throttle has been recorded yet. After a successful
      // registration the throttle timestamp prevents unnecessary re-registration.
      void heal(false)
    }
  })

  return { heal, unsubscribe: () => auth?.data?.subscription?.unsubscribe() }
}

async function currentUserMayReceivePush(
  supabaseClient: SupabaseLike,
  userId: string,
  isNotificationEligibleRole: (role: unknown) => boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const { data: profile, error } = await supabaseClient
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', userId)
    .single()

  if (error || !profile) return { ok: false, reason: 'profile_not_found' }
  if (profile.is_active !== true || !isNotificationEligibleRole(profile.role)) {
    return { ok: false, reason: 'role_not_eligible' }
  }
  return { ok: true }
}

async function persistFcmToken({
  supabaseClient,
  token,
  userAgent,
  userId,
}: {
  supabaseClient: SupabaseLike
  token: string
  userAgent: string
  userId: string
}): Promise<void> {
  if (!token) return

  const { error } = await supabaseClient.from('push_subscriptions').upsert({
    user_id: userId,
    platform: 'fcm',
    token,
    user_agent: userAgent,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'token' })

  if (error) {
    // Do not print the token or any error detail that could include it.
    console.warn('[nativePush] FCM upsert failed')
  }
}

export function createNativePushSubscriber(deps: NativePushSubscriberDeps) {
  const { supabaseClient, pushNotifications, isNativePlatform, getUserAgent, isNotificationEligibleRole } = deps

  return async function subscribeNativePush(): Promise<{ ok: boolean; reason?: string }> {
    if (!isNativePlatform()) return { ok: false, reason: 'not_native' }

    const { data: { session } } = await supabaseClient.auth.getSession()
    const user = session?.user
    if (!user) return { ok: false, reason: 'not_authenticated' }

    const eligibility = await currentUserMayReceivePush(supabaseClient, user.id, isNotificationEligibleRole)
    if (!eligibility.ok) return { ok: false, reason: eligibility.reason ?? 'not_eligible' }

    const perm = await pushNotifications.requestPermissions()
    if (perm.receive !== 'granted') {
      return { ok: false, reason: 'permission_denied' }
    }

    try {
      await pushNotifications.removeAllListeners()

      pushNotifications.addListener('registration', async ({ value }) => {
        await persistFcmToken({
          supabaseClient,
          token: value,
          userAgent: getUserAgent(),
          userId: user.id,
        })
      })

      pushNotifications.addListener('registrationError', async () => {
        // Fixed message only. Do not log the plugin error object because it
        // may contain the registration token or other sensitive data.
        console.warn('[nativePush] FCM registration error')
      })

      await pushNotifications.register()
      return { ok: true }
    } catch (e: any) {
      // Do not log the exception object or message. It could include tokens.
      console.warn('[nativePush] FCM register exception')
      return { ok: false, reason: 'register_failed' }
    }
  }
}

export async function removeFcmToken({
  supabaseClient,
  token,
}: {
  supabaseClient: SupabaseLike
  token: string
}): Promise<void> {
  if (!token) return
  const { data: { session } } = await supabaseClient.auth.getSession()
  if (!session?.user) return
  await supabaseClient.from('push_subscriptions').delete()
    .eq('token', token)
    .eq('user_id', session.user.id)
}
