'use client'

import { useEffect, useId, useRef, useState } from 'react'
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

  // Lifecycle hardening (2026-08-20): unique per-mounted-instance DOM id --
  // previously a fixed literal 'barcode-scanner-region' shared by EVERY
  // BarcodeScanner instance app-wide (this page's camera mode AND
  // /antrian-driver's anti-cheat scanner both use this component). A
  // duplicate DOM id is invalid HTML; Html5Qrcode's internal
  // document.getElementById(id) can then resolve to the wrong (stale/
  // detached) node if two instances are ever briefly alive at once (fast
  // unmount/remount, route transition overlap, React 18 double-invoke in
  // dev). useId() is stable for the lifetime of this component instance
  // and unique per mount, so no two instances can ever collide.
  const rawId = useId()
  const elementId = `barcode-scanner-${rawId.replace(/:/g, '')}`

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

    // Lifecycle hardening (2026-08-20): the previous cleanup called
    // scanner.stop() SYNCHRONOUSLY on unmount, while the async start()
    // chain below could still be mid-flight -- awaiting the camera
    // permission prompt, or deep in the exact-environment ->
    // getCameras() -> facingMode fallback retry chain, which can take
    // several seconds end to end. html5-qrcode's stop() is a no-op/
    // rejection if called before its own internal state has reached
    // "running" (caught below, so it never crashed the route) -- but the
    // ORIGINAL scanner.start() call was never cancelled and kept running
    // in the background regardless. If it went on to succeed AFTER
    // unmount, it silently acquired a getUserMedia() stream that nothing
    // was left to stop: the camera stayed on ("Camera in use") with no
    // visible UI anywhere.
    //
    // Fix: `startedPromise` is the actual promise returned by start().
    // Cleanup now ALWAYS awaits it via `.finally()` before touching the
    // scanner -- so stop() only ever runs once start() has genuinely
    // settled (successfully or not), never mid-negotiation. Whether
    // start() ended up succeeding (camera running) or failing/being
    // skipped (never acquired), this is the single place that decides
    // whether a stop() call is needed, so there is exactly one
    // stop()/clear() call per mount, never zero and never a stray extra.
    let startedPromise: Promise<void> = Promise.resolve()

    async function start() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled || !containerRef.current) return

        const scanner = new Html5Qrcode(elementId)
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
          // Bail before spending another camera-negotiation round trip if
          // we already know this instance is being torn down.
          if (cancelled) return
          try {
            // Fallback: pilih kamera berlabel "back"/"belakang" dari daftar device
            const cameras = await Html5Qrcode.getCameras()
            if (cancelled) return
            const backCam = cameras.find(c => /back|belakang|rear|environment/i.test(c.label))
            await scanner.start(
              backCam ? backCam.id : { facingMode: 'environment' },
              config, onFrame, onFailure
            )
          } catch {
            if (cancelled) return
            await scanner.start({ facingMode: 'environment' }, config, onFrame, onFailure)
          }
        }
      } catch (e: any) {
        // Camera access failure renders local error UI (below) instead of
        // throwing into the route -- but only if this instance is still
        // the one mounted; a cancelled instance's failure is expected
        // noise (we tore it down on purpose) and must not touch state.
        if (!cancelled) {
          setError('Tidak bisa mengakses kamera. Periksa izin kamera di browser.')
        }
      }
    }

    startedPromise = start()

    return () => {
      cancelled = true
      // Never call stop() while start() is still mid-negotiation -- always
      // wait for it to settle first, whatever the outcome.
      startedPromise.finally(() => {
        const scanner = scannerRef.current
        scannerRef.current = null
        if (scanner) {
          scanner.stop().then(() => scanner.clear()).catch(() => {})
        }
      })
    }
    // `onDetected` sengaja tidak perlu masuk deps — hanya diakses lewat
    // onDetectedRef di atas, bukan langsung, jadi exhaustive-deps tidak
    // memintanya. Hanya `active` yang memicu start/stop (mode
    // camera↔manual switch); `elementId` stabil sepanjang hidup instance
    // (useId) dan disertakan murni untuk kelengkapan deps.
  }, [active, elementId])

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
      id={elementId}
      ref={containerRef}
      className="bg-gray-900 rounded-xl overflow-hidden [&_video]:rounded-xl [&_video]:w-full"
      style={{ minHeight: 208 }}
    />
  )
}
