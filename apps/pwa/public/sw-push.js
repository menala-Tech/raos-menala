// RAOS Web Push handler — imported into generated Workbox SW by next-pwa.
//
// Push events are delivered by the browser even when the PWA UI is closed.
// OS sound still follows device/browser notification-channel policy; the PWA
// cannot override mute/DND. Vibration is requested when user prefs allow it.

function normalizeTargetUrl(raw) {
  const fallback = '/dashboard'
  try {
    const candidate = new URL(typeof raw === 'string' && raw ? raw : fallback, self.location.origin)
    if (candidate.origin !== self.location.origin) return fallback
    return candidate.pathname + candidate.search + candidate.hash
  } catch (_) {
    return fallback
  }
}

self.addEventListener('push', function (event) {
  let title = 'MENALA RAOS'
  let body = 'Notifikasi baru'
  let url = '/dashboard'
  let tag = 'raos-notif'
  let silent = false
  let vibrate = [200, 100, 200, 100, 500]

  try {
    const d = event.data ? event.data.json() : {}
    if (d.title) title = String(d.title).slice(0, 100)
    if (d.body) body = String(d.body).slice(0, 300)
    if (d.url) url = normalizeTargetUrl(d.url)
    if (d.tag) tag = String(d.tag).slice(0, 120)
    if (typeof d.silent === 'boolean') silent = d.silent
    if (d.vibrate === false) vibrate = []
    else if (Array.isArray(d.vibrate)) vibrate = d.vibrate.slice(0, 12)
  } catch (_) {
    try { body = event.data ? event.data.text().slice(0, 300) : body } catch (_) {}
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-96x96.png',
      badge: '/icons/icon-72x72.png',
      tag,
      requireInteraction: false,
      renotify: true,
      silent,
      vibrate,
      data: { url: normalizeTargetUrl(url) },
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const targetUrl = normalizeTargetUrl(event.notification.data && event.notification.data.url)

  event.waitUntil((async function () {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const absoluteTarget = new URL(targetUrl, self.location.origin).href

    // Exact deep link already open → focus it.
    for (const client of clientList) {
      if (client.url === absoluteTarget && 'focus' in client) return client.focus()
    }

    // Reuse an existing RAOS window instead of opening duplicates, and route
    // it to the notification destination before focusing.
    for (const client of clientList) {
      try {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin !== self.location.origin) continue
        if ('navigate' in client) await client.navigate(targetUrl)
        if ('focus' in client) return client.focus()
      } catch (_) {}
    }

    if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
  })())
})

// Explicit compatibility hook for manual update requests. Workbox already has
// skipWaiting=true, but this also handles a waiting worker deterministically.
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})
