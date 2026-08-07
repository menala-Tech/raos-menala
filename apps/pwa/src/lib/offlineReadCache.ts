const CACHE_NAME = 'raos-offline-read-v1'
const SUPABASE_HOST = 'vlievtojpmrbsmzlqswl.supabase.co'
const ALLOWED_PREFIXES = [
  '/rest/v1/user_profiles',
  '/rest/v1/branches',
  '/rest/v1/raos_attendance',
  '/rest/v1/scan_orders',
  '/rest/v1/raos_saldo_requests',
  '/rest/v1/raos_target_tercapai_bulan',
  '/rest/v1/chat_rooms',
  '/rest/v1/chat_room_members',
  '/rest/v1/chat_messages',
]

let installed = false

function bearerFrom(input: RequestInfo | URL, init?: RequestInit) {
  const fromInit = new Headers(init?.headers || {}).get('authorization')
  if (fromInit) return fromInit
  if (input instanceof Request) return input.headers.get('authorization') || ''
  return ''
}

function jwtSub(authHeader: string) {
  if (!authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = raw + '='.repeat((4 - raw.length % 4) % 4)
    const payload = JSON.parse(atob(padded))
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function isAllowedRead(url: URL, input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  return method === 'GET'
    && url.hostname === SUPABASE_HOST
    && ALLOWED_PREFIXES.some(prefix => url.pathname.startsWith(prefix))
}

function cacheKey(uid: string, url: string) {
  const key = new URL('/__raos_offline_read__', window.location.origin)
  key.searchParams.set('uid', uid)
  key.searchParams.set('url', url)
  return new Request(key.toString(), { method: 'GET' })
}

export function installOfflineReadCache() {
  if (installed || typeof window === 'undefined' || !('caches' in window)) return
  installed = true

  const nativeFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = requestUrl(input)
    let url: URL
    try { url = new URL(rawUrl, window.location.origin) } catch { return nativeFetch(input, init) }

    if (!isAllowedRead(url, input, init)) return nativeFetch(input, init)

    const uid = jwtSub(bearerFrom(input, init))
    if (!uid) return nativeFetch(input, init)

    const store = await caches.open(CACHE_NAME)
    const key = cacheKey(uid, url.toString())

    if (!navigator.onLine) {
      const cached = await store.match(key)
      if (cached) return cached.clone()
      return nativeFetch(input, init)
    }

    try {
      const response = await nativeFetch(input, init)
      if (response.ok) await store.put(key, response.clone())
      return response
    } catch (error) {
      const cached = await store.match(key)
      if (cached) return cached.clone()
      throw error
    }
  }
}
