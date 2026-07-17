'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import MenalaLogo from '@/components/MenalaLogo'
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Send, ArrowLeft, Loader2 } from 'lucide-react'

type Mode = 'password' | 'magic-link' | 'forgot-password'

export default function LoginPage() {
  const router = useRouter()
  const [checkingSession, setCheckingSession] = useState(true)
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard')
      else setCheckingSession(false)
    })
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email atau kata sandi salah.'); setLoading(false); return }
    router.push('/dashboard')
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    const { data: isRegistered } = await supabase.rpc('email_is_registered_staff', { check_email: email })
    if (!isRegistered) {
      setError('Email tidak terdaftar sebagai staff aktif. Hubungi Admin.')
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) {
      setError(error.message.includes('invalid')
        ? 'Server email belum dikonfigurasi. Hubungi Admin sistem.'
        : 'Gagal mengirim link masuk. Coba lagi.')
    } else {
      setInfo(`Link masuk telah dikirim ke ${email}. Buka email dan klik link untuk masuk.`)
    }
    setLoading(false)
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(error.message.includes('invalid')
        ? 'Server email belum dikonfigurasi. Hubungi Admin sistem.'
        : 'Gagal mengirim link reset. Periksa email dan coba lagi.')
    } else {
      setInfo(`Link atur ulang kata sandi telah dikirim ke ${email}.`)
    }
    setLoading(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setInfo('')
    setPassword('')
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <MenalaLogo size={64} variant="splash" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary flex flex-col">
      {/* Hero */}
      <div className="relative h-52 w-full overflow-hidden flex-shrink-0">
        <Image
          src="/images/hero-airport.png"
          alt="Bandara Soekarno-Hatta"
          fill priority sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-secondary/30 via-secondary/60 to-secondary" />
        {/* Brand strip di atas hero */}
        <div className="absolute top-10 left-0 right-0 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-primary/60 shadow bg-white">
              <Image src="/images/logo-menala.png" alt="MENALA" width={32} height={32} className="object-cover" priority />
            </div>
            <p className="text-primary font-black text-sm tracking-widest">MENALA</p>
          </div>
          <span className="text-white/50 text-[10px] font-medium tracking-widest">by maxim</span>
        </div>
      </div>

      {/* Logo & Title */}
      <div className="flex flex-col items-center px-6 -mt-14 pb-6 relative z-10">
        <div className="w-28 h-28 rounded-full bg-white shadow-2xl flex items-center justify-center overflow-hidden
                        ring-4 ring-primary/50 ring-offset-4 ring-offset-secondary">
          <Image
            src="/images/logo-menala.png"
            alt="Logo MENALA"
            width={112} height={112} priority
            className="object-cover w-full h-full"
          />
        </div>
        <h1 className="text-primary text-2xl font-black tracking-[0.2em] text-center mt-4 leading-none">
          MENALA
        </h1>
        <p className="text-white/70 text-xs font-semibold text-center mt-1 tracking-widest uppercase">
          Airport Operation System
        </p>
        <p className="text-white/40 text-xs text-center mt-3">
          {mode === 'password'      && 'Silakan masuk untuk melanjutkan'}
          {mode === 'magic-link'    && 'Masuk cepat tanpa kata sandi'}
          {mode === 'forgot-password' && 'Atur ulang kata sandi Anda'}
        </p>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl flex-1">
        {mode !== 'password' && (
          <button
            onClick={() => switchMode('password')}
            className="flex items-center gap-1.5 text-gray-500 text-sm font-medium mb-4"
          >
            <ArrowLeft size={16} /> Kembali
          </button>
        )}

        {/* PASSWORD MODE */}
        {mode === 'password' && (
          <>
            <p className="text-gray-800 font-bold text-base mb-4 text-center">Masuk ke Akun</p>
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
                <input type="email" placeholder="Email atau ID Staff" value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input pl-10" autoComplete="username" required />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-gray-400" size={18} />
                <input type={showPass ? 'text' : 'password'} placeholder="Kata Sandi" value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pl-10 pr-10" autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-3.5 text-gray-400">
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="rounded" />
                  Ingat saya
                </label>
                <button type="button" onClick={() => switchMode('forgot-password')}
                  className="text-primary font-semibold text-xs">
                  Lupa Kata Sandi?
                </button>
              </div>

              {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>}

              <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Memproses...' : '🔐 MASUK'}
              </button>
            </form>

            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-gray-200" />
              <span className="px-3 text-gray-400 text-xs">atau masuk dengan</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            <button onClick={() => switchMode('magic-link')}
              className="btn-secondary flex items-center justify-center gap-2">
              <Send size={16} />
              Link Email (Tanpa Kata Sandi)
            </button>

            <p className="text-center text-gray-400 text-xs mt-4">
              Belum punya akun?{' '}
              <a href="/chat?room=umum" className="text-primary font-semibold">Hubungi Admin</a>
            </p>
          </>
        )}

        {/* MAGIC LINK MODE */}
        {mode === 'magic-link' && (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <p className="text-sm font-bold text-gray-800 mb-1">Masuk dengan Link Email</p>
            <p className="text-xs text-gray-500">
              Masukkan email staff yang terdaftar. Kami akan kirim link pribadi — klik untuk langsung masuk tanpa kata sandi.
            </p>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input type="email" placeholder="Email Staff Terdaftar" value={email}
                onChange={e => setEmail(e.target.value)}
                className="input pl-10" autoComplete="username" required />
            </div>
            {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>}
            {info  && <p className="text-green-600 text-sm text-center bg-green-50 py-2 rounded-lg">{info}</p>}
            <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {loading ? 'Mengirim...' : 'Kirim Link Masuk'}
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD MODE */}
        {mode === 'forgot-password' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-sm font-bold text-gray-800 mb-1">Lupa Kata Sandi?</p>
            <p className="text-xs text-gray-500">
              Masukkan email akun Anda. Kami akan kirim link untuk mengatur ulang kata sandi.
            </p>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input type="email" placeholder="Email Akun" value={email}
                onChange={e => setEmail(e.target.value)}
                className="input pl-10" autoComplete="username" required />
            </div>
            {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>}
            {info  && <p className="text-green-600 text-sm text-center bg-green-50 py-2 rounded-lg">{info}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Mengirim...' : 'Kirim Link Reset'}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-center gap-1.5 text-gray-400 mb-1">
            <ShieldCheck size={13} />
            <span className="text-[11px]">Sistem aman &amp; terenkripsi</span>
          </div>
          <p className="text-center text-[10px] text-gray-300">RAOS v1.0.0 • © 2024 MENALA</p>
        </div>
      </div>
    </div>
  )
}
