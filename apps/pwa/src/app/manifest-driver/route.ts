import { buildVariantManifest } from '@/lib/variantManifest'
export async function GET() {
  return Response.json(buildVariantManifest('driver'), {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
