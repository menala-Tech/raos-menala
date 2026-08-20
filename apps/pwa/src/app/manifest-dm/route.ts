import { buildVariantManifest } from '@/lib/variantManifest'
export async function GET(){return Response.json(buildVariantManifest('dm'),{headers:{'Content-Type':'application/manifest+json'}})}
