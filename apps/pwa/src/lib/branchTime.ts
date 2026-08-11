export type BranchClock = { timeZone: string; zoneLabel: 'WIB'|'WITA'|'WIT' }

export function normalizeBranchTimeZone(value?: string | null): BranchClock {
  const timeZone = value || 'Asia/Jakarta'
  if (timeZone === 'Asia/Makassar' || timeZone === 'Asia/Kuching') return { timeZone, zoneLabel:'WITA' }
  if (timeZone === 'Asia/Jayapura') return { timeZone, zoneLabel:'WIT' }
  return { timeZone, zoneLabel:'WIB' }
}
export function branchDateKey(timeZone?: string | null, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: normalizeBranchTimeZone(timeZone).timeZone }).format(at)
}
export function branchMonthKey(timeZone?: string | null, at = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:normalizeBranchTimeZone(timeZone).timeZone,year:'numeric',month:'2-digit'}).formatToParts(at)
  const y=p.find(x=>x.type==='year')?.value, m=p.find(x=>x.type==='month')?.value
  return `${y}-${m}-01`
}
export function branchTimeLabel(timeZone?: string | null, at = new Date()) {
  const z=normalizeBranchTimeZone(timeZone)
  return `${at.toLocaleTimeString('id-ID',{timeZone:z.timeZone,hour:'2-digit',minute:'2-digit'})} ${z.zoneLabel}`
}

export function branchHour(timeZone?: string | null, at = new Date()) {
  const z=normalizeBranchTimeZone(timeZone)
  const hour=new Intl.DateTimeFormat('en-GB',{timeZone:z.timeZone,hour:'2-digit',hourCycle:'h23'}).format(at)
  return Number(hour)
}

export function branchDateTimeLabel(timeZone?: string | null, at = new Date(), opts: Intl.DateTimeFormatOptions = {}) {
  const z=normalizeBranchTimeZone(timeZone)
  const base:Intl.DateTimeFormatOptions={
    timeZone:z.timeZone,
    day:'numeric',
    month:'short',
    year:'numeric',
    hour:'2-digit',
    minute:'2-digit',
    hourCycle:'h23',
  }
  const text=new Intl.DateTimeFormat('id-ID',{...base,...opts,timeZone:z.timeZone}).format(at)
  return `${text} ${z.zoneLabel}`
}

export function branchDateLabel(timeZone?: string | null, at = new Date()) {
  const z=normalizeBranchTimeZone(timeZone)
  return new Intl.DateTimeFormat('id-ID',{timeZone:z.timeZone,day:'numeric',month:'short',year:'numeric'}).format(at)
}


/** Exact UTC boundaries for an Indonesian branch-local calendar month.
 * Indonesia operational zones have fixed UTC offsets and no DST. Keeping this
 * conversion inside the one canonical branchTime engine prevents page-owned
 * timezone math and lets PostgREST exact-count queries avoid row-limit drift.
 */
export function branchMonthUtcRange(monthKey:string,timeZone?:string|null){
  const m=/^(\d{4})-(\d{2})-01$/.exec(monthKey)
  if(!m) throw new Error('invalid_branch_month_key')
  const year=Number(m[1]), month=Number(m[2])
  const zone=normalizeBranchTimeZone(timeZone).zoneLabel
  const offsetHours=zone==='WIT'?9:zone==='WITA'?8:7
  const startMs=Date.UTC(year,month-1,1)-offsetHours*3600_000
  const endMs=Date.UTC(year,month,1)-offsetHours*3600_000
  return {start:new Date(startMs).toISOString(),end:new Date(endMs).toISOString()}
}
