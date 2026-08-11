'use client'
import { useEffect, useMemo, useRef } from 'react'
import { supabase } from './supabase'

export const REALTIME_REFRESH_VERSION = 'p3.0-unified-integration' as const

export type RealtimeTarget = { table:string; event?:'*'|'INSERT'|'UPDATE'|'DELETE'; filter?:string }
export type RealtimeState='SUBSCRIBED'|'TIMED_OUT'|'CLOSED'|'CHANNEL_ERROR'
type Target = RealtimeTarget
type Options = {
  refreshOnReconnect?: boolean
  refreshOnVisible?: boolean
  onStatus?: (status:RealtimeState)=>void
}

/**
 * Canonical realtime invalidation helper for RAOS.
 *
 * P3 additions on top of the P2 engine:
 * - dedupe identical table/event/filter targets;
 * - do not subscribe until identity/scope has resolved (`enabled`);
 * - refresh once after browser reconnect / tab becomes visible;
 * - keep the latest refresh callback without rebuilding the channel;
 * - clean every timer/listener/channel on unmount.
 */
export function useRealtimeRefresh(
  channelName:string,
  targets:Target[],
  refresh:()=>void|Promise<void>,
  debounceMs=250,
  enabled=true,
  options:Options={},
) {
  const refreshRef=useRef(refresh)
  const statusRef=useRef(options.onStatus)
  useEffect(()=>{refreshRef.current=refresh},[refresh])
  useEffect(()=>{statusRef.current=options.onStatus},[options.onStatus])

  const targetsInputKey=JSON.stringify(targets)
  const normalizedTargets=useMemo(()=>{
    const source=JSON.parse(targetsInputKey) as Target[]
    const seen=new Set<string>()
    const out:Target[]=[]
    for(const t of source){
      const key=`${t.table}|${t.event ?? '*'}|${t.filter ?? ''}`
      if(!t.table || seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
    return out
  },[targetsInputKey])
  const targetsKey=JSON.stringify(normalizedTargets)
  const refreshOnReconnect=options.refreshOnReconnect !== false
  const refreshOnVisible=options.refreshOnVisible !== false

  useEffect(()=>{
    if(!enabled || !channelName || normalizedTargets.length===0) return

    let timer:ReturnType<typeof setTimeout>|null=null
    let disposed=false
    const fire=()=>{
      if(disposed) return
      if(timer) clearTimeout(timer)
      timer=setTimeout(()=>{
        if(!disposed) void refreshRef.current()
      },Math.max(0,debounceMs))
    }

    let ch=supabase.channel(channelName)
    for(const t of normalizedTargets){
      ch=ch.on(
        'postgres_changes',
        {schema:'public',table:t.table,event:t.event ?? '*',...(t.filter?{filter:t.filter}:{})} as any,
        fire,
      )
    }
    ch.subscribe(status=>{
      if(status==='SUBSCRIBED'||status==='TIMED_OUT'||status==='CLOSED'||status==='CHANNEL_ERROR') statusRef.current?.(status)
      if(status==='CHANNEL_ERROR' || status==='TIMED_OUT') return
    })

    const onOnline=()=>{ if(refreshOnReconnect) fire() }
    const onVisible=()=>{
      if(refreshOnVisible && typeof document!=='undefined' && document.visibilityState==='visible') fire()
    }
    if(typeof window!=='undefined') window.addEventListener('online',onOnline)
    if(typeof document!=='undefined') document.addEventListener('visibilitychange',onVisible)

    return ()=>{
      disposed=true
      if(timer) clearTimeout(timer)
      if(typeof window!=='undefined') window.removeEventListener('online',onOnline)
      if(typeof document!=='undefined') document.removeEventListener('visibilitychange',onVisible)
      void supabase.removeChannel(ch)
    }
  },[channelName,debounceMs,enabled,targetsKey,refreshOnReconnect,refreshOnVisible]) // eslint-disable-line react-hooks/exhaustive-deps
}
