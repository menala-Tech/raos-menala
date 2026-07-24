import { buildVariantManifest } from '@/lib/variantManifest'
export async function GET() {
  return Response.json(buildVariantManifest('direksi'), {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
