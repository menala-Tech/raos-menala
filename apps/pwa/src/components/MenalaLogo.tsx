'use client'

/**
 * Logo MENALA — brand asli PT. Menala Internasional Gemilang.
 * Monogram double-M emas (SVG vektor, tajam di semua ukuran) + wordmark.
 * Referensi: brand Menala 1.png / Brand menala 2.png di folder utama proyek.
 */

interface MarkProps {
  size?: number
  className?: string
}

/** Monogram double-M emas dengan gradient gold premium */
export function MenalaMark({ size = 36, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 104"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo MENALA"
    >
      <defs>
        <linearGradient id="mnl-gold" x1="60" y1="0" x2="60" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE775" />
          <stop offset="35%" stopColor="#F5C518" />
          <stop offset="75%" stopColor="#D99E0B" />
          <stop offset="100%" stopColor="#B67F06" />
        </linearGradient>
        <linearGradient id="mnl-gold-deep" x1="60" y1="20" x2="60" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0BC12" />
          <stop offset="100%" stopColor="#9C6D05" />
        </linearGradient>
      </defs>

      {/* Bayangan tipis untuk kesan emboss 3D */}
      <g fill="#7A5500" opacity="0.5" transform="translate(0 2.2)">
        <polygon points="18,42 60,2 102,42 102,58 60,18 18,58" />
        <polygon points="30,58 60,30 90,58 90,74 60,46 30,74" />
        <polygon points="44,62 60,77 76,62 76,80 60,95 44,80" />
        <rect x="18" y="62" width="12" height="40" />
        <rect x="90" y="62" width="12" height="40" />
        <rect x="34" y="78" width="10" height="24" />
        <rect x="76" y="78" width="10" height="24" />
      </g>

      {/* Chevron atas (M luar) */}
      <polygon points="18,42 60,2 102,42 102,58 60,18 18,58" fill="url(#mnl-gold)" />
      {/* Chevron dalam (M kedua) */}
      <polygon points="30,58 60,30 90,58 90,74 60,46 30,74" fill="url(#mnl-gold)" />
      {/* Pusat V huruf M (mengarah ke bawah) */}
      <polygon points="44,62 60,77 76,62 76,80 60,95 44,80" fill="url(#mnl-gold-deep)" />
      {/* Kaki-kaki M */}
      <rect x="18" y="62" width="12" height="40" fill="url(#mnl-gold-deep)" />
      <rect x="90" y="62" width="12" height="40" fill="url(#mnl-gold-deep)" />
      <rect x="34" y="78" width="10" height="24" fill="url(#mnl-gold-deep)" />
      <rect x="76" y="78" width="10" height="24" fill="url(#mnl-gold-deep)" />

      {/* Kilau highlight di chevron atas */}
      <polygon points="18,42 60,2 102,42 100,44 60,6 20,44" fill="#FFF3B0" opacity="0.7" />
    </svg>
  )
}

interface Props {
  size?: number
  showText?: boolean
  variant?: 'header' | 'splash'
  /** onNavy = wordmark putih (default, header gelap); onLight = wordmark navy */
  tone?: 'onNavy' | 'onLight'
}

export default function MenalaLogo({
  size = 36, showText = true, variant = 'header', tone = 'onNavy',
}: Props) {
  const wordColor = tone === 'onLight' ? 'text-secondary' : 'text-white'
  const subColor  = tone === 'onLight' ? 'text-secondary/60' : 'text-white/60'

  if (variant === 'splash') {
    return (
      <div className="flex flex-col items-center gap-3">
        <MenalaMark size={size} className="drop-shadow-[0_4px_16px_rgba(245,197,24,0.35)]" />
        {showText && (
          <div className="text-center">
            <p className={`${wordColor} font-black text-3xl tracking-[0.18em] leading-none`}>
              MENALA
            </p>
            <p className={`${subColor} text-[10px] font-semibold tracking-[0.14em] mt-1.5 uppercase`}>
              PT. Menala Internasional Gemilang
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <MenalaMark size={size} />
      {showText && (
        <div className="leading-none">
          <p className={`${wordColor} font-black text-sm tracking-[0.15em] leading-none`}>MENALA</p>
          <p className={`${subColor} text-[7.5px] font-semibold leading-none mt-1 tracking-[0.08em] uppercase`}>
            PT. Menala Internasional Gemilang
          </p>
        </div>
      )}
    </div>
  )
}
