export const OFFLINE_READ_CACHE_VERSION='p3.1-reaudit-fix' as const
const CACHE_NAME='raos-offline-read-v3'
const LEGACY_CACHE_NAMES=['raos-offline-read-v1','raos-offline-read-v2']
const SCOPE_PREFIX='raos_offline_scope_v3_'

type OfflineScope={
  userId:string
  role:string
  branchId:string|null
  profileVersion:string
}

function configuredSupabaseHost(){
  const raw=process.env.NEXT_PUBLIC_SUPABASE_URL
  if(!raw)return null
  try{return new URL(raw).hostname}catch{return null}
}
const ALLOWED_PREFIXES=[
  '/rest/v1/user_profiles',
  '/rest/v1/branches',
  '/rest/v1/system_config',
  '/rest/v1/raos_attendance',
  '/rest/v1/scan_orders',
  '/rest/v1/raos_saldo_requests',
  '/rest/v1/raos_target_tercapai_bulan',
  '/rest/v1/raos_kpi_targets_branch',
  '/rest/v1/raos_kpi_targets_staff',
  '/rest/v1/raos_drivers',
  '/rest/v1/raos_driver_queue',
  '/rest/v1/chat_rooms',
  '/rest/v1/chat_room_members',
  '/rest/v1/chat_messages',
  '/rest/v1/notifications',
]
let installed=false
function bearerFrom(input:RequestInfo|URL,init?:RequestInit){const h=new Headers(init?.headers||{}).get('authorization');if(h)return h;if(input instanceof Request)return input.headers.get('authorization')||'';return ''}
function jwtSub(h:string){if(!h.startsWith('Bearer '))return null;const p=h.slice(7).trim().split('.');if(p.length<2)return null;try{const raw=p[1].replace(/-/g,'+').replace(/_/g,'/'),pad=raw+'='.repeat((4-raw.length%4)%4),v=JSON.parse(atob(pad));return typeof v.sub==='string'&&v.sub?v.sub:null}catch{return null}}
function requestUrl(input:RequestInfo|URL){if(typeof input==='string')return input;if(input instanceof URL)return input.href;return input.url}
function allowed(url:URL,input:RequestInfo|URL,init?:RequestInit){const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase(),host=configuredSupabaseHost();return method==='GET'&&!!host&&url.hostname===host&&ALLOWED_PREFIXES.some(p=>url.pathname.startsWith(p))}
function normalizeRole(role:string){return String(role||'unknown').trim().toLowerCase()||'unknown'}
function scopeStorageKey(uid:string){return `${SCOPE_PREFIX}${uid}`}
function scopeFingerprint(scope:OfflineScope){return [scope.userId,normalizeRole(scope.role),scope.branchId??'none',scope.profileVersion||'unknown'].join('|')}
function readScope(uid:string){
  if(typeof window==='undefined')return null
  try{
    const raw=sessionStorage.getItem(scopeStorageKey(uid))
    if(!raw)return null
    const parsed=JSON.parse(raw) as OfflineScope
    if(parsed.userId!==uid||!parsed.profileVersion)return null
    return scopeFingerprint(parsed)
  }catch{return null}
}
function cacheKey(uid:string,scope:string,url:string){
  const k=new URL('/__raos_offline_read__',window.location.origin)
  k.searchParams.set('uid',uid)
  k.searchParams.set('scope',scope)
  k.searchParams.set('url',url)
  return new Request(k.toString())
}

export async function clearOfflineReadCache(){
  if(typeof window==='undefined'||!('caches'in window))return false
  const results=await Promise.all([CACHE_NAME,...LEGACY_CACHE_NAMES].map(n=>caches.delete(n)))
  return results.some(Boolean)
}

export async function clearOfflineReadCacheForUser(userId:string){
  if(typeof window==='undefined'||!('caches'in window)||!userId)return 0
  let removed=0
  for(const name of [CACHE_NAME,...LEGACY_CACHE_NAMES]){
    const store=await caches.open(name)
    const keys=await store.keys()
    for(const key of keys){
      try{
        const u=new URL(key.url)
        if(u.searchParams.get('uid')===userId && await store.delete(key)) removed++
      }catch{/* ignore malformed cache key */}
    }
  }
  return removed
}

/** Install/update the authorization-scope fingerprint for private READ cache.
 * Any role/branch/profile-version change invalidates previous entries for the
 * same user before a new scope becomes eligible for offline reuse.
 */
export async function setOfflineReadScope(scope:OfflineScope){
  if(typeof window==='undefined'||!scope.userId)return false
  const key=scopeStorageKey(scope.userId)
  const next=scopeFingerprint(scope)
  let previous:string|null=null
  try{
    const raw=sessionStorage.getItem(key)
    if(raw) previous=scopeFingerprint(JSON.parse(raw) as OfflineScope)
  }catch{/* malformed old scope is treated as changed */}
  if(previous&&previous!==next)await clearOfflineReadCacheForUser(scope.userId)
  sessionStorage.setItem(key,JSON.stringify({...scope,role:normalizeRole(scope.role)}))
  return previous!==next
}

export async function clearOfflineReadScope(userId?:string|null){
  if(typeof window==='undefined')return
  if(userId){
    sessionStorage.removeItem(scopeStorageKey(userId))
    await clearOfflineReadCacheForUser(userId)
    return
  }
  for(let i=sessionStorage.length-1;i>=0;i--){
    const key=sessionStorage.key(i)
    if(key?.startsWith(SCOPE_PREFIX))sessionStorage.removeItem(key)
  }
  await clearOfflineReadCache()
}

export function installOfflineReadCache(){
  if(installed||typeof window==='undefined'||!('caches'in window))return
  installed=true
  const nativeFetch=window.fetch.bind(window)
  window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    let url:URL
    try{url=new URL(requestUrl(input),window.location.origin)}catch{return nativeFetch(input,init)}
    if(!allowed(url,input,init))return nativeFetch(input,init)
    const uid=jwtSub(bearerFrom(input,init))
    if(!uid)return nativeFetch(input,init)
    // Fail closed: before the profile scope is resolved, do not cache private
    // REST responses at all. This prevents stale data from an old role/branch
    // being reused during login/profile transitions.
    const scope=readScope(uid)
    if(!scope)return nativeFetch(input,init)
    const store=await caches.open(CACHE_NAME),key=cacheKey(uid,scope,url.toString())
    if(!navigator.onLine){
      const cached=await store.match(key)
      if(cached)return cached.clone()
      return nativeFetch(input,init)
    }
    try{
      const response=await nativeFetch(input,init)
      const noStore=(response.headers.get('cache-control')||'').toLowerCase().includes('no-store')
      if(response.ok && !noStore) await store.put(key,response.clone())
      return response
    }catch(error){
      const cached=await store.match(key)
      if(cached)return cached.clone()
      throw error
    }
  }
}
