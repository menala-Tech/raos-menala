import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import RoleGuard from '@/components/RoleGuard'
import OfflineReadCacheBootstrap from '@/components/OfflineReadCacheBootstrap'
import OfflineBadge from '@/components/OfflineBadge'
import PwaRoleManifestSync from '@/components/PwaRoleManifestSync'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MENALA Airport Operation System',
  description: 'MENALA Airport Operation System — operasional multi-cabang',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'RAOS' },
}

export const viewport: Viewport = { themeColor: '#F5A623', width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full">
      <head>
        <link rel="manifest" href="/manifest-staff" data-raos-role-manifest="1" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var raw = localStorage.getItem('raos_prefs');
            var prefs = raw ? JSON.parse(raw) : {};
            if ((prefs.tema || 'terang') === 'gelap') document.documentElement.classList.add('dark');
            var uk = prefs.ukuranTeks || 'sedang';
            document.documentElement.setAttribute('data-text-size', uk);
          } catch(e) {}
        `}} />
      </head>
      <body className={`${inter.className} h-full`}>
        <PwaRoleManifestSync />
        <OfflineReadCacheBootstrap />
        <OfflineBadge />
        <div className="min-h-full max-w-md mx-auto relative"><RoleGuard>{children}</RoleGuard></div>
      </body>
    </html>
  )
}
