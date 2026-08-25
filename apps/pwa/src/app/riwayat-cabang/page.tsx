'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { ArrowLeft, Search, ScanLine, UserCheck, Wallet, Users, Clock, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import { branchDateKey } from '@/lib/branchTime'
import { saldoInvoiceNominal } from '@/lib/saldoInvoice'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import type { UserProfile } from '@/types'

type Tab='semua'|'scan'|'absensi'|'saldo'|'antrian'
type StatusFilter='semua'|'valid'|'pending'|'rejected'
type Range='hari-ini'|'kemarin'|'7-hari'|'30-hari'

const RANGES:{key:Range;label:string}[]=[
  {key:'hari-ini',label:'Hari Ini'},{key:'kemarin',label:'Kemarin'},
  {key:'7-hari',label:'7 Hari'},{key:'30-hari',label:'30 Hari'},
]

function rangeDates(range:Range){
  const now=new Date(); const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()); let from=new Date(day); let to=new Date(now)
  if(range==='kemarin'){from=new Date(day.getTime()-86400000);to=day}
  if(range==='7-hari')from=new Date(day.getTime()-6*86400000)
  if(range==='30-hari')from=new Date(day.getTime()-29*86400000)
  return {from,to}
}
function zoneLabel(tz:string){return tz==='Asia/Makassar'||tz==='Asia/Kuching'?'WITA':tz==='Asia/Jayapura'?'WIT':'WIB'}
function staffOf(row:any){const p=row?.staff_profile;return Array.isArray(p)?p[0]?.full_name:p?.full_name}

