// FCM HTTP v1 dispatch helper for raos-send-push.
//
// Expects Deno env:
//   RAOS_FCM_PROJECT_ID
//   RAOS_FCM_CLIENT_EMAIL
//   RAOS_FCM_PRIVATE_KEY   (PEM PKCS#8)
//
// Never logs tokens, access keys, or credential material.

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FCM_SEND_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const GOOGLE_AUTH_AUDIENCE = 'https://oauth2.googleapis.com/token'

function getEnv(name: string): string | undefined {
  return Deno.env.get(name)
}

function stripPemHeader(pem: string): string {
  return pem
    .replace(/-----BEGIN (.*)-----/g, '')
    .replace(/-----END (.*)-----/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function pemToBuffer(pem: string): ArrayBuffer {
  const cleaned = stripPemHeader(pem)
  const binary = atob(cleaned)
  const buffer = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i)
  }
  return buffer
}

function stringToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

async function importServiceAccountPrivateKey(pem: string): Promise<CryptoKey> {
  const pkcs8 = pemToBuffer(pem)
  return await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
    false,
    ['sign'],
  )
}

async function signJwt(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const headerB64 = base64UrlEncode(stringToBuffer(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(stringToBuffer(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`
  const key = await importServiceAccountPrivateKey(privateKeyPem)
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    stringToBuffer(signingInput),
  ))
  const signatureB64 = base64UrlEncode(signature)
  return `${signingInput}.${signatureB64}`
}

export async function getFcmAccessToken(): Promise<{ ok: true; token: string } | { ok: false; reason: string }> {
  const projectId = getEnv('RAOS_FCM_PROJECT_ID')
  const clientEmail = getEnv('RAOS_FCM_CLIENT_EMAIL')
  const privateKey = getEnv('RAOS_FCM_PRIVATE_KEY')

  if (!projectId || !clientEmail || !privateKey) {
    return { ok: false, reason: 'fcm_not_configured' }
  }

  const now = Math.floor(Date.now() / 1000)
  const jwt = await signJwt({
    iss: clientEmail,
    sub: clientEmail,
    scope: FCM_SEND_SCOPE,
    aud: GOOGLE_AUTH_AUDIENCE,
    iat: now,
    exp: now + 3600,
  }, privateKey)

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  })

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    return { ok: false, reason: `fcm_auth_error: ${res.status}` }
  }

  const data = await res.json() as { access_token?: string }
  if (!data.access_token) {
    return { ok: false, reason: 'fcm_auth_no_token' }
  }

  return { ok: true, token: data.access_token }
}

type FcmErrorDetail = {
  '@type'?: string
  errorCode?: string
}

type GoogleApiError = {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: FcmErrorDetail[]
  }
}

function isTokenInvalidatingFcmError(detail: FcmErrorDetail): boolean {
  if (detail['@type'] !== 'type.googleapis.com/google.firebase.fcm.v1.FcmError') return false
  const code = detail.errorCode
  if (code === 'UNREGISTERED') return true
  if (code === 'SENDER_ID_MISMATCH') return true
  return false
}

/**
 * Classify an FCM HTTP v1 send response.
 *
 * Permanent token invalidation is conservative:
 *   - UNREGISTERED or SENDER_ID_MISMATCH FcmError detail => token is dead.
 *   - NOT_FOUND or INVALID_ARGUMENT is only token-fatal if an FcmError detail
 *     explicitly marks the token as the problem.
 *   - All 5xx, auth, quota, network, payload, and transient errors keep the
 *     subscription so it can be retried later.
 */
export function classifyFcmError(status: number, json: GoogleApiError | null): { invalid: boolean; reason: string } {
  if (!json?.error) {
    return { invalid: false, reason: `fcm_http_${status}` }
  }

  const err = json.error
  const details = err.details ?? []
  const fcmDetails = details.filter(isTokenInvalidatingFcmError)
  const statusName = err.status ?? String(status)
  const message = err.message ?? ''

  // Conservative permanent-token cases.
  const hasUnregistered = fcmDetails.some((d) => d.errorCode === 'UNREGISTERED')
  const hasSenderIdMismatch = fcmDetails.some((d) => d.errorCode === 'SENDER_ID_MISMATCH')

  if (hasUnregistered || hasSenderIdMismatch) {
    return { invalid: true, reason: `fcm_invalid_token: ${fcmDetails.map((d) => d.errorCode).join(',')}` }
  }

  // NOT_FOUND with token-specific evidence (e.g., FcmError UNREGISTERED already
  // handled above) or a message that clearly refers to the registration token.
  if (statusName === 'NOT_FOUND' && /registration token/i.test(message)) {
    return { invalid: true, reason: 'fcm_invalid_token: NOT_FOUND (registration token)' }
  }

  // INVALID_ARGUMENT is only token-fatal if the FCM detail points at the token
  // or the message explicitly says the registration token is invalid.
  if (statusName === 'INVALID_ARGUMENT') {
    if (/registration token/i.test(message) && /invalid/i.test(message)) {
      return { invalid: true, reason: 'fcm_invalid_token: INVALID_ARGUMENT (registration token)' }
    }
    return { invalid: false, reason: `fcm_send_failed: INVALID_ARGUMENT ${message}` }
  }

  // Everything else (UNAVAILABLE, INTERNAL, RESOURCE_EXHAUSTED, QUOTA_EXCEEDED,
  // UNAUTHENTICATED, PERMISSION_DENIED, 5xx, etc.) is transient/config.
  return { invalid: false, reason: `fcm_send_failed: ${statusName} ${message}` }
}

export type FcmSendResult =
  | { ok: true }
  | { ok: false; invalid: true; reason: string }
  | { ok: false; invalid: false; reason: string }

export async function sendFcm(
  projectId: string,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  channelId = 'raos_chat',
): Promise<FcmSendResult> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

  const payload = {
    message: {
      token,
      notification: {
        title,
        body,
      },
      data,
      android: {
        notification: {
          channelId,
        },
      },
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (res.ok) {
    return { ok: true }
  }

  let json: GoogleApiError | null = null
  try {
    json = await res.json() as GoogleApiError
  } catch {
    // Keep json as null; classifyFcmError will treat it as a non-JSON failure.
  }

  const classification = classifyFcmError(res.status, json)

  if (classification.invalid) {
    return { ok: false, invalid: true, reason: classification.reason }
  }

  return { ok: false, invalid: false, reason: classification.reason }
}
