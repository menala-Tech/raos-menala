import { supabase } from './supabase'
import { runtimeMessage } from './runtimeError'

export const PROFILE_PREFERENCES_VERSION='p4.0-security-operational' as const

export type NotificationPrefs=Record<string,boolean>

/**
 * Update only the authenticated user's notification preference JSON through a
 * whitelisted SECURITY DEFINER RPC. The browser never performs a broad
 * user_profiles UPDATE, so role/branch/gaji/identity fields cannot be changed
 * through the Settings screen.
 */
export async function updateMyNotificationPrefs(prefs:NotificationPrefs):Promise<{ok:boolean;error?:string}>{
  const {error}=await supabase.rpc('raos_update_my_notification_prefs',{p_prefs:prefs})
  if(error){
    console.error('[profilePreferences] update notification prefs failed',error)
    return {ok:false,error:runtimeMessage(error,'Preferensi notifikasi belum tersimpan. Coba lagi.')}
  }
  return {ok:true}
}
