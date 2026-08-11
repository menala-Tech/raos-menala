import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const ALLOWED = (Deno.env.get('RAOS_ALLOWED_ORIGINS') || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)

function resolveAdminKey(): string {
  // New Supabase API-key model first; legacy service_role remains a
  // zero-downtime fallback until the project finishes key migration.
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      const key = parsed.default || Object.values(parsed)[0]
      if (key) return key
    } catch {
      // Fall through to legacy compatibility variable.
    }
  }
  const singleSecret = Deno.env.get('SUPABASE_SECRET_KEY')
  if (singleSecret) return singleSecret
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
}

function cors(origin: string | null) {
  const allowedOrigin = origin && ALLOWED.includes(origin)
    ? origin
    : (ALLOWED[0] || 'null')
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = cors(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') {
    return Response.json({ ok: false, reason: 'method_not_allowed' }, { status: 405, headers })
  }
  if (!SUPABASE_URL || !ALLOWED.length) {
    return Response.json({ ok: false, reason: 'server_not_configured' }, { status: 503, headers })
  }
  if (origin && !ALLOWED.includes(origin)) {
    return Response.json({ ok: false, reason: 'origin_not_allowed' }, { status: 403, headers })
  }

  const adminKey = resolveAdminKey()
  if (!adminKey) {
    return Response.json({ ok: false, reason: 'server_not_configured' }, { status: 503, headers })
  }

  try {
    const body = await req.json()
    const login_id = String(body?.login_id || '').trim().slice(0, 160)
    const raos_pin = String(body?.raos_pin || '').trim().slice(0, 64)
    if (!login_id || !raos_pin) {
      return Response.json(
        { ok: false, reason: 'invalid_input', message: 'ID/email dan PIN RAOS wajib diisi.' },
        { status: 400, headers },
      )
    }

    const admin = createClient(SUPABASE_URL, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data: verified, error: verifyError } = await admin.rpc('raos_verify_login_secret', {
      p_login_id: login_id,
      p_raos_pin: raos_pin,
    })
    if (verifyError || !verified?.ok || !verified?.email) {
      const status = verified?.reason === 'rate_limited' ? 429 : 401
      return Response.json(
        {
          ok: false,
          reason: verified?.reason || 'invalid_credentials',
          message: verified?.message || 'Login RAOS gagal.',
        },
        { status, headers },
      )
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: verified.email,
    })
    const tokenHash = link?.properties?.hashed_token
    if (linkError || !tokenHash) {
      return Response.json(
        { ok: false, reason: 'session_exchange_failed', message: 'Gagal membuat sesi RAOS.' },
        { status: 500, headers },
      )
    }

    return Response.json(
      {
        ok: true,
        token_hash: tokenHash,
        verification_type: 'email',
        role: verified.role,
        user_id: verified.user_id,
      },
      { headers },
    )
  } catch {
    return Response.json(
      { ok: false, reason: 'bad_request', message: 'Permintaan login tidak valid.' },
      { status: 400, headers },
    )
  }
})
