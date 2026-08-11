'use client'
import { useCachedQuery } from './apiCache'
import { supabase } from './supabase'
import { useRealtimeRefresh } from './useRealtimeRefresh'

export function useSystemConfigNumber(key:string, fallback:number){
  const q=useCachedQuery<number>(['system-config',key],async()=>{
    const {data,error}=await supabase.from('system_config').select('value').eq('key',key).maybeSingle()
    if(error) throw error
    const n=Number(data?.value)
    return Number.isFinite(n)?n:fallback
  },{ttlMs:10*60*1000})
  useRealtimeRefresh(`system-config-${key}`,[{table:'system_config',event:'UPDATE',filter:`key=eq.${key}`}],q.refresh,250)
  return {value:q.data ?? fallback,...q}
}
