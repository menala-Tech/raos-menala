'use client'

import Image from 'next/image'
import clsx from 'clsx'

/**
 * Logo MENALA — brand asli PT. Menala Internasional Gemilang.
 * Sumber: public/images/logo-menala-full.png (horizontal, mark + wordmark
 * + tagline, 1200×268) dan public/images/logo-menala.png (mark saja,
 * 360×268 — juga dipakai generate-icons.js untuk icon PWA square).
 */

interface MarkProps {
  size?: number
  className?: string
}

/** Monogram double-M emas (mark saja, tanpa teks). */
export function MenalaMark({ size = 36, className }: MarkProps) {
  // Aspect mark asli 360:268 ≈ 4:3 — rendered dengan lebar `size` dan
  // tinggi proporsional supaya tetap tajam di HP.
  const w = size
  const h = Math.round(size * (268 / 360))
  return (
    <Image
      src="/images/logo-menala.png"
      alt="Logo MENALA"
      width={w}
      height={h}
      className={clsx('object-contain', className)}
      priority
    />
  )
}

interface Props {
  size?: number
  showText?: boolean
  variant?: 'header' | 'splash'
  /** onNavy = bg gelap (login/header); onLight = bg terang (surface putih) */
  tone?: 'onNavy' | 'onLight'
}

/**
 * Logo full horizontal (mark + wordmark + tagline).
 * - variant='splash' → besar, dipakai halaman login
 * - variant='header' → kecil, dipakai di header semua halaman
 *
 * `showText=false` → cuma monogram (fallback ke MenalaMark).
 * `tone='onNavy'` → logo asli kontras di bg navy (default sesi 14 keatas).
 * `tone='onLight'` → sama saja karena logo full sudah berbg transparan +
 *   wordmark navy — tetap tajam di surface putih.
 */
export default function MenalaLogo({
  size = 36, showText = true, variant = 'header',
}: Props) {
  if (!showText) {
    return <MenalaMark size={size} />
  }

  // Aspect full 1200:268 ≈ 4.48:1
  const isSplash = variant === 'splash'
  const width = isSplash ? Math.max(size, 220) : Math.max(size, 120)
  const height = Math.round(width / (1200 / 268))

  return (
    <Image
      src="/images/logo-menala-full.png"
      alt="MENALA — PT. Menala Internasional Gemilang"
      width={width}
      height={height}
      className="object-contain"
      priority
    />
  )
}
