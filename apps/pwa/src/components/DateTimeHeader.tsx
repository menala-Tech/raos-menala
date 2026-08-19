'use client'
import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, Clock } from 'lucide-react'
import { normalizeBranchTimeZone } from '@/lib/branchTime'
import { supabase } from '@/lib/supabase'

function useNow(){const [now,setNow]=useState(()=>new Date());useEffect(()=>{const id=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(id)},[]);return now}

function useResolvedTimeZone(timeZone?:string|null){
  const [resolved,setResolved]=useState<string|null|undefined>(timeZone)
  useEffect(()=>{
    let active=true
    if(timeZone){setResolved(timeZone);return()=>{active=false}}
    supabase.auth.getSession().then(async({data:{session}})=>{
      if(!active||!session)return
      const {data}=await supabase.from('user_profiles').select('branches(timezone)').eq('id',session.user.id).maybeSingle()
      if(!active)return
      const branch=(data as any)?.branches
      const zone=Array.isArray(branch)?branch[0]?.timezone:branch?.timezone
      if(zone)setResolved(zone)
    })
    return()=>{active=false}
  },[timeZone])
  return resolved
}

export function DateTimeStack({timeZone}:{timeZone?:string|null}){
  const now=useNow(), resolved=useResolvedTimeZone(timeZone), z=normalizeBranchTimeZone(resolved)
  const dateStr=now.toLocaleDateString('id-ID',{timeZone:z.timeZone,weekday:'short',day:'numeric',month:'short'})
  const timeStr=now.toLocaleTimeString('id-ID',{timeZone:z.timeZone,hour:'2-digit',minute:'2-digit'}).replace(':','.')
  return <div className="bg-white/10 border border-white/10 rounded-xl px-2.5 py-1.5 flex-shrink-0 text-right tabular-nums">
    <p className="text-[10px] text-white/70 font-medium leading-tight">{dateStr}</p>
    <p className="text-sm text-primary font-black leading-tight mt-0.5">{timeStr}</p>
    <p className="text-[8px] text-white/40 leading-none">{z.zoneLabel}</p>
  </div>
}
export default function DateTimeHeader({compact=false,timeZone}:{compact?:boolean;timeZone?:string|null}){
 const now=useNow(),resolved=useResolvedTimeZone(timeZone),z=normalizeBranchTimeZone(resolved)
 const d=now.toLocaleDateString('id-ID',{timeZone:z.timeZone,weekday:'short',day:'numeric',month:'short',year:'numeric'})
 const t=now.toLocaleTimeString('id-ID',{timeZone:z.timeZone,hour:'2-digit',minute:'2-digit'}).replace(':','.')
 return <div className={'inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 '+(compact?'px-2.5 py-1 text-[10px]':'px-3 py-1.5 text-[11px]')+' text-white/80 font-medium tabular-nums'}>
  <CalendarIcon size={compact?11:12} className="text-primary flex-shrink-0"/><span>{d}</span><span className="text-white/30">•</span><Clock size={compact?11:12} className="text-primary flex-shrink-0"/><span>{t} {z.zoneLabel}</span>
 </div>
}
