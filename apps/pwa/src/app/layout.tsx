import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MENALA Airport Operation System',
  description: 'Sistem Operasional Bandara Soekarno-Hatta',
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
          } catch(e) {}
        `}} />
      </head>
      <body className={`${inter.className} h-full`}>
        <div className="min-h-full max-w-md mx-auto relative">
          {children}
        </div>
      </body>
    </html>
  )
}
