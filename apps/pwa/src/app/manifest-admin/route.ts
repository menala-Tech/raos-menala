import { buildVariantManifest } from '@/lib/variantManifest'
export async function GET(){return Response.json(buildVariantManifest('admin'),{headers:{'Content-Type':'application/manifest+json'}})}
