import { buildVariantManifest } from '@/lib/variantManifest'
export async function GET() {
  return Response.json(buildVariantManifest('staff'), {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
