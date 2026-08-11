'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Wallet, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { branchDateTimeLabel } from '@/lib/branchTime'
import { runtimeMessage } from '@/lib/runtimeError'

interface SaldoContent {
  request_id:string
  request_no:string
  staff_name:string
  branch_slug?:string|null
  branch_name?:string|null
  branch_id?:string|null
  nominal:number
  status:'pending'|'approved'|'rejected'|'cancelled'|'processed'
  is_processed?:boolean
  driver_login_id?:string|null
  driver_name?:string|null
  driver_branch_name?:string|null
  requested_at?:string|null
  processed_at?:string|null
}
interface Props { raw:string;messageId?:string;currentUserId:string;currentUserRole:string;onUpdated?:()=>void }

function parse(raw:string):SaldoContent|null{try{return JSON.parse(raw)}catch{return null}}

export default function SaldoRequestCard({raw,onUpdated}:Props){
  const data=useMemo(()=>parse(raw),[raw])
  const requestId=data?.request_id
  const [liveData,setLiveData]=useState<SaldoContent|null>(data)
  const [branchTimeZone,setBranchTimeZone]=useState<string|null>(null)
  const [liveError,setLiveError]=useState('')
  const onUpdatedRef=useRef(onUpdated)
  onUpdatedRef.current=onUpdated

  useEffect(()=>{setLiveData(data);setLiveError('')},[data])

  const refresh=useCallback(async()=>{
    if(!requestId)return
    const {data:row,error}=await supabase.from('raos_saldo_requests')
      .select('id, request_no, nominal, status, is_processed, requested_at, processed_at, branch_id, driver_login_id, driver_name, branches(timezone)')
      .eq('id',requestId).maybeSingle()
    if(error){
      console.warn('[SaldoRequestCard] refresh failed',error)
      setLiveError(runtimeMessage(error,'Status saldo gagal diperbarui.'))
      return
    }
    if(!row)return
    setLiveError('')
    const branchRel=(row as any).branches as {timezone?:string|null}|null
    setBranchTimeZone(branchRel?.timezone??'Asia/Jakarta')
    setLiveData(prev=>({
      ...(prev??data!),request_id:requestId,
      request_no:row.request_no??prev?.request_no??data?.request_no??'',
      nominal:Number(row.nominal??prev?.nominal??data?.nominal??0),
      status:(row.status??prev?.status??data?.status??'pending') as SaldoContent['status'],
      is_processed:row.is_processed??prev?.is_processed??data?.is_processed,
      requested_at:row.requested_at??prev?.requested_at??data?.requested_at,
      processed_at:row.processed_at??prev?.processed_at??data?.processed_at,
      branch_id:row.branch_id??prev?.branch_id??data?.branch_id,
      driver_login_id:row.driver_login_id??prev?.driver_login_id??data?.driver_login_id,
      driver_name:row.driver_name??prev?.driver_name??data?.driver_name,
    }))
    onUpdatedRef.current?.()
  },[requestId,data])

  useEffect(()=>{void refresh()},[refresh])
  useRealtimeRefresh(`saldo-request-${requestId??'none'}`,[{table:'raos_saldo_requests',event:'UPDATE',filter:requestId?`id=eq.${requestId}`:undefined}],refresh,200,!!requestId)

  if(!data)return <p className="text-xs text-red-500">Pengajuan isi saldo (data tidak terbaca)</p>
  const live=liveData??data
  const nominalFmt=`Rp${Number(live.nominal).toLocaleString('id-ID')}`
  const statusChip=(()=>{
    if(live.is_processed||live.status==='processed')return {icon:CheckCircle2,label:'Sudah Diisi oleh Admin',cls:'bg-green-100 text-green-700'}
    switch(live.status){
      case 'rejected':return {icon:XCircle,label:'Ditolak',cls:'bg-red-100 text-red-700'}
      case 'cancelled':return {icon:XCircle,label:'Dibatalkan',cls:'bg-gray-100 text-gray-600'}
      case 'approved':return {icon:Clock,label:'Menunggu diproses',cls:'bg-amber-100 text-amber-700'} // legacy row compatibility
      default:return {icon:Clock,label:'Menunggu diproses',cls:'bg-amber-100 text-amber-700'}
    }
  })()
  const StatusIcon=statusChip.icon

  return <div className="min-w-[240px] max-w-[320px] rounded-xl bg-white text-gray-900 border border-primary/30 p-3 shadow-sm">
    <div className="flex items-center gap-2 mb-2">
      <div className="bg-primary/15 rounded-lg p-1.5"><Wallet size={16} className="text-primary" /></div>
      <div className="flex-1 min-w-0"><p className="text-xs font-bold text-gray-800">Pengajuan Isi Saldo</p><p className="text-[10px] text-gray-500 truncate">{live.request_no}</p></div>
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusChip.cls}`}><StatusIcon size={10}/>{statusChip.label}</span>
    </div>
    {liveError&&<p className="mb-2 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{liveError}</p>}
    <div className="space-y-0.5 text-xs">
      {live.driver_login_id&&<div className="flex justify-between"><span className="text-gray-500">ID Driver</span><span className="font-mono text-[11px]">{live.driver_login_id}</span></div>}
      {live.driver_name&&<div className="flex justify-between"><span className="text-gray-500">Nama Driver</span><span className="font-medium truncate max-w-[160px] text-right">{live.driver_name}</span></div>}
      {(live.driver_branch_name||live.branch_name)&&<div className="flex justify-between"><span className="text-gray-500">Cabang</span><span className="font-medium truncate max-w-[160px] text-right">{live.driver_branch_name??live.branch_name}</span></div>}
      <div className="flex justify-between"><span className="text-gray-500">Staff</span><span className="font-medium">{live.staff_name}</span></div>
      {live.requested_at&&<div className="flex justify-between"><span className="text-gray-500">Waktu</span><span className="text-[11px]">{branchDateTimeLabel(branchTimeZone,new Date(live.requested_at))}</span></div>}
      <div className="flex justify-between items-center pt-1 border-t border-gray-100"><span className="text-gray-500">Nominal</span><span className="font-black text-primary text-base">{nominalFmt}</span></div>
      {live.is_processed&&live.processed_at&&<div className="rounded-md bg-green-50 px-2 py-1.5 text-[11px] text-green-700">Diisi admin pada {branchDateTimeLabel(branchTimeZone,new Date(live.processed_at))}</div>}
    </div>
  </div>
}
