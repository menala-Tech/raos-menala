'use client'
import { useCachedQuery } from './apiCache'
import { supabase } from './supabase'
import { useRealtimeRefresh } from './useRealtimeRefresh'
import { branchMonthKey } from './branchTime'

export const CANONICAL_KPI_CONSUMER_VERSION='p5-koordinator-branch-kpi' as const

export interface CanonicalKpiBranchSnapshot{
  target:number
  realized:number
  remaining:number
  achievementPct:number
  activePeople:number
}

export type CanonicalKpiSnapshot={
  effectiveMonth:string
  mode:'saldo'|'order'
  scope:'staff'|'branch'
  target:number
  realized:number
  achievementPct:number
  source:'staff_override'|'branch_default'|'derived_equal_share'|'branch_target'|'unset'
  branchTarget?:number
  activeStaff?:number
  // Koordinator-only (2026-08-20 branch-KPI fix): populated alongside the
  // personal fields above (which stay `scope:'staff'`, never overwritten)
  // when raos_saldo_kpi_snapshot()/raos_order_kpi_snapshot() detect the
  // caller is koordinator. undefined for every other role.
  branch?:CanonicalKpiBranchSnapshot
}

function mapBranchSnapshot(raw:any):CanonicalKpiBranchSnapshot|undefined{
  if(!raw) return undefined
  return {
    target:Number(raw.target ?? 0),
    realized:Number(raw.realized ?? 0),
    remaining:Number(raw.remaining ?? 0),
    achievementPct:Number(raw.achievementPct ?? 0),
    activePeople:Number(raw.activePeople ?? 0),
  }
}

export function useCanonicalKpi(
  userId:string|null,
  branchId:string|null,
  branchTimeZone?:string|null,
  role?:string|null,
){
  const month=branchMonthKey(branchTimeZone)
  const q=useCachedQuery<CanonicalKpiSnapshot>(['kpi-canonical',userId,branchId,role,month],async()=>{
    if(!userId||!branchId) return {effectiveMonth:month,mode:'saldo',scope:'staff',target:0,realized:0,achievementPct:0,source:'unset'}

    const {data:b,error:branchError}=await supabase.from('branches').select('id,parent_branch_id').eq('id',branchId).single()
    if(branchError) throw branchError
    const targetBranch=b?.parent_branch_id ?? branchId

    const {data:bt,error:branchTargetError}=await supabase
      .from('raos_kpi_targets_branch')
      .select('mode,target_staff_default,target_cabang')
      .eq('branch_id',targetBranch)
      .eq('effective_month',month)
      .maybeSingle()
    if(branchTargetError) throw branchTargetError

    const mode=(bt?.mode==='order'?'order':'saldo') as 'saldo'|'order'

    if(mode==='order'){
      const {data,error}=await supabase.rpc('raos_order_kpi_snapshot')
      if(error) throw error
      const snap=(data ?? {}) as any
      return {
        effectiveMonth:String(snap.effectiveMonth ?? month),
        mode:'order',
        scope:snap.scope==='branch'?'branch':'staff',
        target:Number(snap.target ?? 0),
        realized:Number(snap.realized ?? 0),
        achievementPct:Number(snap.achievementPct ?? 0),
        source:(snap.source ?? 'unset') as CanonicalKpiSnapshot['source'],
        branchTarget:Number(snap.branchTarget ?? bt?.target_cabang ?? 0),
        activeStaff:Number(snap.activeStaff ?? 0),
        branch:mapBranchSnapshot(snap.branch),
      }
    }

    // Saldo-mode: Staff/Koordinator go through the canonical RPC (2026-08-20
    // koordinator-branch-KPI fix) -- it's the only path that can compute the
    // derived_equal_share tier-3 fallback correctly for BOTH roles (a
    // client-side count of active branch people is RLS-blocked for Staff;
    // see raos_106 migration header for the full audit). Every other role
    // (admin/management/direksi/direktur, or unset) keeps the EXACT prior
    // client-side query below, unchanged -- their /kpi saldo-mode behavior
    // is intentionally left as-is per this task's scope.
    const normalizedRole=String(role ?? '').trim().toLowerCase()
    if(normalizedRole==='staff'||normalizedRole==='koordinator'){
      const {data,error}=await supabase.rpc('raos_saldo_kpi_snapshot')
      if(error) throw error
      const snap=(data ?? {}) as any
      return {
        effectiveMonth:String(snap.effectiveMonth ?? month),
        mode:'saldo',
        scope:snap.scope==='branch'?'branch':'staff',
        target:Number(snap.target ?? 0),
        realized:Number(snap.realized ?? 0),
        achievementPct:Number(snap.achievementPct ?? 0),
        source:(snap.source ?? 'unset') as CanonicalKpiSnapshot['source'],
        branchTarget:Number(snap.branchTarget ?? bt?.target_cabang ?? 0),
        activeStaff:Number(snap.activeStaff ?? 0),
        branch:mapBranchSnapshot(snap.branch),
      }
    }

    const {data:st,error:staffTargetError}=await supabase
      .from('raos_kpi_targets_staff')
      .select('target_saldo')
      .eq('staff_id',userId)
      .eq('effective_month',month)
      .maybeSingle()
    if(staffTargetError) throw staffTargetError

    const hasStaffOverride=st?.target_saldo!=null
    const target=Number(hasStaffOverride ? st?.target_saldo : bt?.target_staff_default ?? 0)
    const {data:r,error:realizationError}=await supabase.from('raos_target_tercapai_bulan')
      .select('realisasi_saldo').eq('staff_id',userId).eq('effective_month',month).maybeSingle()
    if(realizationError) throw realizationError
    const realized=Number(r?.realisasi_saldo ?? 0)

    return {
      effectiveMonth:month,
      mode:'saldo',
      scope:'staff',
      target,
      realized,
      achievementPct:target>0?Math.min(realized/target*100,999):0,
      source:hasStaffOverride?'staff_override':bt?.target_staff_default!=null?'branch_default':'unset',
      branchTarget:Number(bt?.target_cabang ?? 0),
    }
  },{enabled:!!userId&&!!branchId&&!!role,ttlMs:15*60*1000})

  useRealtimeRefresh(`kpi-${userId}-${month}`,[
    {table:'raos_kpi_targets_branch'},
    {table:'raos_kpi_targets_staff'},
    {table:'raos_saldo_requests'},
    {table:'scan_orders'},
  ],q.refresh,400,!!userId&&!!branchId)
  return q
}
