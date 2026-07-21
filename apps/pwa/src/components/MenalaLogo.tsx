'use client'

import Image from 'next/image'
import clsx from 'clsx'

/**
 * Logo MENALA — brand asli PT. Menala Internasional Gemilang.
 *
 * Aset sumber:
 * - public/images/logo-menala.png (mark saja, 360×268) — dipakai standalone
 *   MenalaMark + sumber generate-icons.js untuk semua icon PWA.
 * - public/images/logo-menala-full.png (horizontal 1200×268, mark + wordmark
 *   MENALA navy + tagline navy) — di-embed via MenalaLogo hanya untuk
 *   surface bg TERANG (misal laporan PDF). Tidak dipakai di UI app karena
 *   header/splash pakai bg navy → wordmark navy jadi tidak terbaca.
 *
 * Untuk header/splash navy: MenalaLogo render mark PNG + teks "MENALA" dan
 * tagline dalam warna putih supaya kontras terhadap bg navy.
 */

interface MarkProps {
  size?: number
  className?: string
}

/** Monogram double-M emas (mark saja, tanpa teks). Bg mark asli transparan. */
export function MenalaMark({ size = 36, className }: MarkProps) {
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
  /** onNavy = default, wordmark PUTIH. onLight = wordmark NAVY (surface putih). */
  tone?: 'onNavy' | 'onLight'
}

export default function MenalaLogo({
  size = 36, showText = true, variant = 'header', tone = 'onNavy',
}: Props) {
  if (!showText) return <MenalaMark size={size} />

  const wordColor = tone === 'onLight' ? 'text-secondary' : 'text-white'
  const subColor  = tone === 'onLight' ? 'text-secondary/70' : 'text-white/70'

  if (variant === 'splash') {
    return (
      <div className="flex flex-col items-center gap-3">
        <MenalaMark size={size} className="drop-shadow-[0_4px_16px_rgba(245,197,24,0.35)]" />
        <div className="text-center">
          <p className={`${wordColor} font-black text-3xl tracking-[0.18em] leading-none`}>
            MENALA
          </p>
          <p className={`${subColor} text-[10px] font-semibold tracking-[0.14em] mt-1.5 uppercase`}>
            PT. Menala Internasional Gemilang
          </p>
        </div>
      </div>
    )
  }

  // header — kompak horizontal
  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <MenalaMark size={size} />
      <div className="leading-none">
        <p className={`${wordColor} font-black text-sm tracking-[0.15em] leading-none`}>MENALA</p>
        <p className={`${subColor} text-[7.5px] font-semibold leading-none mt-1 tracking-[0.08em] uppercase`}>
          PT. Menala Internasional Gemilang
        </p>
      </div>
    </div>
  )
}
