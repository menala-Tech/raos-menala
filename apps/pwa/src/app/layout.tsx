import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import RoleGuard from '@/components/RoleGuard'
import PwaRoleManifestSync from '@/components/PwaRoleManifestSync'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MENALA Airport Operation System',
  description: 'MENALA Airport Operation System — operasional multi-cabang',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RAOS',
  },
}

export const viewport: Viewport = {
  themeColor: '#F5A623',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Apply dark mode ASAP dari prefs — cegah flash. Inline script
            supaya jalan sebelum hydration, hindari FOUC. */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var raw = localStorage.getItem('raos_prefs');
            var prefs = raw ? JSON.parse(raw) : {};
            if ((prefs.tema || 'terang') === 'gelap') document.documentElement.classList.add('dark');
            var uk = prefs.ukuranTeks || 'sedang';
            document.documentElement.setAttribute('data-text-size', uk);

            // Initial install variant from explicit URL, then
            // PwaRoleManifestSync below replaces it from authenticated role.
            var p = new URLSearchParams(location.search);
            var r = (p.get('role') || '').toLowerCase();
            var v = (r === 'koord' || r === 'koordinator') ? 'koord'
                  : (r === 'admin') ? 'admin'
                  : (r === 'mgmt' || r === 'management') ? 'mgmt'
                  : (r === 'direksi' || r === 'direktur') ? 'direksi'
                  : (r === 'driver') ? 'driver'
                  : (r === 'dm' || r === 'driver_manager') ? 'dm'
                  : 'staff';
            var link = document.createElement('link');
            link.rel = 'manifest';
            link.href = '/manifest-' + v;
            link.setAttribute('data-raos-role-manifest','1');
            document.head.appendChild(link);
            try { localStorage.setItem('raos_install_variant', v); } catch(e) {}
          } catch(e) {}
        `}} />
      </head>
      <body className={`${inter.className} h-full`}>
        <PwaRoleManifestSync />
        <div className="min-h-full max-w-md mx-auto relative">
          {/* Single app-wide role/route gate. */}
          <RoleGuard>{children}</RoleGuard>
        </div>
      </body>
    </html>
  )
}