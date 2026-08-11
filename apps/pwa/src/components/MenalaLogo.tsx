'use client'
import Image from 'next/image'
import clsx from 'clsx'
interface MarkProps{size?:number;className?:string;priority?:boolean}
export function MenalaMark({size=36,className,priority=false}:MarkProps){
 const w=size,h=Math.round(size*(268/360))
 return <Image src="/images/logo-menala.png" alt="Logo MENALA" width={w} height={h} className={clsx('object-contain',className)} priority={priority}/>
}
interface Props{size?:number;showText?:boolean;variant?:'header'|'splash';tone?:'onNavy'|'onLight'}
export default function MenalaLogo({size=36,showText=true,variant='header',tone='onNavy'}:Props){
 if(!showText)return <MenalaMark size={size} priority={variant==='splash'}/>
 const word=tone==='onLight'?'text-secondary':'text-white',sub=tone==='onLight'?'text-secondary/70':'text-white/70'
 if(variant==='splash')return <div className="flex flex-col items-center gap-3"><MenalaMark size={size} priority className="drop-shadow-[0_4px_16px_rgba(245,197,24,0.35)]"/><div className="text-center"><p className={`${word} font-black text-3xl tracking-[0.18em] leading-none`}>MENALA</p><p className={`${sub} text-[10px] font-semibold tracking-[0.14em] mt-1.5 uppercase`}>PT. Menala Internasional Gemilang</p></div></div>
 return <div className="flex items-center gap-2.5 flex-shrink-0"><MenalaMark size={size}/><div className="leading-none"><p className={`${word} font-black text-sm tracking-[0.15em] leading-none`}>MENALA</p><p className={`${sub} text-[7.5px] font-semibold leading-none mt-1 tracking-[0.08em] uppercase`}>PT. Menala Internasional Gemilang</p></div></div>
}
