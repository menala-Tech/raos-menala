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
    // JANGAN cache/handle request ke Supabase API — mereka realtime & auth
    // sensitive. Kalau di-precache atau di-intercept salah, upload storage
    // (mis. kirim foto/file/voice di chat) bisa gagal "Failed to fetch"
    // karena SW proxy fetch ke handler yang tidak siap POST.
    // Sumber URL: NEXT_PUBLIC_SUPABASE_URL — hard-code hostname supaya
    // tidak butuh env di build-time SW.
    exclude: [/^https:\/\/vlievtojpmrbsmzlqswl\.supabase\.co\//],
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
