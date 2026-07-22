'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

const EDGE_ZONE = 24        // px dari tepi kiri layar untuk mulai gesture
const TRIGGER_DISTANCE = 90 // px geser untuk memicu navigasi kembali
const MAX_DRAG = 120        // batas maksimal geser visual (efek resistance)

// Module-level registry — wrapper dengan onBack (mis. room chat) daftar diri.
// Wrapper tanpa onBack (AppShell luar, fallback router.back) skip kalau ada
// inner yang aktif. Mencegah double-fire yang bikin swipe dari room lompat
// ke halaman sebelum-sebelumnya (mis. /settings → /dashboard).
const activeInnerHandlers = new Set<() => void>()

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

    // Registry: wrapper dengan onBack daftar diri di module set. Wrapper
    // tanpa onBack skip kalau ada wrapper inner terdaftar (cegah double fire).
    const handlerToken = () => {}
    if (onBack) activeInnerHandlers.add(handlerToken)

    function setTransform(dx: number) {
      container!.style.transform = dx ? `translateX(${dx}px)` : ''
      container!.style.transition = dx ? 'none' : 'transform 0.2s ease-out'
      if (indicator) {
        indicator.style.opacity = dx > 12 ? Math.min(dx / TRIGGER_DISTANCE, 1).toString() : '0'
      }
    }

    function onTouchStart(e: TouchEvent) {
      // Kalau wrapper ini fallback (tanpa onBack, mis. AppShell luar) dan ada
      // inner wrapper aktif (mis. room chat), diamkan — inner yang handle.
      if (!onBack && activeInnerHandlers.size > 0) return
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

    function onTouchEnd(e: TouchEvent) {
      const s = stateRef.current
      if (s.active && s.dx > TRIGGER_DISTANCE) {
        // Cegah wrapper luar (mis. AppShell) ikut fire kalau wrapper ini
        // sudah handle swipe back — target berbeda (setActiveRoom vs router.back).
        e.stopPropagation()
        if (onBack) onBack()
        else router.back()
      }
      setTransform(0)
      stateRef.current.active = false
    }

    // Attach ke container-nya sendiri (BUKAN document) — kalau ada 2 wrapper
    // nested (mis. AppShell luar + room-chat dalam), keduanya tidak akan
    // sama-sama fire; wrapper terdalam handle event dulu, event.stopPropagation
    // di onTouchEnd cegah wrapper luar ikut trigger router.back().
    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: true })
    container.addEventListener('touchend', onTouchEnd)
    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      if (onBack) activeInnerHandlers.delete(handlerToken)
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
