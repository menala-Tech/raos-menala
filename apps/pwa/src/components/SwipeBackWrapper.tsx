'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

const EDGE_ZONE = 24        // px dari tepi kiri layar untuk mulai gesture
const TRIGGER_DISTANCE = 90 // px geser untuk memicu navigasi kembali
const MAX_DRAG = 120        // batas maksimal geser visual (efek resistance)

/**
 * Swipe-to-go-back untuk mode PWA standalone (Add to Home Screen).
 * Browser biasa sudah punya gesture ini secara native; iOS/Android standalone
 * PWA tidak menyediakannya, jadi kita replikasi secara manual.
 * Tidak aktif di /dashboard (halaman utama, tidak ada "kembali" yang relevan).
 */
interface Props {
  children: React.ReactNode
  /** Override aksi "kembali" — default router.back(). Pakai ini untuk sub-view
   *  yang navigasinya berbasis state lokal (mis. keluar dari room chat). */
  onBack?: () => void
  /** Nonaktifkan gesture secara eksplisit (mis. di halaman utama/root). */
  disabled?: boolean
}

export default function SwipeBackWrapper({ children, onBack, disabled }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const containerRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ startX: 0, startY: 0, active: false, dx: 0 })

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    if (!isStandalone || disabled || (!onBack && pathname === '/dashboard')) return

    const container = containerRef.current
    const indicator = indicatorRef.current
    if (!container) return

    function setTransform(dx: number) {
      container!.style.transform = dx ? `translateX(${dx}px)` : ''
      container!.style.transition = dx ? 'none' : 'transform 0.2s ease-out'
      if (indicator) {
        indicator.style.opacity = dx > 12 ? Math.min(dx / TRIGGER_DISTANCE, 1).toString() : '0'
      }
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0]
      if (t.clientX > EDGE_ZONE) return
      stateRef.current = { startX: t.clientX, startY: t.clientY, active: true, dx: 0 }
    }

    function onTouchMove(e: TouchEvent) {
      const s = stateRef.current
      if (!s.active) return
      const t = e.touches[0]
      const dx = t.clientX - s.startX
      const dy = t.clientY - s.startY
      // Geser lebih vertikal dari horizontal → ini scroll biasa, batalkan gesture
      if (Math.abs(dy) > Math.abs(dx) + 10) {
        s.active = false
        setTransform(0)
        return
      }
      if (dx < 0) return
      s.dx = Math.min(dx, MAX_DRAG)
      setTransform(s.dx)
    }

    function onTouchEnd() {
      const s = stateRef.current
      if (s.active && s.dx > TRIGGER_DISTANCE) {
        if (onBack) onBack()
        else router.back()
      }
      setTransform(0)
      stateRef.current.active = false
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [pathname, router, onBack, disabled])

  return (
    <div ref={containerRef}>
      <div
        ref={indicatorRef}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-secondary text-white
                   rounded-r-xl p-2 opacity-0 pointer-events-none"
      >
        <ChevronLeft size={20} />
      </div>
      {children}
    </div>
  )
}
