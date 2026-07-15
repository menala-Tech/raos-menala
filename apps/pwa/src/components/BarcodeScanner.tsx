'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'

interface Props {
  onDetected: (code: string) => void
  active: boolean
}

export default function BarcodeScanner({ onDetected, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<any>(null)
  const [error, setError] = useState('')
  const lastDetectedRef = useRef<{ code: string; at: number } | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false

    async function start() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled || !containerRef.current) return

        const scanner = new Html5Qrcode('barcode-scanner-region')
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText: string) => {
            // Debounce: hindari deteksi berulang kode yang sama dalam 3 detik
            const now = Date.now()
            const last = lastDetectedRef.current
            if (last && last.code === decodedText && now - last.at < 3000) return
            lastDetectedRef.current = { code: decodedText, at: now }
            onDetected(decodedText)
          },
          () => { /* frame tanpa barcode — abaikan, ini dipanggil terus-menerus */ }
        )
      } catch (e: any) {
        if (!cancelled) {
          setError('Tidak bisa mengakses kamera. Periksa izin kamera di browser.')
        }
      }
    }

    start()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {})
      }
    }
  }, [active, onDetected])

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl h-52 flex flex-col items-center justify-center gap-2 px-4">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-white/70 text-xs text-center">{error}</p>
      </div>
    )
  }

  return (
    <div
      id="barcode-scanner-region"
      ref={containerRef}
      className="bg-gray-900 rounded-xl overflow-hidden [&_video]:rounded-xl [&_video]:w-full"
      style={{ minHeight: 208 }}
    />
  )
}
