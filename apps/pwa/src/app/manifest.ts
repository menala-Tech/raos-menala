import { MetadataRoute } from 'next'
import { parseInstallVariant, manifestNameForVariant, VARIANT_LABEL } from '@/lib/roleGuard'

/**
 * Dynamic manifest (Opsi C — 5 install variant).
 *
 * User install PWA dengan URL berbeda per role:
 *   https://raos-menala.vercel.app/           → Staff (default)
 *   https://raos-menala.vercel.app/?role=koord   → Koord
 *   https://raos-menala.vercel.app/?role=mgmt    → Mgmt
 *   https://raos-menala.vercel.app/?role=direksi → Direksi
 *   https://raos-menala.vercel.app/?role=driver  → Driver
 *
 * Icon berbeda per variant (di public/icons/<variant>/). Name juga berbeda
 * supaya install prompt jelas.
 *
 * NOTE: manifest.ts di Next.js App Router jalan sebagai static file di
 * build time — untuk true dynamic (query-based), kita render static
 * default (staff) + kasih instruksi user di /settings/bantuan.
 * Alternatif dinamis: route handler /manifest.json.
 * Untuk sekarang, kasih 1 static manifest (staff default) dan kasih
 * dokumentasi install untuk 4 variant lain nanti.
 */
export default function manifest(): MetadataRoute.Manifest {
  const variant = parseInstallVariant(null) // default staff untuk static build
  const { name, short } = manifestNameForVariant(variant)
  const label = VARIANT_LABEL[variant]

  return {
    name,
    short_name: short,
    description: `RAOS ${label} — Sistem Operasional 9 Cabang RIFIM`,
    start_url: '/',
    display: 'standalone',
    background_color: '#1A1A2E',
    theme_color: '#F5A623',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-72x72.png',   sizes: '72x72',   type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-96x96.png',   sizes: '96x96',   type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
