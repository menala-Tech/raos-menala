'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadProfileLabels } from '@/lib/chatProfileDirectory'
import { cacheReadSync, cacheWriteSync, cacheInvalidate } from '@/lib/apiCache'
import AppShell from '@/components/layout/AppShell'
import MenalaLogo from '@/components/MenalaLogo'
import { DateTimeStack } from '@/components/DateTimeHeader'
import {
  ArrowLeft, Search, ScanLine, UserCheck, CheckCircle2, Clock,
  X, BarChart3, MapPin, Car, User, Calendar, Wallet, XCircle, Users, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { ScanOrder, Attendance, UserProfile } from '@/types'
import { can } from '@/lib/accessPolicy'
import { branchDateKey } from '@/lib/branchTime'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { runtimeMessage, runtimeTechnicalMessage } from '@/lib/runtimeError'

type Tab = 'semua' | 'scan' | 'absensi' | 'saldo' | 'antrian'
type StatusFilter = 'semua' | 'valid' | 'pending'
type DateRange = 'hari-ini' | 'kemarin' | '7-hari' | '30-hari'

type StaffLabel = { full_name: string | null; staff_id?: string | null } | null

interface QueueRow {
  id: string
  branch_id: string | null
  position: number
  status: 'waiting' | 'called' | 'completed' | 'left'
  joined_at: string
  called_at: string | null
  completed_at: string | null
  driver: { name: string; driver_id: string } | null
  branch: { name: string } | null
}

interface SaldoRequest {
  id: string
  request_no: string
  nominal: number
  status: string
  is_processed: boolean
  requested_at: string
  approved_at: string | null
  processed_at: string | null
  rejection_reason: string | null
  note: string | null
  driver_name: string | null
  approved_by_user: { full_name: string } | null
  processed_by_user: { full_name: string } | null
  staff_profile?: StaffLabel
}

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: 'hari-ini', label: 'Hari Ini' },
  { key: 'kemarin', label: 'Kemarin' },
  { key: '7-hari', label: '7 Hari' },
  { key: '30-hari', label: '30 Hari' },
]

function rangeToDates(range: DateRange): { from: Date; to: Date } {
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const to = new Date(now)
  let from = startOfDay(now)
  if (range === 'kemarin') {
    from = new Date(from.getTime() - 86400000)
    return { from, to: startOfDay(now) }
  }
  if (range === '7-hari') from = new Date(startOfDay(now).getTime() - 6 * 86400000)
  if (range === '30-hari') from = new Date(startOfDay(now).getTime() - 29 * 86400000)
  return { from, to }
}

function zoneLabel(tz: string): string {
  if (tz === 'Asia/Makassar' || tz === 'Asia/Kuching') return 'WITA'
  if (tz === 'Asia/Jayapura') return 'WIT'
  return 'WIB'
}

function staffName(row: any): string | null {
  const p=row?.staff_profile
  if (!p) return null
  if (Array.isArray(p)) return p[0]?.full_name ?? null
  return p.full_name ?? null
}

