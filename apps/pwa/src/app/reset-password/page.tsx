'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Lock, Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // Supabase set sesi sementara (PASSWORD_RECOVERY) otomatis dari link email
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!/^\d{6,}$/.test(password)) {
      setError('PIN minimal 6 digit angka.')
      return
    }
    if (password !== confirm) {
      setError('Konfirmasi PIN tidak cocok.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError('Gagal mengubah PIN. Link mungkin sudah kedaluwarsa.')
      return
    }
    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-secondary flex flex-col items-center justify-center px-6 text-center">
        <Loader2 className="text-primary animate-spin mb-4" size={32} />
        <p className="text-white/60 text-sm">
          Memverifikasi link reset PIN...
        </p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-secondary flex flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 className="text-green-400 mb-4" size={48} />
        <p className="text-white font-bold">Kata sandi berhasil diubah!</p>
        <p className="text-white/50 text-sm mt-1">Mengarahkan ke dashboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary flex flex-col justify-center px-6">
      <div className="bg-white rounded-2xl p-6 shadow-2xl">
        <h1 className="font-bold text-lg text-gray-800 mb-1">Atur Ulang PIN</h1>
        <p className="text-xs text-gray-500 mb-5">Masukkan PIN baru Anda.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-gray-400" size={18} />
            <input
              type={showPass ? 'text' : 'password'}
              inputMode="numeric" pattern="[0-9]*"
              placeholder="PIN Baru"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input pl-10 pr-10"
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

          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-gray-400" size={18} />
            <input
              type={showPass ? 'text' : 'password'}
              inputMode="numeric" pattern="[0-9]*"
              placeholder="Konfirmasi PIN"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="input pl-10"
              required
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Menyimpan...' : 'Simpan PIN Baru'}
          </button>
        </form>
      </div>
    </div>
  )
}
