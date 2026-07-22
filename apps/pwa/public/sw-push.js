// RAOS Web Push handler — di-import oleh next-pwa via importScripts di
// public/sw.js (kalau ada) atau attach manual via workboxOptions.additionalManifestEntries.
//
// Push event: browser fire ini bahkan saat app closed & layar terkunci.
// showNotification({vibrate, requireInteraction}) memicu Android/iOS
// tampilkan banner di lock screen + suara + getar.

self.addEventListener('push', function (event) {
  let title = 'MENALA RAOS'
  let body = 'Notifikasi baru'
  let url = '/'
  let tag = 'raos-notif'

  try {
    const d = event.data ? event.data.json() : {}
    if (d.title) title = d.title
    if (d.body) body = d.body
    if (d.url) url = d.url
    if (d.tag) tag = d.tag
  } catch (e) {
    try { body = event.data ? event.data.text() : body } catch (e2) {}
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: tag,
      requireInteraction: true,   // Notif tetap di lock screen sampai user tap
      renotify: true,             // Suara + getar ulang walau tag sama
      vibrate: [200, 100, 200, 100, 500],
      data: { url: url },
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
