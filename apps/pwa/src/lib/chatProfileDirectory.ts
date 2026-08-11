import { supabase } from './supabase'
import { runtimeMessage } from './runtimeError'

export const CHAT_PROFILE_DIRECTORY_VERSION='p3.1-reaudit-fix' as const

export type SafeProfileLabel={
  user_id:string
  full_name:string
  role:string
  staff_id:string|null
  branch_id:string|null
  avatar_url:string|null
  joined_at?:string|null
}

export async function loadChatDirectory(roomId:string):Promise<SafeProfileLabel[]>{
  const {data,error}=await supabase.rpc('raos_chat_directory',{p_room_id:roomId})
  if(error)throw new Error(runtimeMessage(error,'Daftar anggota chat tidak dapat dimuat.'))
  return (data??[]) as SafeProfileLabel[]
}

export async function loadProfileLabels(userIds:Array<string|null|undefined>):Promise<SafeProfileLabel[]>{
  const ids=[...new Set(userIds.filter((x):x is string=>!!x))]
  if(ids.length===0)return []
  const {data,error}=await supabase.rpc('raos_profile_labels',{p_user_ids:ids})
  if(error)throw new Error(runtimeMessage(error,'Nama pengguna tidak dapat dimuat.'))
  return (data??[]) as SafeProfileLabel[]
}

export async function enrichChatMessages<T extends {sender_id?:string|null}>(roomId:string,rows:T[]){
  const directory=await loadChatDirectory(roomId)
  const byId=new Map(directory.map(p=>[p.user_id,p]))
  return rows.map(row=>{
    const p=row.sender_id?byId.get(row.sender_id):undefined
    return {
      ...row,
      user_profiles:p?{full_name:p.full_name,role:p.role,staff_id:p.staff_id,avatar_url:p.avatar_url}:null,
    }
  })
}
