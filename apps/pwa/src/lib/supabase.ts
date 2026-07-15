import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, branches(*)')
    .eq('id', user.id)
    .single()
  return profile
}

export async function logActivity(
  userId: string,
  action: string,
  detail?: string
) {
  await supabase.from('activity_logs').insert({
    user_id: userId,
    action,
    detail,
  })
}
