// RAOS Web Push dispatcher — Notification Engine V2.
//
// Production baseline imported from raos-send-push v8 on 2026-08-20, then
// hardened with fail-closed recipient-role targeting.
//
// Eligible recipients ONLY: staff, koordinator, admin, driver.
// Unknown/new roles are excluded by default. Category/master preferences and
// per-user sound/vibration remain enforced server-side.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { getFcmAccessToken, sendFcm, type FcmSendResult } from './fcm.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const VAPID_PUBLIC = Deno.env.get('RAOS_VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('RAOS_VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('RAOS_VAPID_SUBJECT') ?? 'mailto:rifiminternationalgemilang@gmail.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ELIGIBLE_RECIPIENT_ROLES = new Set(['staff', 'koordinator', 'admin', 'driver'])

const VALID_KATEGORI = new Set([
  'scan_berhasil',
  'scan_pending',
  'validasi_koordinator',
  'pengingat_absen',
  'pengumuman',
  'chat_room',
])

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function normalizedRole(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return json(401, { error: 'no_auth_header' })
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token || token === 'undefined' || token === 'null') {
    return json(401, { error: 'empty_or_invalid_token' })
  }

  const isServiceRole = token === SERVICE_KEY
  let callerId: string | null = null
  let callerRole: string | null = null

  if (!isServiceRole) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return json(401, { error: 'invalid_token', detail: userErr?.message ?? 'no user in JWT' })
    }
    callerId = user.id

    const { data: profile, error: profileErr } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profileErr || !profile) {
      return json(403, { error: 'profile_not_found', detail: profileErr?.message })
    }
    callerRole = normalizedRole(profile.role)
    if (!['admin', 'management', 'direksi'].includes(callerRole)) {
      return json(403, { error: 'role_not_allowed', role: callerRole })
    }
  }

  let requestBody: {
    user_ids?: string[]
    title?: string
    body?: string
    url?: string
    tag?: string
    kategori?: string
  }
  try {
    requestBody = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const { user_ids, title, body: msgBody, url, tag, kategori } = requestBody
  if (!Array.isArray(user_ids) || user_ids.length === 0) return json(400, { error: 'missing_user_ids' })
  if (!title || !msgBody) return json(400, { error: 'missing_title_or_body' })

  // Recipient role + preference evaluation is authoritative on the server.
  const { data: allProfiles, error: profileReadErr } = await adminClient
    .from('user_profiles')
    .select('id, role, is_active, notification_prefs')
    .in('id', user_ids)

  if (profileReadErr) return json(500, { error: 'profile_read_error', detail: profileReadErr.message })

  const prefsById = new Map<string, Record<string, unknown>>()
  const roleEligibleIds = new Set<string>()
  for (const profile of allProfiles ?? []) {
    prefsById.set(profile.id, (profile.notification_prefs ?? {}) as Record<string, unknown>)
    if (profile.is_active === true && ELIGIBLE_RECIPIENT_ROLES.has(normalizedRole(profile.role))) {
      roleEligibleIds.add(profile.id)
    }
  }

  const roleEligibleUserIds = user_ids.filter((id) => roleEligibleIds.has(id))
  const roleFilteredOut = user_ids.length - roleEligibleUserIds.length

  // Preserve existing category behavior: valid categories honor master + the
  // category switch. Calls without a category remain usable for explicit
  // admin test/system pushes, while role filtering is never bypassed.
  let effectiveUserIds = roleEligibleUserIds
  let preferenceFilteredOut = 0
  if (kategori && VALID_KATEGORI.has(kategori)) {
    const allowed = new Set<string>()
    for (const id of roleEligibleUserIds) {
      const np = prefsById.get(id) ?? {}
      const master = np.master !== false
      const categoryEnabled = np[kategori] !== false
      if (master && categoryEnabled) allowed.add(id)
    }
    effectiveUserIds = roleEligibleUserIds.filter((id) => allowed.has(id))
    preferenceFilteredOut = roleEligibleUserIds.length - effectiveUserIds.length
  }

  if (effectiveUserIds.length === 0) {
    return json(200, {
      sent: 0,
      failed: 0,
      total: 0,
      filtered_out: roleFilteredOut + preferenceFilteredOut,
      role_filtered_out: roleFilteredOut,
      preference_filtered_out: preferenceFilteredOut,
      note: roleEligibleUserIds.length === 0
        ? 'all_targets_ineligible_role_or_inactive'
        : 'all_targets_disabled_kategori_or_master',
      kategori: kategori ?? null,
      caller: isServiceRole ? 'service_role' : `${callerId} (${callerRole})`,
    })
  }

  const { data: subs, error: subErr } = await adminClient
    .from('push_subscriptions')
    .select('platform, token, endpoint, p256dh, auth, user_id')
    .in('user_id', effectiveUserIds)

  if (subErr) return json(500, { error: 'db_error', detail: subErr.message })
  if (!subs || subs.length === 0) {
    return json(200, {
      sent: 0,
      failed: 0,
      total: 0,
      filtered_out: roleFilteredOut + preferenceFilteredOut,
      role_filtered_out: roleFilteredOut,
      preference_filtered_out: preferenceFilteredOut,
      note: 'no_active_subscriptions',
      kategori: kategori ?? null,
      caller: isServiceRole ? 'service_role' : `${callerId} (${callerRole})`,
    })
  }

  const cleanTitle = String(title).slice(0, 100)
  const cleanBody = String(msgBody).slice(0, 300)
  const cleanUrl = url ?? '/dashboard'
  const cleanTag = tag ?? 'raos-notif'

  function buildPayload(np: Record<string, unknown> | undefined): string {
    const suara = np?.suara !== false
    const getaran = np?.getaran !== false
    return JSON.stringify({
      title: cleanTitle,
      body: cleanBody,
      url: cleanUrl,
      tag: cleanTag,
      silent: !suara,
      vibrate: getaran,
    })
  }

  let sent = 0
  let failed = 0
  const errors: Array<{ endpoint: string; status: number; msg: string }> = []

  const fcmSubs = subs.filter((s) => s.platform === 'fcm' && s.token)
  const webSubs = subs.filter((s) => s.platform !== 'fcm' || !s.token)

  // Hybrid dispatch: FCM via HTTP v1, Web Push via VAPID.
  const fcmAuth = fcmSubs.length > 0 ? await getFcmAccessToken() : null

  const fcmData: Record<string, string> = {
    url: cleanUrl,
    tag: cleanTag,
    type: kategori ?? 'raos-notif',
  }

  const fcmProjectId = Deno.env.get('RAOS_FCM_PROJECT_ID') ?? ''

  await Promise.all([
    ...webSubs.map(async (subscription) => {
      const payload = buildPayload(prefsById.get(subscription.user_id))
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        )
        sent++
      } catch (err: any) {
        failed++
        const status = err?.statusCode ?? 0
        errors.push({
          endpoint: subscription.endpoint.slice(0, 60) + '...',
          status,
          msg: String(err?.message ?? err).slice(0, 200),
        })
        if (status === 410 || status === 404) {
          await adminClient.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
        }
      }
    }),

    ...fcmSubs.map(async (subscription) => {
      if (!fcmAuth?.ok) {
        failed++
        errors.push({
          endpoint: 'fcm',
          status: fcmAuth?.reason === 'fcm_not_configured' ? 503 : 401,
          msg: `fcm dispatch skipped: ${fcmAuth?.reason ?? 'unknown'}`,
        })
        return
      }

      const result = await sendFcm(
        fcmProjectId,
        fcmAuth.token,
        subscription.token!,
        cleanTitle,
        cleanBody,
        fcmData,
        'raos_chat',
      )

      if (result.ok) {
        sent++
      } else {
        failed++
        const status = result.invalid ? 410 : 500
        errors.push({
          endpoint: 'fcm',
          status,
          msg: String(result.reason).slice(0, 200),
        })
        if (result.invalid) {
          await adminClient.from('push_subscriptions').delete().eq('token', subscription.token)
        }
      }
    }),
  ])

  return json(200, {
    sent,
    failed,
    total: subs.length,
    filtered_out: roleFilteredOut + preferenceFilteredOut,
    role_filtered_out: roleFilteredOut,
    preference_filtered_out: preferenceFilteredOut,
    kategori: kategori ?? null,
    caller: isServiceRole ? 'service_role' : `${callerId} (${callerRole})`,
    errors: errors.length > 0 ? errors : undefined,
  })
})