export default function RiwayatCabangPage(){
  const router=useRouter()
  const [profile,setProfile]=useState<UserProfile|null>(null)
  const [tab,setTab]=useState<Tab>('semua')
  const [range,setRange]=useState<Range>('30-hari')
  const [status,setStatus]=useState<StatusFilter>('semua')
  const [search,setSearch]=useState('')
  const [scans,setScans]=useState<any[]>([])
  const [attendance,setAttendance]=useState<any[]>([])
  const [saldo,setSaldo]=useState<any[]>([])
  const [queue,setQueue]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [refresh,setRefresh]=useState(0)

  useEffect(()=>{(async()=>{
    const {data:{session}}=await supabase.auth.getSession(); if(!session){router.replace('/');return}
    const {data:p}=await supabase.from('user_profiles').select('*,branches(*)').eq('id',session.user.id).single()
    if(!p||!['koordinator','management','admin','direksi','direktur'].includes(String(p.role).toLowerCase())){router.replace('/riwayat');return}
    setProfile(p as UserProfile)
  })()},[router])

  useEffect(()=>{
    if(!profile)return
    let cancelled=false
    ;(async()=>{
      setLoading(true)
      const tz=(profile as any)?.branches?.timezone ?? 'Asia/Jakarta'
      const {from,to}=rangeDates(range); const fromIso=from.toISOString(),toIso=to.toISOString()
      const fromDate=branchDateKey(tz,from),toDate=branchDateKey(tz,to)
      const [s,a,r,q]=await Promise.all([
        supabase.from('scan_orders')
          .select('*,raos_drivers(name,driver_id,vehicle_plate,vehicle_type),pickup_points(name),staff_profile:user_profiles!scan_orders_staff_id_fkey(full_name,staff_id)')
          .gte('scanned_at',fromIso).lte('scanned_at',toIso).order('scanned_at',{ascending:false}).limit(500),
        supabase.from('raos_attendance')
          .select('*,shifts(name,start_time,end_time),pickup_points(name),staff_profile:user_profiles!raos_attendance_staff_id_fkey(full_name,staff_id)')
          .gte('date',fromDate).lte('date',toDate).order('date',{ascending:false}).limit(500),
        supabase.from('raos_saldo_requests')
          .select('id,request_no,nominal,status,is_processed,requested_at,driver_name,rejection_reason,staff_profile:user_profiles!raos_saldo_requests_staff_id_fkey(full_name,staff_id)')
          .gte('requested_at',fromIso).lte('requested_at',toIso).order('requested_at',{ascending:false}).limit(500),
        supabase.from('raos_driver_queue')
          .select('id,position,status,joined_at,called_at,completed_at,driver:raos_drivers(name,driver_id),branch:branches(name)')
          .gte('joined_at',fromIso).lte('joined_at',toIso).order('joined_at',{ascending:false}).limit(500),
      ])
      if(cancelled)return
      setScans(s.data??[]);setAttendance(a.data??[]);setSaldo(r.data??[]);setQueue(q.data??[]);setLoading(false)
    })()
    return()=>{cancelled=true}
  },[profile,range,refresh])

  useRealtimeRefresh(`riwayat-cabang-${profile?.id ?? 'anon'}`,[{table:'scan_orders'},{table:'raos_attendance'},{table:'raos_saldo_requests'},{table:'raos_driver_queue'}],()=>setRefresh(x=>x+1),350,!!profile?.id)

  const tz=(profile as any)?.branches?.timezone ?? 'Asia/Jakarta',zone=zoneLabel(tz)
  const filteredScans=useMemo(()=>scans.filter(s=>{
    if(status!=='semua'&&s.status!==status)return false
    if(search){const q=search.toLowerCase();return [staffOf(s),s.raos_drivers?.name,s.raos_drivers?.driver_id,s.scan_id,s.pickup_points?.name].some(v=>String(v??'').toLowerCase().includes(q))}
    return true
  }),[scans,status,search])
  const filteredAttendance=useMemo(()=>attendance.filter(a=>!search||[staffOf(a),a.status,a.shifts?.name].some(v=>String(v??'').toLowerCase().includes(search.toLowerCase()))),[attendance,search])
  const filteredSaldo=useMemo(()=>saldo.filter(r=>!search||[staffOf(r),r.driver_name,r.request_no,r.status].some(v=>String(v??'').toLowerCase().includes(search.toLowerCase()))),[saldo,search])
  const valid=scans.filter(s=>s.status==='valid').length,pending=scans.filter(s=>s.status==='pending').length

  const tabs:{key:Tab;label:string;count:number;icon:any}[]=[
    {key:'semua',label:'Semua',count:filteredScans.length+filteredAttendance.length+filteredSaldo.length+queue.length,icon:Clock},
    {key:'scan',label:'Scan',count:filteredScans.length,icon:ScanLine},{key:'absensi',label:'Absensi',count:filteredAttendance.length,icon:UserCheck},
    {key:'saldo',label:'Saldo',count:filteredSaldo.length,icon:Wallet},{key:'antrian',label:'Antrian',count:queue.length,icon:Users},
  ]

  return <AppShell>
    <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
      <div className="flex items-center gap-3 mb-3"><Link href="/dashboard"><ArrowLeft size={22}/></Link><div className="flex-1"><MenalaLogo size={28} showText/></div></div>
      <div className="flex justify-between gap-3"><div><h1 className="font-black text-xl">Riwayat Cabang</h1><p className="text-white/50 text-xs">Scope RLS cabang • {(profile as any)?.branches?.name ?? 'Cabang'}</p></div><DateTimeStack/></div>
      <div className="relative mt-3"><Search size={16} className="absolute left-3 top-2.5 text-white/40"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari Staff, driver, ID scan..." className="w-full bg-white/10 text-white placeholder-white/40 text-sm pl-9 pr-3 py-2 rounded-xl border border-white/20"/></div>
    </div>

    <div className="bg-white border-b px-4 py-2.5 flex gap-2 overflow-x-auto"><Calendar size={16} className="text-gray-400 mt-1"/>{RANGES.map(r=><button key={r.key} onClick={()=>setRange(r.key)} className={clsx('px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap',range===r.key?'bg-primary text-secondary':'bg-gray-100 text-gray-500')}>{r.label}</button>)}</div>
    <div className="grid grid-cols-4 bg-white border-b px-4 py-3 text-center"><div><b>{scans.length}</b><p className="text-[10px] text-gray-400">Scan</p></div><div><b className="text-green-600">{valid}</b><p className="text-[10px] text-gray-400">Valid</p></div><div><b className="text-yellow-600">{pending}</b><p className="text-[10px] text-gray-400">Pending</p></div><div><b className="text-blue-600">{attendance.length}</b><p className="text-[10px] text-gray-400">Absensi</p></div></div>
    <div className="flex bg-white border-b overflow-x-auto px-2">{tabs.map(t=><button key={t.key} onClick={()=>setTab(t.key)} className={clsx('min-w-[72px] flex-1 py-3 text-xs font-semibold',tab===t.key?'text-primary border-b-2 border-primary':'text-gray-400')}>{t.label}{t.count>0&&<span className="ml-1 text-[9px]">{t.count}</span>}</button>)}</div>
    {(tab==='semua'||tab==='scan')&&<div className="px-4 py-2 bg-white border-b flex gap-2">{(['semua','valid','pending','rejected'] as StatusFilter[]).map(s=><button key={s} onClick={()=>setStatus(s)} className={clsx('px-3 py-1 rounded-full text-xs capitalize',status===s?'bg-secondary text-white':'bg-gray-100 text-gray-500')}>{s}</button>)}</div>}

    <div className="px-4 py-3 space-y-2">
      {loading&&<div className="py-12 text-center text-gray-400 text-sm">Memuat riwayat cabang...</div>}
      {!loading&&(tab==='semua'||tab==='scan')&&filteredScans.map(s=><div key={s.id} className="card flex gap-3"><div className={clsx('p-2 rounded-xl',s.status==='valid'?'bg-green-50':s.status==='pending'?'bg-yellow-50':'bg-red-50')}><ScanLine size={18}/></div><div className="flex-1 min-w-0"><div className="flex justify-between gap-2"><p className="font-bold text-sm truncate">{s.raos_drivers?.name ?? 'Driver'}</p><span className="text-[10px] font-bold uppercase">{s.status}</span></div><p className="text-[11px] text-gray-500">Staff: {staffOf(s) ?? '—'} • {s.scan_id}</p><p className="text-[10px] text-gray-400">{new Date(s.scanned_at).toLocaleString('id-ID',{timeZone:tz,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} {zone}</p></div></div>)}
      {!loading&&(tab==='semua'||tab==='absensi')&&filteredAttendance.map(a=><div key={a.id} className="card flex gap-3"><div className="p-2 rounded-xl bg-blue-50"><UserCheck size={18}/></div><div className="flex-1"><div className="flex justify-between"><p className="font-bold text-sm">{staffOf(a) ?? 'Staff'}</p><span className="text-[10px] font-bold uppercase">{a.status}</span></div><p className="text-[11px] text-gray-500">{a.date} • {a.shifts?.name ?? 'Shift'}</p><p className="text-[10px] text-gray-400">Masuk {a.check_in_at?new Date(a.check_in_at).toLocaleTimeString('id-ID',{timeZone:tz,hour:'2-digit',minute:'2-digit'}):'—'} • Pulang {a.check_out_at?new Date(a.check_out_at).toLocaleTimeString('id-ID',{timeZone:tz,hour:'2-digit',minute:'2-digit'}):'—'} {zone}</p></div></div>)}
      {!loading&&(tab==='semua'||tab==='saldo')&&filteredSaldo.map(r=><div key={r.id} className="card flex gap-3"><div className="p-2 rounded-xl bg-emerald-50"><Wallet size={18}/></div><div className="flex-1"><div className="flex justify-between items-start"><div className="text-right"><p className="text-[9px] font-bold uppercase text-gray-400">Invoice</p><p className="font-bold text-sm">Rp{saldoInvoiceNominal(null, r.nominal).toLocaleString('id-ID')}</p>{saldoInvoiceNominal(null, r.nominal) !== Number(r.nominal) && <p className="text-[9px] text-gray-400">Saldo Rp{Number(r.nominal).toLocaleString('id-ID')}</p>}</div><span className="text-[10px] uppercase font-bold">{r.is_processed?'paid':r.status}</span></div><p className="text-[11px] text-gray-500">Staff: {staffOf(r) ?? '—'} • {r.request_no}</p><p className="text-[10px] text-gray-400">{r.driver_name ? `Driver: ${r.driver_name} • ` : ''}{new Date(r.requested_at).toLocaleString('id-ID',{timeZone:tz,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} {zone}</p></div></div>)}
      {!loading&&(tab==='semua'||tab==='antrian')&&queue.map(q=><div key={q.id} className="card flex gap-3"><div className="p-2 rounded-xl bg-purple-50"><Users size={18}/></div><div className="flex-1"><div className="flex justify-between"><p className="font-bold text-sm">{q.driver?.name ?? 'Driver'}</p><span className="text-[10px] uppercase font-bold">{q.status} #{q.position}</span></div><p className="text-[11px] text-gray-500">{q.driver?.driver_id ?? '—'} • {q.branch?.name ?? '—'}</p></div></div>)}
      {!loading&&tabs.find(t=>t.key===tab)?.count===0&&<div className="py-12 text-center text-gray-400 text-sm">Belum ada aktivitas pada periode ini</div>}
    </div>
  </AppShell>
}
