import { createClient } from '@supabase/supabase-js'

// SERVER-ONLY — jangan pernah import file ini dari komponen 'use client'.
// Service role key bypass semua RLS, hanya boleh dipakai di Route Handler
// (app/api/**/route.ts) setelah verifikasi role caller secara eksplisit.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function getSupabaseAdmin() {
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY belum diset di .env.local / Vercel env vars. ' +
      'Ambil dari Supabase Dashboard -> Settings -> API -> service_role (rahasia, JANGAN commit).'
    )
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
