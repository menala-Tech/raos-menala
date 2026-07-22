const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    // Push notification handler — extend SW next-pwa dengan sw-push.js
    // (importScripts prepend ke sw.js hasil build). Handle event 'push'
    // + 'notificationclick' untuk lock-screen notif Android/iOS via
    // Web Push API + VAPID (bukan FCM).
    importScripts: ['/sw-push.js'],
    // Precache exclude: SW build-time tidak precache asset Supabase
    exclude: [/^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\//],
    // Runtime: JANGAN intercept apapun ke Supabase. Kalau SW handle POST
    // upload storage, bisa fail "Failed to fetch" karena workbox default
    // handler tidak siap untuk multipart/form-data upload. NetworkOnly =
    // SW straight passthrough ke browser fetch, tanpa cache/proxy.
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\/.*/,
        handler: 'NetworkOnly',
        options: { cacheName: 'supabase-passthrough' },
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { hostname: 'vlievtojpmrbsmzlqswl.supabase.co' },
    ],
  },
}

module.exports = withPWA(nextConfig)
