import { supabase } from './supabase'
import { logActivity } from './activity'
import { runtimeMessage, runtimeTechnicalMessage } from './runtimeError'
import { enqueue, isNetworkError } from './offlineQueue'

export const SALDO_CLIENT_VERSION='p3.1-reaudit-fix' as const

// Match only a complete command. Reject partial numeric tokens such as
// `/isisaldo 95000foo`; a numeric-prefix parser must never silently accept it.
const CMD_REGEX = /^\/isi[\s_-]?saldo\s+([0-9][0-9.,]*[kK]?)\s*$/i

export interface ParsedCommand { raw:string; nominal:number }
export function parseIsiSaldoCommand(text:string):ParsedCommand|null{
  const m=text.trim().match(CMD_REGEX)
  if(!m)return null
  const token=m[1].toLowerCase()
  let nominal:number
  if(token.endsWith('k')){
    const base=token.slice(0,-1)
    // k suffix may be integer or one decimal separator: 45k / 45.5k / 45,5k.
    if(!/^\d+(?:[.,]\d+)?$/.test(base))return null
    nominal=Number(base.replace(',','.'))*1000
  }else{
    // Plain digits, or conventional 3-digit thousand grouping. Reject malformed
    // groupings such as 1.2.3 and 95,00,0 instead of silently stripping them.
    const plain=/^\d+$/.test(token)
    const dotGrouped=/^\d{1,3}(?:\.\d{3})+$/.test(token)
    const commaGrouped=/^\d{1,3}(?:,\d{3})+$/.test(token)
    if(!plain&&!dotGrouped&&!commaGrouped)return null
    nominal=Number(token.replace(/[.,]/g,''))
  }
  if(!Number.isFinite(nominal)||nominal<=0||!Number.isInteger(nominal))return null
  return {raw:text,nominal}
}

export interface SubmitResult { ok:boolean; queued?:boolean; error?:string; requestNo?:string; requestId?:string }
interface SubmitOpts {
  userId:string
  branchId:string|null|undefined
  branchSlug?:string
  branchName?:string
  fullName:string
  roomId:string
  clientMsgId?:string
  nominal:number
  allowedNominals:number[]
  driverIdRef?:string|null
  driverLoginId?:string|null
  driverName?:string|null
  driverBranchName?:string|null
}

type MarkPaidRow={
  id:string
  staff_id?:string|null
  request_no:string
  nominal:number|string
  chat_room_id?:string|null
  chat_message_id?:string|null
  status?:string|null
  is_processed?:boolean
  processed_at?:string|null
  processed_by?:string|null
}

async function postSaldoProcessedMessage(opts:{roomId:string;senderId:string;requestNo:string;nominal:number;note?:string}){
  const content=`✅ Saldo sudah diisi oleh admin.\n${opts.requestNo} • Rp${Number(opts.nominal).toLocaleString('id-ID')}\n${opts.note??''}`.trim()
  const {error}=await supabase.from('chat_messages').insert({room_id:opts.roomId,sender_id:opts.senderId,type:'text',content})
  if(error){
    console.warn('[saldoRequest] post processed system message failed',error)
    void logActivity('isi_saldo_processed_chat_warning',runtimeTechnicalMessage(error))
  }
}

async function resolveSaldoRoom(branchId:string){
  const {data:branch,error:branchError}=await supabase.from('branches').select('id,parent_branch_id').eq('id',branchId).single()
  if(branchError)return {roomId:null,error:runtimeMessage(branchError,'Cabang tidak dapat dimuat.')}
  const targetBranchId=branch?.parent_branch_id??branchId
  const {data:room,error:roomError}=await supabase.from('chat_rooms').select('id')
    .eq('branch_id',targetBranchId).eq('is_active',true)
    .or('name.ilike.%pengisian saldo%,name.ilike.%isi saldo%').limit(1).maybeSingle()
  if(roomError)return {roomId:null,error:runtimeMessage(roomError,'Room Pengisian Saldo tidak dapat dimuat.')}
  if(!room?.id)return {roomId:null,error:'Room Pengisian Saldo cabang belum tersedia.'}
  return {roomId:room.id as string,error:null}
}

