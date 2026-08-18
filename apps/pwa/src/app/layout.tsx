import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import RoleGuard from '@/components/RoleGuard'

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

            // Install variant per role (Opsi C batch 2) — inject <link rel="manifest">
            // based on ?role= query. 5 variant: staff/koord/mgmt/direksi/driver.
            // Chrome fetch manifest saat detect installable → icon variant sesuai URL install.
            var p = new URLSearchParams(location.search);
            var r = (p.get('role') || '').toLowerCase();
            var v = (r === 'koord' || r === 'koordinator') ? 'koord'
                  : (r === 'mgmt' || r === 'management') ? 'mgmt'
                  : (r === 'direksi') ? 'direksi'
                  : (r === 'driver') ? 'driver'
                  : 'staff';
            var link = document.createElement('link');
            link.rel = 'manifest';
            link.href = '/manifest-' + v;
            document.head.appendChild(link);
            // Persist variant di localStorage supaya reload PWA tetap pakai variant sama
            try { localStorage.setItem('raos_install_variant', v); } catch(e) {}
          } catch(e) {}
        `}} />
      </head>
      <body className={`${inter.className} h-full`}>
        <div className="min-h-full max-w-md mx-auto relative">
          {/* B1 fix: canonical RoleGuard existed (roleGuard.ts + RoleGuard.tsx)
              but was never mounted anywhere -- role-route enforcement only
              happened where individual pages happened to add their own
              (inconsistent) auth checks. Mounting it once here at the root
              makes it the single gate for every route: PUBLIC paths (/,
              /reset-password) pass through synchronously via
              canRoleAccessRoute(null, pathname) with no network wait;
              anything else is checked against ROLE_ROUTES after a session/
              profile lookup. No new access matrix -- reuses the existing one
              as-is. */}
          <RoleGuard>{children}</RoleGuard>
        </div>
      </body>
    </html>
  )
}
