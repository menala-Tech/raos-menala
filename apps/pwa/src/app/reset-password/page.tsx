'use client'
import Link from 'next/link'
import MenalaLogo from '@/components/MenalaLogo'
import { ShieldCheck } from 'lucide-react'
export default function ResetPasswordPage(){
  return <div className="min-h-screen bg-secondary flex flex-col items-center justify-center px-6 text-center">
    <MenalaLogo size={84} variant="splash" tone="onNavy"/>
    <div className="mt-8 bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full">
      <ShieldCheck className="text-primary mx-auto mb-3" size={34}/>
      <h1 className="font-bold text-lg text-gray-800">Reset PIN RAOS</h1>
      <p className="text-sm text-gray-500 mt-2">PIN RAOS dikelola Admin melalui CRM / User Supabase RAOS dan disinkronkan ke MASTER DATA STAFF. Halaman ini tidak mengubah password legacy Supabase Auth.</p>
      <Link href="/" className="btn-primary mt-5 block">Kembali ke Login</Link>
    </div>
  </div>
}
