'use client'
import { useCachedQuery } from './apiCache'
import { supabase } from './supabase'
import { useRealtimeRefresh } from './useRealtimeRefresh'
import { branchMonthKey, branchMonthUtcRange } from './branchTime'

export const CANONICAL_KPI_CONSUMER_VERSION='p3.1-reaudit-fix' as const

export type CanonicalKpiSnapshot={
  effectiveMonth:string
  mode:'saldo'|'order'
  target:number
  realized:number
  achievementPct:number
  source:'staff_override'|'branch_default'|'unset'
}

export function useCanonicalKpi(userId:string|null, branchId:string|null, branchTimeZone?:string|null){
  const month=branchMonthKey(branchTimeZone)
  const q=useCachedQuery<CanonicalKpiSnapshot>(['kpi-canonical',userId,branchId,month],async()=>{
    if(!userId||!branchId) return {effectiveMonth:month,mode:'saldo',target:0,realized:0,achievementPct:0,source:'unset'}

    const {data:b,error:branchError}=await supabase.from('branches').select('id,parent_branch_id').eq('id',branchId).single()
    if(branchError) throw branchError
    const targetBranch=b?.parent_branch_id ?? branchId

    const [{data:bt,error:branchTargetError},{data:st,error:staffTargetError}]=await Promise.all([
      supabase.from('raos_kpi_targets_branch').select('mode,target_staff_default').eq('branch_id',targetBranch).eq('effective_month',month).maybeSingle(),
      supabase.from('raos_kpi_targets_staff').select('target_saldo').eq('staff_id',userId).eq('effective_month',month).maybeSingle(),
    ])
    if(branchTargetError) throw branchTargetError
    if(staffTargetError) throw staffTargetError

    const mode=(bt?.mode==='order'?'order':'saldo') as 'saldo'|'order'
    // Staff override table currently stores saldo override only. Order mode must
    // inherit the canonical parent/branch default instead of reusing target_saldo.
    const hasStaffOverride=mode==='saldo' && st?.target_saldo!=null
    const target=Number(hasStaffOverride ? st?.target_saldo : bt?.target_staff_default ?? 0)
    let realized=0

    if(mode==='saldo'){
      const {data:r,error:realizationError}=await supabase.from('raos_target_tercapai_bulan')
        .select('realisasi_saldo').eq('staff_id',userId).eq('effective_month',month).maybeSingle()
      if(realizationError) throw realizationError
      realized=Number(r?.realisasi_saldo ?? 0)
    }else{
      // Exact server-side count avoids the PostgREST row-limit undercount that
      // occurs when a busy staff member has more scan rows than one page.
      const range=branchMonthUtcRange(month,branchTimeZone)
      const {count,error:scanError}=await supabase.from('scan_orders')
        .select('id',{count:'exact',head:true})
        .eq('staff_id',userId).eq('status','valid')
        .gte('scanned_at',range.start).lt('scanned_at',range.end)
      if(scanError) throw scanError
      realized=Number(count??0)
    }

    return {
      effectiveMonth:month,
      mode,
      target,
      realized,
      achievementPct:target>0?Math.min(realized/target*100,999):0,
      source:hasStaffOverride?'staff_override':bt?.target_staff_default!=null?'branch_default':'unset',
    }
  },{enabled:!!userId&&!!branchId,ttlMs:15*60*1000})

  useRealtimeRefresh(`kpi-${userId}-${month}`,[
    {table:'raos_kpi_targets_branch'},
    {table:'raos_kpi_targets_staff'},
    {table:'raos_saldo_requests'},
    {table:'scan_orders'},
  ],q.refresh,400,!!userId&&!!branchId)
  return q
}