export async function submitIsiSaldo(opts:SubmitOpts):Promise<SubmitResult>{
  const {branchId,branchSlug,clientMsgId,nominal,allowedNominals,driverIdRef,driverLoginId,driverName}=opts
  if(!branchId)return {ok:false,error:'Cabang tidak diketahui — hubungi admin untuk set branch.'}
  if(!driverIdRef||!driverLoginId||!driverName)return {ok:false,error:'Driver wajib diisi. Ketik ID Driver untuk auto-lookup nama & cabang.'}
  if(allowedNominals.length>0&&!allowedNominals.includes(nominal)){
    return {ok:false,error:`Nominal Rp${nominal.toLocaleString('id-ID')} tidak tersedia untuk cabang ini. Pilihan: ${allowedNominals.map(n=>'Rp'+n.toLocaleString('id-ID')).join(', ')}`}
  }

  // Terminal branches inherit their parent airport saldo room. Never fall back
  // to whichever chat room happens to be open: that can leak a request to the
  // wrong room/branch.
  const resolved=await resolveSaldoRoom(branchId)
  if(!resolved.roomId)return {ok:false,error:resolved.error??'Room Pengisian Saldo tidak ditemukan.'}

  const clientId=clientMsgId||crypto.randomUUID()
  const rpcPayload={p_client_id:clientId,p_branch_id:branchId,p_nominal:nominal,p_room_id:resolved.roomId,p_driver_id:driverIdRef}
  const {data,error}=await supabase.rpc('raos_saldo_submit',rpcPayload)
  if(error){
    if(isNetworkError(error)){
      await enqueue('saldo_request',rpcPayload)
      return {ok:true,queued:true}
    }
    console.warn('[saldoRequest] submit RPC failed',error)
    void logActivity('isi_saldo_submit_error',runtimeTechnicalMessage(error))
    return {ok:false,error:runtimeMessage(error,'Gagal menyimpan pengajuan isi saldo.')}
  }

  const result=data as {status?:string;row?:{id?:string;request_no?:string}}|null
  const request=result?.row
  if(!request?.id||!request.request_no)return {ok:false,error:'Response raos_saldo_submit tidak lengkap.'}

  void logActivity('isi_saldo_submit',`${request.request_no} Rp${nominal.toLocaleString('id-ID')} driver=${driverLoginId} branch=${branchSlug??branchId} status=${result?.status??'unknown'}`)
  return {ok:true,requestNo:request.request_no,requestId:request.id}
}

/** P3 canonical contract: approval stage has been removed permanently. */
export async function approveSaldoRequest(requestId:string,approverId:string,messageId?:string):Promise<{ok:boolean;error?:string}>{
  void requestId;void approverId;void messageId
  return {ok:false,error:'approval_flow_removed: Finance memproses request pending langsung.'}
}

/** P3 canonical contract: rejection through the old approval UI is disabled. */
export async function rejectSaldoRequest(requestId:string,approverId:string,reason:string,messageId?:string):Promise<{ok:boolean;error?:string}>{
  void requestId;void approverId;void reason;void messageId
  return {ok:false,error:'approval_flow_removed: aksi approval/reject legacy dinonaktifkan.'}
}

/**
 * Finance/Admin/Direksi mark-paid through the canonical server RPC. The RPC is
 * idempotent and owns role enforcement; the browser never performs a direct
 * UPDATE of financial lifecycle columns.
 */
export async function markSaldoRequestProcessed(requestId:string,adminId:string,note?:string,messageId?:string):Promise<{ok:boolean;error?:string}>{
  const {data,error}=await supabase.rpc('raos_saldo_mark_paid',{p_request_id:requestId,p_processor_id:adminId})
  if(error)return {ok:false,error:runtimeMessage(error,'Gagal memproses isi saldo.')}
  const result=data as {status?:string;row?:MarkPaidRow}|null
  if(!result)return {ok:false,error:'Response raos_saldo_mark_paid kosong.'}
  if(result.status==='not_found')return {ok:false,error:'Pengajuan saldo tidak ditemukan.'}
  if(result.status==='not_processable')return {ok:false,error:'Pengajuan saldo tidak dapat diproses pada status saat ini.'}
  if(result.status!=='updated'&&result.status!=='already_processed')return {ok:false,error:`Status mark-paid tidak dikenal: ${result.status??'unknown'}`}

  const row=result.row
  if(!row?.id||!row.request_no)return {ok:false,error:'Response raos_saldo_mark_paid tidak lengkap.'}

  // Do not duplicate the chat side-effect when an idempotent retry returns an
  // already_processed row.
  if(result.status==='updated'&&row.chat_room_id){
    void postSaldoProcessedMessage({roomId:row.chat_room_id,senderId:adminId,requestNo:row.request_no,nominal:Number(row.nominal),note:note??'Saldo sudah diisi oleh admin.'})
  }
  void logActivity('isi_saldo_mark_paid',`${row.request_no} request=${requestId} status=${result.status}`)
  return {ok:true}
}
