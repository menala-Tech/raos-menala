'use client'
import Image from 'next/image'

interface Props {
  size?: number
  showText?: boolean
  variant?: 'header' | 'splash'
}

export default function MenalaLogo({ size = 36, showText = true, variant = 'header' }: Props) {
  if (variant === 'splash') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div
          className="rounded-full overflow-hidden ring-4 ring-primary/50 ring-offset-2 ring-offset-secondary shadow-2xl bg-white"
          style={{ width: size, height: size }}
        >
          <Image
            src="/images/logo-menala.png"
            alt="Logo MENALA"
            width={size}
            height={size}
            className="object-cover w-full h-full"
            priority
          />
        </div>
        {showText && (
          <div className="text-center">
            <p className="text-primary font-black text-2xl tracking-widest leading-none">
              MENALA
            </p>
            <p className="text-white/60 text-[10px] font-semibold tracking-[0.2em] mt-1 uppercase">
              Airport Operation System
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div
        className="rounded-full overflow-hidden ring-2 ring-primary/60 shadow-md bg-white flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src="/images/logo-menala.png"
          alt="Logo MENALA"
          width={size}
          height={size}
          className="object-cover w-full h-full"
          priority
        />
      </div>
      {showText && (
        <div className="leading-none">
          <p className="text-primary font-black text-sm tracking-wider leading-none">MENALA</p>
          <p className="text-white/50 text-[9px] font-medium leading-none mt-0.5 tracking-wide">
            AIRPORT OPERATION SYSTEM
          </p>
        </div>
      )}
    </div>
  )
}
