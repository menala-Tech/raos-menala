'use client'
import MenalaLogo from './MenalaLogo'
export default function BrandLoadingShell({label='Memuat data...'}:{label?:string}){
 return <div className="min-h-screen bg-secondary flex flex-col">
  <div className="px-5 pt-12 pb-8 flex justify-center"><MenalaLogo size={72} variant="splash" tone="onNavy"/></div>
  <div className="bg-white rounded-t-3xl flex-1 px-5 py-6 space-y-3 animate-pulse">
   <div className="h-4 w-28 rounded bg-gray-200"/>
   <div className="grid grid-cols-2 gap-3"><div className="h-24 rounded-2xl bg-gray-100"/><div className="h-24 rounded-2xl bg-gray-100"/></div>
   <div className="h-16 rounded-2xl bg-gray-100"/><div className="h-16 rounded-2xl bg-gray-100"/>
   <p className="text-center text-xs text-gray-400 pt-2 animate-none">{label}</p>
  </div>
 </div>
}
