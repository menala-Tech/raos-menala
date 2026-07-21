const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  // Service Worker baru langsung take over tanpa menunggu semua tab RAOS
  // ditutup — biar update code (contoh: fix bug scan/barcode) langsung
  // aktif setelah refresh, tidak nyangkut di bundle lama yang bikin
  // "This page couldn't load".
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
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
