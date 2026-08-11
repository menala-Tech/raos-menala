'use client'
import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, Clock } from 'lucide-react'
import { normalizeBranchTimeZone } from '@/lib/branchTime'

function useNow(){const [now,setNow]=useState(()=>new Date());useEffect(()=>{const id=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(id)},[]);return now}

export function DateTimeStack({timeZone}:{timeZone?:string|null}){
  const now=useNow(), z=normalizeBranchTimeZone(timeZone)
  const dateStr=now.toLocaleDateString('id-ID',{timeZone:z.timeZone,weekday:'short',day:'numeric',month:'short'})
  const timeStr=now.toLocaleTimeString('id-ID',{timeZone:z.timeZone,hour:'2-digit',minute:'2-digit'}).replace(':','.')
  return <div className="bg-white/10 border border-white/10 rounded-xl px-2.5 py-1.5 flex-shrink-0 text-right tabular-nums">
    <p className="text-[10px] text-white/70 font-medium leading-tight">{dateStr}</p>
    <p className="text-sm text-primary font-black leading-tight mt-0.5">{timeStr}</p>
    <p className="text-[8px] text-white/40 leading-none">{z.zoneLabel}</p>
  </div>
}
export default function DateTimeHeader({compact=false,timeZone}:{compact?:boolean;timeZone?:string|null}){
 const now=useNow(),z=normalizeBranchTimeZone(timeZone)
 const d=now.toLocaleDateString('id-ID',{timeZone:z.timeZone,weekday:'short',day:'numeric',month:'short',year:'numeric'})
 const t=now.toLocaleTimeString('id-ID',{timeZone:z.timeZone,hour:'2-digit',minute:'2-digit'}).replace(':','.')
 return <div className={'inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 '+(compact?'px-2.5 py-1 text-[10px]':'px-3 py-1.5 text-[11px]')+' text-white/80 font-medium tabular-nums'}>
  <CalendarIcon size={compact?11:12} className="text-primary flex-shrink-0"/><span>{d}</span><span className="text-white/30">•</span><Clock size={compact?11:12} className="text-primary flex-shrink-0"/><span>{t} {z.zoneLabel}</span>
 </div>
}
