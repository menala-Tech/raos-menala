const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  fallbacks: {
    document: '/offline',
  },
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
    runtimeCaching: [
      // ─── Supabase writes (POST/PUT/PATCH/DELETE) — passthrough NetworkOnly.
      // SW tidak intercept multipart upload / mutation, cegah "Failed to
      // fetch" saat upload storage. Offline handling di offlineQueue.ts.
      {
        urlPattern: /^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\/.*/,
        handler: 'NetworkOnly',
        method: 'POST',
        options: { cacheName: 'supabase-mutation' },
      },
      {
        urlPattern: /^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\/.*/,
        handler: 'NetworkOnly',
        method: 'PUT',
        options: { cacheName: 'supabase-mutation' },
      },
      {
        urlPattern: /^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\/.*/,
        handler: 'NetworkOnly',
        method: 'PATCH',
        options: { cacheName: 'supabase-mutation' },
      },
      {
        urlPattern: /^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\/.*/,
        handler: 'NetworkOnly',
        method: 'DELETE',
        options: { cacheName: 'supabase-mutation' },
      },
      // ─── Supabase Storage PUBLIC images (GET) — CacheFirst 30 hari.
      // Chat attachments, selfies, driver photos. URL immutable (path
      // pakai timestamp), aman cache lama.
      {
        urlPattern: /^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
        handler: 'CacheFirst',
        method: 'GET',
        options: {
          cacheName: 'supabase-images',
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      // ─── Supabase REST GET — data referensi statis (branches,
      // pickup_points, shifts). Berubah jarang (edit manual admin),
      // aman di-cache SWR 1 jam supaya offline READ dashboard/scan/
      // absensi tetap jalan. Harus di ATAS rule NetworkOnly umum
      // (Workbox first-match wins).
      {
        urlPattern: /^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\/rest\/v1\/(branches|pickup_points|shifts)(\?.*)?$/i,
        handler: 'StaleWhileRevalidate',
        method: 'GET',
        options: {
          cacheName: 'supabase-ref',
          expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      // ─── Supabase REST GET — profil user sendiri (id=eq.<uuid>).
      // URL punya UUID user → cache per-user, tidak leak. SWR 15 menit.
      // Pattern `id=eq.` HANYA match single-row fetch, bukan pool
      // mentions (yang pakai is_active=eq.true tanpa id=eq.).
      {
        urlPattern: /^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\/rest\/v1\/user_profiles\?.*id=eq\./i,
        handler: 'StaleWhileRevalidate',
        method: 'GET',
        options: {
          cacheName: 'supabase-me',
          expiration: { maxEntries: 5, maxAgeSeconds: 15 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      // ─── Supabase REST/Auth GET lainnya — NetworkOnly (data
      // operasional + RLS sensitive, JANGAN cache — cegah leak antar
      // user + stale data).
      {
        urlPattern: /^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\/.*/,
        handler: 'NetworkOnly',
        method: 'GET',
        options: { cacheName: 'supabase-read' },
      },
      // ─── Next.js static chunks — CacheFirst 60 hari (filename hashed,
      // effectively immutable). Utama supaya SPA shell load offline.
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static',
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 24 * 60 * 60 },
        },
      },
      // ─── Next.js image optimizer /_next/image — StaleWhileRevalidate.
      {
        urlPattern: /\/_next\/image\?.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-image',
          expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      // ─── Local static assets (icons, hero, logo) — CacheFirst 30 hari.
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'local-assets',
          expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      // ─── HTML pages (document navigation) — NetworkFirst dengan
      // network timeout 3s. Kalau offline, serve cached HTML terakhir.
      // Kalau tidak ada cache, fallback ke /offline (via fallbacks.document).
      {
        urlPattern: ({ request }) => request.destination === 'document',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
          networkTimeoutSeconds: 3,
        },
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
