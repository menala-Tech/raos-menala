'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
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

  // Sesi aktif → langsung ke dashboard, tidak perlu login ulang tiap buka app
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard')
      } else {
        setCheckingSession(false)
      }
    })
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email atau kata sandi salah.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    const { data: isRegistered } = await supabase.rpc('email_is_registered_staff', {
      check_email: email,
    })

    if (!isRegistered) {
      setError('Email tidak terdaftar sebagai staff aktif. Hubungi Admin untuk didaftarkan.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    })

    if (error) {
      setError(
        error.message.includes('invalid')
          ? 'Server email belum dikonfigurasi untuk domain ini. Hubungi Admin sistem.'
          : 'Gagal mengirim link masuk. Coba lagi.'
      )
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
      setError(
        error.message.includes('invalid')
          ? 'Server email belum dikonfigurasi untuk domain ini. Hubungi Admin sistem.'
          : 'Gagal mengirim link reset. Periksa email dan coba lagi.'
      )
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
        <Loader2 className="text-primary animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary flex flex-col">
      {/* Hero — foto bandara + branding Maxim */}
      <div className="relative h-48 w-full overflow-hidden flex-shrink-0">
        <Image
          src="/images/hero-airport.png"
          alt="Bandara Soekarno-Hatta"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-secondary/40 via-secondary/70 to-secondary" />
      </div>

      {/* Header — logo & judul */}
      <div className="flex flex-col items-center px-6 -mt-16 pb-8 relative z-10">
        <div className="w-24 h-24 rounded-full bg-white shadow-lg flex items-center justify-center mb-4 overflow-hidden">
          <Image
            src="/images/logo-menala.png"
            alt="Logo MENALA"
            width={96}
            height={96}
            priority
            className="object-cover w-full h-full"
          />
        </div>
        <h1 className="text-primary text-2xl font-black tracking-wide text-center">
          MENALA
        </h1>
        <p className="text-white text-sm font-semibold text-center mt-0.5 tracking-wide">
          AIRPORT OPERATION SYSTEM
        </p>
        <p className="text-white/40 text-xs text-center mt-4">
          {mode === 'password' && 'Silakan masuk untuk melanjutkan'}
          {mode === 'magic-link' && 'Masuk cepat tanpa kata sandi'}
          {mode === 'forgot-password' && 'Atur ulang kata sandi Anda'}
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl">
        {mode !== 'password' && (
          <button
            onClick={() => switchMode('password')}
            className="flex items-center gap-1.5 text-gray-500 text-sm font-medium mb-4"
          >
            <ArrowLeft size={16} /> Kembali ke login kata sandi
          </button>
        )}

        {/* ===== MODE: PASSWORD (default) ===== */}
        {mode === 'password' && (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
                <input
                  type="email"
                  placeholder="Email atau ID Staff"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input pl-10"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-gray-400" size={18} />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Kata Sandi"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pl-10 pr-10"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-3.5 text-gray-400"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="rounded"
                  />
                  Ingat saya
                </label>
                <button
                  type="button"
                  onClick={() => switchMode('forgot-password')}
                  className="text-primary font-medium"
                >
                  Lupa Kata Sandi?
                </button>
              </div>

              {error && (
                <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Memproses...' : 'MASUK'}
              </button>
            </form>

            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-gray-200" />
              <span className="px-3 text-gray-400 text-xs">atau</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            <button
              onClick={() => switchMode('magic-link')}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <Send size={16} />
              Masuk dengan Link Email
            </button>

            <p className="text-center text-gray-400 text-xs mt-4">
              Belum punya akun?{' '}
              <a href="/chat?room=umum" className="text-primary font-medium">
                Hubungi Admin
              </a>
            </p>
          </>
        )}

        {/* ===== MODE: MAGIC LINK ===== */}
        {mode === 'magic-link' && (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <p className="text-xs text-gray-500">
              Masukkan email staff yang terdaftar. Kami akan kirim link pribadi —
              klik link tersebut untuk langsung masuk tanpa kata sandi.
            </p>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input
                type="email"
                placeholder="Email Staff Terdaftar"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input pl-10"
                autoComplete="username"
                required
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>
            )}
            {info && (
              <p className="text-green-600 text-sm text-center bg-green-50 py-2 rounded-lg">{info}</p>
            )}

            <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {loading ? 'Mengirim...' : 'Kirim Link Masuk'}
            </button>
          </form>
        )}

        {/* ===== MODE: FORGOT PASSWORD ===== */}
        {mode === 'forgot-password' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-xs text-gray-500">
              Masukkan email akun Anda. Kami akan kirim link untuk mengatur ulang kata sandi.
            </p>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input
                type="email"
                placeholder="Email Akun"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input pl-10"
                autoComplete="username"
                required
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>
            )}
            {info && (
              <p className="text-green-600 text-sm text-center bg-green-50 py-2 rounded-lg">{info}</p>
            )}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Mengirim...' : 'Kirim Link Reset'}
            </button>
          </form>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-gray-400">
          <ShieldCheck size={14} />
          <span className="text-xs">Sistem aman & terenkripsi • RAOS v1.0.0</span>
        </div>
      </div>
    </div>
  )
}
