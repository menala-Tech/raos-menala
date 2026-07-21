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

  // Simpan callback terbaru di ref supaya `onDetected` yang berubah reference
  // (mis. karena parent pakai useCallback([location, geofence]) dan GPS tiered
  // refine update state 2-3x dalam detik pertama) TIDAK memicu useEffect di
  // bawah restart kamera. Sebelumnya bug ini bikin race condition html5-qrcode
  // start/stop bertumpuk → error boundary Next.js → "This page couldn't load".
  const onDetectedRef = useRef(onDetected)
  useEffect(() => { onDetectedRef.current = onDetected }, [onDetected])

  useEffect(() => {
    if (!active) return
    let cancelled = false

    async function start() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled || !containerRef.current) return

        const scanner = new Html5Qrcode('barcode-scanner-region')
        scannerRef.current = scanner

        const onFrame = (decodedText: string) => {
          // Debounce: hindari deteksi berulang kode yang sama dalam 3 detik
          const now = Date.now()
          const last = lastDetectedRef.current
          if (last && last.code === decodedText && now - last.at < 3000) return
          lastDetectedRef.current = { code: decodedText, at: now }
          onDetectedRef.current(decodedText)
        }
        const onFailure = () => { /* frame tanpa barcode — abaikan, ini dipanggil terus-menerus */ }
        const config = { fps: 10, qrbox: { width: 250, height: 150 } }

        // Wajibkan kamera belakang (exact) — cocok untuk scan barcode kendaraan.
        // Fallback ke ideal/kamera manapun hanya jika device benar-benar tidak punya kamera belakang.
        try {
          await scanner.start({ facingMode: { exact: 'environment' } }, config, onFrame, onFailure)
        } catch {
          try {
            // Fallback: pilih kamera berlabel "back"/"belakang" dari daftar device
            const cameras = await Html5Qrcode.getCameras()
            const backCam = cameras.find(c => /back|belakang|rear|environment/i.test(c.label))
            await scanner.start(
              backCam ? backCam.id : { facingMode: 'environment' },
              config, onFrame, onFailure
            )
          } catch {
            await scanner.start({ facingMode: 'environment' }, config, onFrame, onFailure)
          }
        }
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
    // Sengaja tidak include onDetected — pakai ref di atas. Hanya `active` yang
    // memicu start/stop (mode camera↔manual switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

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
