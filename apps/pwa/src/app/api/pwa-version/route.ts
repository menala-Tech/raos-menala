import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const version = (
    process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.NEXT_PUBLIC_RAOS_PWA_VERSION
    || 'local'
  ).slice(0, 40)

  return NextResponse.json(
    { version },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    },
  )
}