export default function RiwayatPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('semua')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua')
  const [dateRange, setDateRange] = useState<DateRange>('30-hari')
  const [search, setSearch] = useState('')
  const [scans, setScans] = useState<ScanOrder[]>([])
  const [absensies, setAbsensies] = useState<Attendance[]>([])
  const [saldoRequests, setSaldoRequests] = useState<SaldoRequest[]>([])
  const [queueRows, setQueueRows] = useState<QueueRow[]>([])
  const [queueBusy, setQueueBusy] = useState<string | null>(null)
  const [queueErr, setQueueErr] = useState('')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<{ type: 'scan' | 'absensi'; data: any } | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [refreshNonce,setRefreshNonce]=useState(0)

  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab')
      if (t === 'scan' || t === 'absensi' || t === 'saldo' || t === 'antrian') setTab(t)
    } catch { /* no-op */ }
  }, [])

  useEffect(() => {
    let cancelled=false
    async function load(){
      const {data:{session}}=await supabase.auth.getSession()
      if(!session){router.push('/');return}
      const userId=session.user.id

      let activeProfile=profile
      if(!activeProfile){
        activeProfile=cacheReadSync<UserProfile>(['user-profile',userId]) ?? null
        if(!activeProfile){
          const {data:p}=await supabase.from('user_profiles').select('*, branches(*)').eq('id',userId).single()
          activeProfile=(p as UserProfile) ?? null
          if(p) cacheWriteSync(['user-profile',userId],p)
        }
        if(activeProfile && !cancelled) setProfile(activeProfile)
      }
      if(!activeProfile || cancelled) return

      const branchReader=can(activeProfile.role,'history:branch:read')
      const tz=(activeProfile as any)?.branches?.timezone ?? 'Asia/Jakarta'
      const {from,to}=rangeToDates(dateRange)
      const fromIso=from.toISOString(),toIso=to.toISOString()
      const fromDate=branchDateKey(tz,from),toDate=branchDateKey(tz,to)
      const cacheKey=['riwayat',userId,branchReader?'branch':'self',dateRange,fromDate,toDate]
      const cached=cacheReadSync<{scans:ScanOrder[];absensies:Attendance[];saldoRequests:SaldoRequest[];queueRows:QueueRow[]}>(cacheKey)
      if(cached && !cancelled){
        setScans(cached.scans);setAbsensies(cached.absensies);setSaldoRequests(cached.saldoRequests);setQueueRows(cached.queueRows);setLoading(false)
      }else setLoading(true)

      let scanQuery=supabase.from('scan_orders')
        .select('*, raos_drivers(*), pickup_points(name), staff_profile:user_profiles!scan_orders_staff_id_fkey(full_name, staff_id)')
        .gte('scanned_at',fromIso).lte('scanned_at',toIso)
        .order('scanned_at',{ascending:false}).limit(300)
      let attQuery=supabase.from('raos_attendance')
        .select('*, pickup_points(name), shifts(name, start_time, end_time), staff_profile:user_profiles!raos_attendance_staff_id_fkey(full_name, staff_id)')
        .gte('date',fromDate).lte('date',toDate)
        .order('date',{ascending:false}).limit(200)
      let saldoQuery=supabase.from('raos_saldo_requests')
        .select('id, request_no, nominal, status, is_processed, requested_at, approved_at, processed_at, rejection_reason, note, driver_name, approved_by, processed_by, staff_profile:user_profiles!raos_saldo_requests_staff_id_fkey(full_name, staff_id)')
        .gte('requested_at',fromIso).lte('requested_at',toIso)
        .order('requested_at',{ascending:false}).limit(300)

      if(!branchReader){
        scanQuery=scanQuery.eq('staff_id',userId)
        attQuery=attQuery.eq('staff_id',userId)
        saldoQuery=saldoQuery.eq('staff_id',userId)
      }

      const [{data:scanData},{data:attData},{data:saldoData},{data:queueData}]=await Promise.all([
        scanQuery,attQuery,saldoQuery,
        supabase.from('raos_driver_queue')
          .select('id, branch_id, position, status, joined_at, called_at, completed_at, driver:raos_drivers(name, driver_id), branch:branches(name)')
          .gte('joined_at',fromIso).lte('joined_at',toIso)
          .order('joined_at',{ascending:false}).limit(300),
      ])
      if(cancelled)return

      const rawSaldo=(saldoData ?? []) as any[]
      let labels:any[]=[]
      try{labels=await loadProfileLabels(rawSaldo.flatMap(r=>[r.approved_by,r.processed_by]))}catch(error){console.warn('[riwayat] processor labels failed',error)}
      const labelMap=new Map(labels.map((p:any)=>[p.user_id,p]))
      const safeSaldo=rawSaldo.map(r=>({...r,
        approved_by_user:r.approved_by?{full_name:labelMap.get(r.approved_by)?.full_name ?? 'Petugas'}:null,
        processed_by_user:r.processed_by?{full_name:labelMap.get(r.processed_by)?.full_name ?? 'Petugas'}:null,
      }))
      const fresh={
        scans:(scanData ?? []) as ScanOrder[],
        absensies:(attData ?? []) as Attendance[],
        saldoRequests:safeSaldo as SaldoRequest[],
        queueRows:(queueData ?? []) as unknown as QueueRow[],
      }
      setScans(fresh.scans);setAbsensies(fresh.absensies);setSaldoRequests(fresh.saldoRequests);setQueueRows(fresh.queueRows)
      cacheWriteSync(cacheKey,fresh);setLoading(false)
    }
    void load()
    return()=>{cancelled=true}
  },[router,dateRange,profile,refreshNonce])

  useRealtimeRefresh(`riwayat-${profile?.id ?? 'anon'}`,[{table:'scan_orders'},{table:'raos_attendance'},{table:'raos_saldo_requests'},{table:'raos_driver_queue'}],()=>setRefreshNonce(n=>n+1),350,!!profile?.id)

  const branchReader=!!profile && can(profile.role,'history:branch:read')
  const tz=(profile as any)?.branches?.timezone ?? 'Asia/Jakarta'
  const zone=zoneLabel(tz)

  const filteredScans=scans.filter(s=>{
    if(statusFilter!=='semua'&&s.status!==statusFilter)return false
    if(search){
      const q=search.toLowerCase()
      const driver=(s as any).raos_drivers?.name?.toLowerCase() ?? ''
      const scanId=s.scan_id.toLowerCase()
      const location=(s as any).pickup_points?.name?.toLowerCase() ?? ''
      const staff=(staffName(s) ?? '').toLowerCase()
      if(!driver.includes(q)&&!scanId.includes(q)&&!location.includes(q)&&!staff.includes(q))return false
    }
    return true
  })

  const summary=useMemo(()=>{
    const validScans=scans.filter(s=>s.status==='valid').length
    const pendingScans=scans.filter(s=>s.status==='pending').length
    const masuk=absensies.filter(a=>a.check_in_at).length
    const pulang=absensies.filter(a=>a.check_out_at).length
    const rate=scans.length?Math.round(validScans/scans.length*100):0
    const byDay=new Map<string,{scan:number;absensi:number}>()
    for(const s of scans){const d=s.scanned_at.split('T')[0];const cur=byDay.get(d)??{scan:0,absensi:0};cur.scan++;byDay.set(d,cur)}
    for(const a of absensies){const cur=byDay.get(a.date)??{scan:0,absensi:0};cur.absensi++;byDay.set(a.date,cur)}
    const days=Array.from(byDay.entries()).sort((a,b)=>a[0].localeCompare(b[0])).slice(-14)
    return {total:scans.length+absensies.length,validScans,pendingScans,masuk,pulang,rate,days,maxVal:Math.max(1,...days.map(([,v])=>v.scan+v.absensi))}
  },[scans,absensies])

  const TABS:{key:Tab;label:string;count:number}[]=[
    {key:'semua',label:'Semua',count:filteredScans.length+absensies.length+saldoRequests.length+queueRows.length},
    {key:'scan',label:'Scan',count:filteredScans.length},{key:'absensi',label:'Absensi',count:absensies.length},
    {key:'saldo',label:'Isi Saldo',count:saldoRequests.length},{key:'antrian',label:'Antrian',count:queueRows.length},
  ]
  const role=profile?.role ?? ''
  const canEdit=can(role,'saldo:mutate')
  const canDelete=can(role,'staff:mutate')
  const canEditQueue=can(role,'queue:operate')

  function invalidateRiwayat(){if(profile)cacheInvalidate(['riwayat',profile.id])}
  async function deleteScan(row:ScanOrder){if(!canDelete||!confirm(`Hapus scan ${row.scan_id}?`))return;const{error}=await supabase.from('scan_orders').delete().eq('id',row.id);if(error){alert(runtimeMessage(error,'Gagal menghapus scan.'));return}setScans(p=>p.filter(r=>r.id!==row.id));invalidateRiwayat()}
  async function deleteAbsensi(row:Attendance){if(!canDelete||!confirm(`Hapus absensi tanggal ${row.date}?`))return;const{error}=await supabase.from('raos_attendance').delete().eq('id',row.id);if(error){alert(runtimeMessage(error,'Gagal menghapus absensi.'));return}setAbsensies(p=>p.filter(r=>r.id!==row.id));invalidateRiwayat()}
  async function editScanStatus(row:ScanOrder){if(!canEdit)return;const next=row.status==='pending'?'valid':row.status==='valid'?'rejected':'pending';if(!confirm(`Ubah status scan ${row.scan_id} dari ${row.status} → ${next}?`))return;const{error}=await supabase.from('scan_orders').update({status:next}).eq('id',row.id);if(error){console.warn(runtimeTechnicalMessage(error));alert(runtimeMessage(error,'Gagal mengubah status.'));return}setScans(p=>p.map(r=>r.id===row.id?{...r,status:next} as ScanOrder:r));invalidateRiwayat()}
  async function markQueueCompleted(row:QueueRow){if(!canEditQueue)return;setQueueBusy(row.id);setQueueErr('');const{error}=await supabase.rpc('raos_complete_queue',{p_queue_id:row.id});setQueueBusy(null);if(error){setQueueErr(runtimeMessage(error,'Operasi antrean gagal.'));return}setQueueRows(p=>p.map(r=>r.id===row.id?{...r,status:'completed',completed_at:new Date().toISOString()}:r));invalidateRiwayat()}

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3"><Link href="/dashboard"><ArrowLeft size={22} className="text-white/70" /></Link><div className="flex-1"><MenalaLogo size={28} showText /></div></div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0"><h1 className="font-black text-xl">Riwayat Aktivitas</h1><p className="text-white/50 text-xs mt-0.5">{branchReader?'Seluruh aktivitas Staff dalam scope cabang':'Semua aktivitas scan & absensi Anda'}</p></div>
          <div className="flex items-start gap-2 flex-shrink-0"><DateTimeStack /><button onClick={()=>setShowSummary(true)} className="bg-white/10 rounded-xl p-2"><BarChart3 size={20} className="text-primary" /></button></div>
        </div>
        <div className="relative"><Search className="absolute left-3 top-2.5 text-white/40" size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={branchReader?'Cari staff, driver, ID scan, lokasi...':'Cari nama driver, ID scan, lokasi...'} className="w-full bg-white/10 text-white placeholder-white/40 text-sm pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none"/></div>
      </div>

      <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex gap-2 overflow-x-auto"><Calendar size={16} className="text-gray-400 flex-shrink-0 mt-1"/>{DATE_RANGES.map(r=><button key={r.key} onClick={()=>setDateRange(r.key)} className={clsx('flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold',dateRange===r.key?'bg-primary text-secondary':'bg-gray-100 text-gray-500')}>{r.label}</button>)}</div>

      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="grid grid-cols-5 gap-2 text-center">{[
          ['Total',summary.total,'text-gray-800'],['Order',scans.length,'text-purple-600'],['Valid',summary.validScans,'text-green-600'],['Pending',summary.pendingScans,'text-yellow-600'],['Absensi',absensies.length,'text-blue-600']
        ].map(([label,value,color])=><div key={String(label)}><p className={`text-lg font-black ${color}`}>{value}</p><p className="text-[10px] text-gray-400">{label}</p></div>)}</div>
      </div>

      <div className="flex bg-white border-b border-gray-200 px-4">{TABS.map(t=><button key={t.key} onClick={()=>setTab(t.key)} className={clsx('flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1',tab===t.key?'text-primary border-b-2 border-primary':'text-gray-400')}>{t.label}{t.count>0&&<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100">{t.count}</span>}</button>)}</div>
      {(tab==='semua'||tab==='scan')&&<div className="px-4 py-2.5 flex gap-2 bg-white border-b border-gray-100">{(['semua','valid','pending'] as StatusFilter[]).map(s=><button key={s} onClick={()=>setStatusFilter(s)} className={clsx('px-3 py-1 rounded-full text-xs font-semibold capitalize',statusFilter===s?'bg-secondary text-white':'bg-gray-100 text-gray-500')}>{s}</button>)}</div>}

      <div className="px-4 py-3 space-y-2">
        {loading&&<div className="text-center py-10 text-gray-400 text-sm"><Clock size={24} className="mx-auto mb-2 opacity-40 animate-pulse"/>Memuat riwayat...</div>}

        {!loading&&(tab==='semua'||tab==='scan')&&filteredScans.map(scan=><div key={scan.id} className="card">
          <button onClick={()=>setDetail({type:'scan',data:scan})} className="w-full flex items-center gap-3 text-left">
            <div className={clsx('p-2.5 rounded-xl',scan.status==='valid'?'bg-green-50':scan.status==='pending'?'bg-yellow-50':'bg-red-50')}><ScanLine size={18} className={scan.status==='valid'?'text-green-600':scan.status==='pending'?'text-yellow-600':'text-red-600'}/></div>
            <div className="flex-1 min-w-0"><div className="flex items-center justify-between"><p className="font-bold text-sm text-gray-800 truncate">{(scan as any).raos_drivers?.name ?? 'Driver tidak diketahui'}</p><span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full',scan.status==='valid'?'badge-valid':scan.status==='pending'?'badge-pending':'badge-rejected')}>{scan.status.toUpperCase()}</span></div>
              <p className="text-xs text-gray-400 mt-0.5">{scan.scan_id} • {new Date(scan.scanned_at).toLocaleString('id-ID',{timeZone:tz,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} {zone}{branchReader&&staffName(scan)?` • Staff: ${staffName(scan)}`:''}</p>
            </div>
          </button>
          {(canEdit||canDelete)&&<div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">{canEdit&&<button onClick={()=>editScanStatus(scan)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-50 text-blue-600">Ubah Status</button>}{canDelete&&<button onClick={()=>deleteScan(scan)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-red-50 text-red-600 flex items-center gap-1"><Trash2 size={11}/> Hapus</button>}</div>}
        </div>)}

        {!loading&&(tab==='semua'||tab==='absensi')&&absensies.map(att=><div key={att.id} className="card">
          <button onClick={()=>setDetail({type:'absensi',data:att})} className="w-full flex items-center gap-3 text-left"><div className="bg-blue-50 p-2.5 rounded-xl"><UserCheck size={18} className="text-blue-600"/></div><div className="flex-1"><div className="flex items-center justify-between"><div><p className="font-bold text-sm text-gray-800">Absensi{branchReader&&staffName(att)?` — ${staffName(att)}`:''}</p><p className="text-xs text-gray-400">{new Date(att.date).toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short'})}</p></div><span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full',att.status==='hadir'?'badge-valid':att.status==='terlambat'?'badge-pending':'badge-rejected')}>{att.status.toUpperCase()}</span></div><div className="flex gap-3 mt-1">{att.check_in_at&&<span className="text-[11px] text-green-600 font-semibold">Masuk: {new Date(att.check_in_at).toLocaleTimeString('id-ID',{timeZone:tz,hour:'2-digit',minute:'2-digit'})}</span>}{att.check_out_at&&<span className="text-[11px] text-primary font-semibold">Pulang: {new Date(att.check_out_at).toLocaleTimeString('id-ID',{timeZone:tz,hour:'2-digit',minute:'2-digit'})}</span>}</div></div></button>
          {canDelete&&<div className="mt-2 pt-2 border-t border-gray-100"><button onClick={()=>deleteAbsensi(att)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-red-50 text-red-600 flex items-center gap-1"><Trash2 size={11}/> Hapus</button></div>}
        </div>)}

        {!loading&&tab==='saldo'&&saldoRequests.length>0&&(()=>{const total=saldoRequests.reduce((s,r)=>s+Number(r.nominal||0),0);const paid=saldoRequests.filter(r=>r.is_processed).reduce((s,r)=>s+Number(r.nominal||0),0);return <div className="card bg-primary/5"><p className="text-[10px] font-bold text-gray-500 uppercase">Total Pengisian Saldo</p><div className="grid grid-cols-2 gap-3 mt-2"><div><p className="text-[10px] text-gray-500">Total Diajukan</p><p className="font-black">Rp{total.toLocaleString('id-ID')}</p></div><div><p className="text-[10px] text-gray-500">Sudah Diisi</p><p className="font-black text-emerald-600">Rp{paid.toLocaleString('id-ID')}</p></div></div></div>})()}

        {!loading&&(tab==='semua'||tab==='saldo')&&saldoRequests.map(req=>{const meta=saldoLifecycleMeta(req);const Icon=meta.icon;return <div key={req.id} className="card flex items-start gap-3"><div className={clsx('p-2.5 rounded-xl',meta.bgSoft)}><Icon size={18} className={meta.textStrong}/></div><div className="flex-1 min-w-0"><div className="flex items-center justify-between"><p className="font-bold text-sm">Isi Saldo Rp{Number(req.nominal).toLocaleString('id-ID')}</p><span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full',meta.badgeCls)}>{meta.emoji} {meta.label}</span></div><p className="text-[11px] text-gray-400">{req.request_no} · {new Date(req.requested_at).toLocaleString('id-ID',{timeZone:tz,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} {zone}{branchReader&&staffName(req)?` · Staff: ${staffName(req)}`:''}{req.driver_name?` · Driver: ${req.driver_name}`:''}</p>{meta.status==='rejected'&&req.rejection_reason&&<p className="text-[11px] text-red-600 mt-1">Alasan: {req.rejection_reason}</p>}</div></div>})}

        {!loading&&(tab==='semua'||tab==='antrian')&&queueErr&&<div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg flex justify-between"><span>{queueErr}</span><button onClick={()=>setQueueErr('')}><X size={14}/></button></div>}
        {!loading&&(tab==='semua'||tab==='antrian')&&queueRows.map(row=><div key={row.id} className="card flex items-start gap-3"><div className="p-2.5 rounded-xl bg-blue-50"><Users size={18} className="text-blue-600"/></div><div className="flex-1"><div className="flex justify-between gap-2"><p className="font-bold text-sm">{row.driver?.name ?? 'Driver tidak diketahui'}</p><span className="text-[10px] font-bold uppercase">{row.status} · #{row.position}</span></div><p className="text-[11px] text-gray-400">{row.driver?.driver_id ?? '-'} · {row.branch?.name ?? '-'} · {new Date(row.joined_at).toLocaleString('id-ID',{timeZone:tz,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} {zone}</p>{canEditQueue&&row.status==='called'&&<button onClick={()=>markQueueCompleted(row)} disabled={queueBusy===row.id} className="text-[11px] mt-2 px-2 py-1 rounded-md bg-emerald-100 text-emerald-700">Tandai Selesai</button>}</div></div>)}

        {!loading&&filteredScans.length===0&&absensies.length===0&&saldoRequests.length===0&&queueRows.length===0&&<div className="text-center py-12 text-gray-400"><Clock size={32} className="mx-auto mb-3 opacity-30"/><p className="text-sm font-medium">Belum ada riwayat di rentang ini</p></div>}
      </div>

      {detail&&<div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center" onClick={()=>setDetail(null)}><div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}><div className="sticky top-0 bg-white px-5 pt-4 pb-3 border-b flex justify-between"><h3 className="font-black">Detail Aktivitas</h3><button onClick={()=>setDetail(null)}><X size={16}/></button></div><div className="px-5 py-4 space-y-4"><div className="bg-gray-50 rounded-xl p-4 space-y-3">{detail.type==='scan'?<><DetailRow icon={ScanLine} label="Jenis Aktivitas" value="Scan Barcode"/><DetailRow icon={Clock} label="Waktu" value={`${new Date(detail.data.scanned_at).toLocaleString('id-ID',{timeZone:tz,day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})} ${zone}`}/>{branchReader&&staffName(detail.data)&&<DetailRow icon={User} label="Staff" value={staffName(detail.data)!}/>}<DetailRow icon={ScanLine} label="ID Scan" value={detail.data.scan_id}/><DetailRow icon={User} label="Driver" value={detail.data.raos_drivers?.name ?? '—'}/><DetailRow icon={Car} label="Kendaraan" value={[detail.data.raos_drivers?.vehicle_type,detail.data.raos_drivers?.vehicle_plate].filter(Boolean).join(' — ')||'—'}/><DetailRow icon={MapPin} label="Lokasi Pickup" value={detail.data.pickup_points?.name ?? '—'}/></>:<><DetailRow icon={UserCheck} label="Jenis Aktivitas" value="Absensi"/>{branchReader&&staffName(detail.data)&&<DetailRow icon={User} label="Staff" value={staffName(detail.data)!}/>}<DetailRow icon={Calendar} label="Tanggal" value={new Date(detail.data.date).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}/><DetailRow icon={Clock} label="Masuk" value={detail.data.check_in_at?`${new Date(detail.data.check_in_at).toLocaleTimeString('id-ID',{timeZone:tz,hour:'2-digit',minute:'2-digit'})} ${zone}`:'—'}/><DetailRow icon={Clock} label="Pulang" value={detail.data.check_out_at?`${new Date(detail.data.check_out_at).toLocaleTimeString('id-ID',{timeZone:tz,hour:'2-digit',minute:'2-digit'})} ${zone}`:'—'}/></>}</div><button className="btn-primary" onClick={()=>setDetail(null)}>Tutup</button></div></div></div>}

      {showSummary&&<div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center" onClick={()=>setShowSummary(false)}><div className="bg-white rounded-t-3xl w-full max-w-md p-5" onClick={e=>e.stopPropagation()}><div className="flex justify-between mb-4"><h3 className="font-black">Ringkasan Aktivitas</h3><button onClick={()=>setShowSummary(false)}><X size={16}/></button></div><div className="grid grid-cols-3 gap-2">{[['Total Aktivitas',summary.total],['Scan Valid',summary.validScans],['Scan Pending',summary.pendingScans],['Absensi Masuk',summary.masuk],['Absensi Pulang',summary.pulang],['Tingkat Validasi',`${summary.rate}%`]].map(([l,v])=><div key={String(l)} className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-xl font-black">{v}</p><p className="text-[9px] text-gray-500">{l}</p></div>)}</div><button className="btn-primary mt-4" onClick={()=>setShowSummary(false)}>Tutup</button></div></div>}
    </AppShell>
  )
}

interface SaldoLifecycleMeta {status:'pending'|'approved'|'paid'|'rejected';label:string;emoji:string;icon:typeof Wallet;badgeCls:string;bgSoft:string;textStrong:string;dot:string}
function saldoLifecycleMeta(req:{status:string;is_processed:boolean}):SaldoLifecycleMeta{
  if(req.is_processed)return{status:'paid',label:'SUDAH DIISI',emoji:'✅',icon:Wallet,badgeCls:'bg-sky-100 text-sky-700',bgSoft:'bg-sky-50',textStrong:'text-sky-600',dot:'bg-sky-500'}
  if(req.status==='rejected'||req.status==='cancelled')return{status:'rejected',label:req.status.toUpperCase(),emoji:'🔴',icon:XCircle,badgeCls:'bg-red-100 text-red-700',bgSoft:'bg-red-50',textStrong:'text-red-600',dot:'bg-red-500'}
  if(req.status==='approved')return{status:'approved',label:'APPROVED',emoji:'🟢',icon:CheckCircle2,badgeCls:'bg-emerald-100 text-emerald-700',bgSoft:'bg-emerald-50',textStrong:'text-emerald-600',dot:'bg-emerald-500'}
  return{status:'pending',label:'BELUM DIISI',emoji:'⏰',icon:Clock,badgeCls:'bg-amber-100 text-amber-700',bgSoft:'bg-amber-50',textStrong:'text-amber-600',dot:'bg-amber-400'}
}
function DetailRow({icon:Icon,label,value}:{icon:any;label:string;value:string}){return <div className="flex items-start gap-3"><Icon size={15} className="text-gray-400 mt-0.5"/><div className="flex-1 flex justify-between gap-2"><span className="text-xs text-gray-500">{label}</span><span className="text-xs font-semibold text-gray-800 text-right">{value}</span></div></div>}
