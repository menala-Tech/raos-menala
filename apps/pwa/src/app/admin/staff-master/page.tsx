'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, UserCheck, UserX, Users } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/accessPolicy'

type StaffMasterRow = {
  id: string
  staff_id: string
  full_name: string
  email: string | null
  phone: string | null
  airport: string | null
  terminal: string | null
  role: string
  status: string
  is_activated: boolean
  auth_user_id: string | null
  branch_id: string | null
}

export default function StaffMasterPage() {
  const router = useRouter()
  const [rows, setRows] = useState<StaffMasterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL'|'Aktif'|'Nonaktif'>('ALL')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }
      const { data: profile } = await supabase.from('user_profiles').select('role,is_active').eq('id', session.user.id).single()
      if (!profile?.is_active || !can(profile.role, 'admin:panel')) { router.replace('/dashboard'); return }

      const { data, error: qerr } = await supabase
        .from('raos_staff_master')
        .select('id,staff_id,full_name,email,phone,airport,terminal,role,status,is_activated,auth_user_id,branch_id')
        .eq('is_activated', false)
        .eq('airport', 'SOETA')
        .order('full_name')
      if (qerr) setError(qerr.message)
      setRows((data ?? []) as StaffMasterRow[])
      setLoading(false)
    }
    void load()
  }, [router])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      if (status !== 'ALL' && r.status !== status) return false
      if (!q) return true
      return [r.staff_id, r.full_name, r.email ?? '', r.phone ?? '', r.role].some(v => String(v).toLowerCase().includes(q))
    })
  }, [rows, query, status])

  const active = rows.filter(r => r.status === 'Aktif').length
  const inactive = rows.filter(r => r.status === 'Nonaktif').length

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-5 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base">Staff Master • Pre-Activation</h1>
            <p className="text-white/50 text-xs">SOETA • SSOT DATABASE STAFF • read-only</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white/10 rounded-xl p-2"><div className="text-xl font-black">{rows.length}</div><div className="text-[10px] text-white/60">Total</div></div>
          <div className="bg-white/10 rounded-xl p-2"><div className="text-xl font-black text-green-300">{active}</div><div className="text-[10px] text-white/60">Aktif SSOT</div></div>
          <div className="bg-white/10 rounded-xl p-2"><div className="text-xl font-black text-red-300">{inactive}</div><div className="text-[10px] text-white/60">Nonaktif SSOT</div></div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        <div className="card bg-amber-50 text-amber-800 text-xs">
          Data ini belum menjadi akun RAOS aktif. Terminal T1/T2/T3, branch_id dan Auth tetap kosong sampai proses aktivasi resmi.
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-gray-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama / staff ID / email" className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm"/></div>
          <select value={status} onChange={e=>setStatus(e.target.value as any)} className="border rounded-xl px-2 text-sm bg-white"><option value="ALL">Semua</option><option value="Aktif">Aktif</option><option value="Nonaktif">Nonaktif</option></select>
        </div>

        {loading && <div className="text-center py-10 text-gray-400">Memuat staff master...</div>}
        {error && <div className="card bg-red-50 text-red-600 text-sm">{error}</div>}
        {!loading && !error && filtered.map(r => (
          <div key={r.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><Users size={18}/></div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-800 truncate">{r.full_name}</p>
                  <p className="text-xs text-gray-500">{r.staff_id} • {r.role}</p>
                  <p className="text-xs text-gray-400 mt-1">SOETA • Terminal: {r.terminal || 'Belum ditentukan'}</p>
                  <p className="text-xs text-gray-400">Email: {r.email || 'Belum ada'} • Auth: Belum aktif</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${r.status==='Aktif'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{r.status==='Aktif'?<span className="inline-flex items-center gap-1"><UserCheck size={11}/>{r.status}</span>:<span className="inline-flex items-center gap-1"><UserX size={11}/>{r.status}</span>}</span>
            </div>
          </div>
        ))}
        {!loading && !error && filtered.length===0 && <div className="text-center py-10 text-gray-400 text-sm">Tidak ada data yang cocok.</div>}
      </div>
    </AppShell>
  )
}
