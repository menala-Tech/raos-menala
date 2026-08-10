import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const PORTAL_ROLES = new Set(['admin','direksi','direktur','management','koordinator'])

function allowedOrigin(origin: string | null) {
  if (!origin) return true
  try {
    const u = new URL(origin)
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') return false
    return u.hostname === 'rifim-os.vercel.app'
      || u.hostname === 'raos-menala.vercel.app'
      || u.hostname.endsWith('.vercel.app')
      || u.hostname === 'localhost'
      || u.hostname === '127.0.0.1'
  } catch { return false }
}

function cors(origin: string | null) {
  const value = origin && allowedOrigin(origin) ? origin : 'https://rifim-os.vercel.app'
  return {
    'Access-Control-Allow-Origin': value,
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
  if (req.method !== 'POST') return Response.json({ ok:false, reason:'method_not_allowed' }, { status:405, headers })
  if (!allowedOrigin(origin)) return Response.json({ ok:false, reason:'origin_not_allowed' }, { status:403, headers })
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ ok:false, reason:'server_not_configured' }, { status:503, headers })

  try {
    const body = await req.json()
    const login_id = String(body?.login_id || '').trim().slice(0,160)
    const raos_pin = String(body?.raos_pin || '').trim().slice(0,128)
    if (!login_id || !raos_pin) return Response.json({ ok:false, reason:'invalid_input', message:'ID/email dan PIN wajib diisi.' }, { status:400, headers })

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } })

    let verified: any = null
    const safe = await admin.rpc('raos_verify_login_secret', { p_login_id:login_id, p_raos_pin:raos_pin })
    if (!safe.error && safe.data?.ok && safe.data?.email) {
      verified = safe.data
    } else {
      const legacy = await admin.rpc('raos_verify_and_bridge', { p_login_id:login_id, p_raos_pin:raos_pin })
      if (!legacy.error && legacy.data?.ok && legacy.data?.email) {
        verified = legacy.data
      } else if (login_id.includes('@')) {
        // Compatibility fallback for active portal accounts that predate
        // raos_credentials. Verify the existing Supabase Auth password
        // server-side; never create or expose a new PIN.
        const authClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } })
        const signed = await authClient.auth.signInWithPassword({ email:login_id.toLowerCase(), password:raos_pin })
        const userId = signed.data?.user?.id
        if (signed.error || !userId) {
          return Response.json({ ok:false, reason:legacy.data?.reason || 'invalid_credentials', message:legacy.data?.message || 'ID/email atau PIN/password salah.' }, { status:401, headers })
        }
        const profile = await admin.from('user_profiles').select('id,email,role,is_active').eq('id',userId).maybeSingle()
        const role = String(profile.data?.role || '').toLowerCase()
        if (profile.error || !profile.data?.is_active || !PORTAL_ROLES.has(role)) {
          return Response.json({ ok:false, reason:'portal_access_denied', message:'Akun tidak aktif atau role tidak boleh mengakses Portal.' }, { status:403, headers })
        }
        verified = { ok:true, email:profile.data.email || login_id.toLowerCase(), role, user_id:userId }
      } else {
        return Response.json({ ok:false, reason:legacy.data?.reason || 'invalid_credentials', message:legacy.data?.message || 'ID/email atau PIN salah.' }, { status:401, headers })
      }
    }

    const { data:link, error:linkError } = await admin.auth.admin.generateLink({ type:'magiclink', email:verified.email })
    const tokenHash = link?.properties?.hashed_token
    if (linkError || !tokenHash) return Response.json({ ok:false, reason:'session_exchange_failed', message:'Gagal membuat sesi Portal.' }, { status:500, headers })

    return Response.json({ ok:true, token_hash:tokenHash, verification_type:'email', role:verified.role, user_id:verified.user_id }, { headers })
  } catch {
    return Response.json({ ok:false, reason:'bad_request', message:'Permintaan login tidak valid.' }, { status:400, headers })
  }
})
