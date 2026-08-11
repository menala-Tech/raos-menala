import { supabase } from './supabase'
import { normalizeBranchTimeZone } from './branchTime'
export interface Shift{id:string;name:string;start_time:string;end_time:string;tolerance_minutes:number;is_active:boolean}
function toMinutes(t:string){const [h,m]=t.split(':').map(Number);return h*60+m}
function minutesInZone(at:Date,timeZone?:string|null){const z=normalizeBranchTimeZone(timeZone).timeZone;const p=new Intl.DateTimeFormat('en-US',{timeZone:z,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);return Number(p.find(x=>x.type==='hour')?.value||0)*60+Number(p.find(x=>x.type==='minute')?.value||0)}
export async function detectCurrentShift(timeZone?:string|null):Promise<Shift|null>{
 const {data:shifts}=await supabase.from('shifts').select('*').eq('is_active',true).order('start_time')
 if(!shifts?.length)return null
 const nowMin=minutesInZone(new Date(),timeZone)
 for(const s of shifts as Shift[]){const a=toMinutes(s.start_time),b=toMinutes(s.end_time);if(a<=b?(nowMin>=a&&nowMin<b):(nowMin>=a||nowMin<b))return s}
 let next:Shift|null=null,d=Infinity;for(const s of shifts as Shift[]){const a=toMinutes(s.start_time),x=a>=nowMin?a-nowMin:a+1440-nowMin;if(x<d){d=x;next=s}}return next
}
export function formatShiftTime(s:Shift){return `${s.start_time.slice(0,5)} s/d ${s.end_time.slice(0,5)}`}
export function isLate(shift:Shift,at:Date,timeZone?:string|null){const start=toMinutes(shift.start_time),end=toMinutes(shift.end_time);let m=minutesInZone(at,timeZone);if(start>end&&m<end)m+=1440;return m>start+shift.tolerance_minutes}
