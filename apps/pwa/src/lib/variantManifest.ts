import { InstallVariant, manifestNameForVariant, VARIANT_LABEL } from './roleGuard'

/**
 * Build Web App Manifest JSON per install variant.
 * Icon dari public/icons/<variant>/ folder (di-generate lewat
 * scripts/generate-icons-variants.js).
 */
export function buildVariantManifest(variant: InstallVariant) {
  const { name, short } = manifestNameForVariant(variant)
  const label = VARIANT_LABEL[variant]
  const base = `/icons/${variant}`
  return {
    name,
    short_name: short,
    description: `MENALA RAOS ${label} — 9 Cabang RIFIM`,
    start_url: `/?role=${variant}`,
    display: 'standalone',
    background_color: '#1A1A2E',
    theme_color: '#F5A623',
    orientation: 'portrait',
    icons: [
      { src: `${base}/icon-72x72.png`,   sizes: '72x72',   type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-96x96.png`,   sizes: '96x96',   type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-128x128.png`, sizes: '128x128', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-144x144.png`, sizes: '144x144', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-152x152.png`, sizes: '152x152', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-384x384.png`, sizes: '384x384', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/maskable-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: `${base}/maskable-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
