'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  clearOfflineReadScope,
  installOfflineReadCache,
  setOfflineReadScope,
} from '@/lib/offlineReadCache'

export default function OfflineReadCacheBootstrap(){
  useEffect(()=>{
    installOfflineReadCache()
    let cancelled=false
    let profileChannel:ReturnType<typeof supabase.channel>|null=null
    let activeUserId:string|null=null

    const removeProfileChannel=()=>{
      if(profileChannel){supabase.removeChannel(profileChannel);profileChannel=null}
    }

    const resolveScope=async(userId:string)=>{
      const {data,error}=await supabase.from('user_profiles')
        .select('id,role,branch_id,updated_at').eq('id',userId).maybeSingle()
      if(cancelled||error||!data)return
      await setOfflineReadScope({
        userId,
        role:data.role??'unknown',
        branchId:data.branch_id??null,
        profileVersion:data.updated_at??'unknown',
      })
    }

    const bindUser=async(userId:string|null)=>{
      removeProfileChannel()
      if(activeUserId&&activeUserId!==userId)await clearOfflineReadScope(activeUserId)
      activeUserId=userId
      if(!userId)return
      await resolveScope(userId)
      if(cancelled)return
      profileChannel=supabase.channel(`offline-read-scope-${userId}`)
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'user_profiles',filter:`id=eq.${userId}`},()=>{void resolveScope(userId)})
        .subscribe()
    }

    void supabase.auth.getSession().then(({data:{session}})=>bindUser(session?.user.id??null))
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT')void bindUser(null)
      else if(session?.user.id)void bindUser(session.user.id)
    })
    const refresh=()=>{if(activeUserId)void resolveScope(activeUserId)}
    window.addEventListener('online',refresh)
    document.addEventListener('visibilitychange',refresh)

    return()=>{
      cancelled=true
      subscription.unsubscribe()
      removeProfileChannel()
      window.removeEventListener('online',refresh)
      document.removeEventListener('visibilitychange',refresh)
    }
  },[])
  return null
}
