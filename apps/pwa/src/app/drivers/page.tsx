'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { ArrowLeft, Search, Car, Phone, Plus, X, Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { UserProfile, Driver, Branch } from '@/types'

const PAGE_SIZE = 20

export default function DriversPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)

  const loadDrivers = useCallback(async (pageNum: number, searchTerm: string) => {
    setLoading(true)
    let query = supabase
      .from('raos_drivers')
      .select('id, driver_id, name, phone, vehicle_type, vehicle_plate, branch_id, barcode, is_active, branches(name)', { count: 'exact' })
      .eq('is_active', true)
      .order('name')
      .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1)

    if (searchTerm) {
      query = query.or(`name.ilike.%${searchTerm}%,driver_id.ilike.%${searchTerm}%`)
    }

    const { data, count } = await query
    setDrivers((data as any) ?? [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*, branches(*)')
        .eq('id', session.user.id)
        .single()
      setUser(profile)

      const { data: branchData } = await supabase.from('branches').select('*').order('name')
      setBranches(branchData ?? [])

      loadDrivers(0, '')
    }
    init()
  }, [router, loadDrivers])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(0)
      loadDrivers(0, search)
    }, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function goToPage(p: number) {
    setPage(p)
    loadDrivers(p, search)
  }

  const isAdmin = user && ['admin', 'direksi'].includes(user.role)
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard"><ArrowLeft size={22} /></Link>
            <div>
              <h1 className="font-bold text-base">Kendaraan & Driver</h1>
              <p className="text-white/50 text-xs">{totalCount} driver aktif terdaftar</p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-primary text-white p-2 rounded-xl"
            >
              <Plus size={18} />
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
          <input
            type="text"
            placeholder="Cari nama driver atau ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-white/40 text-sm
                       pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none"
          />
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {loading && (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat data driver...</div>
        )}

        {!loading && drivers.length === 0 && (
          <div className="text-center py-16">
            <Car size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm font-medium">Belum ada driver terdaftar</p>
            <p className="text-gray-300 text-xs mt-1">
              {isAdmin ? 'Tambah driver lewat tombol + di atas' : 'Hubungi Admin untuk mendaftarkan driver'}
            </p>
          </div>
        )}

        {!loading && drivers.map(driver => (
          <div key={driver.id} className="card flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
              <Car size={18} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-800 truncate">{driver.name}</p>
              <p className="text-xs text-gray-400">
                {driver.driver_id} • {(driver as any).branches?.name ?? '-'}
              </p>
              <div className="flex items-center gap-3 mt-1">
                {driver.phone && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Phone size={10} /> {driver.phone}
                  </span>
                )}
                {driver.vehicle_plate && (
                  <span className="text-[10px] text-gray-400">{driver.vehicle_plate}</span>
                )}
              </div>
            </div>
            {driver.vehicle_type && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
                {driver.vehicle_type}
              </span>
            )}
          </div>
        ))}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => goToPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 rounded-lg disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <span className="text-xs text-gray-500">
              Halaman {page + 1} dari {totalPages}
            </span>
            <button
              onClick={() => goToPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 rounded-lg disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        )}
      </div>

      {showAddForm && (
        <AddDriverModal
          branches={branches}
          onClose={() => setShowAddForm(false)}
          onAdded={() => { setShowAddForm(false); loadDrivers(0, search) }}
        />
      )}
    </AppShell>
  )
}

function AddDriverModal({
  branches, onClose, onAdded,
}: { branches: Branch[]; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    driver_id: '', name: '', phone: '', vehicle_type: '', vehicle_plate: '', barcode: '', branch_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('raos_drivers').insert({
      driver_id: form.driver_id,
      name: form.name,
      phone: form.phone || null,
      vehicle_type: form.vehicle_type || null,
      vehicle_plate: form.vehicle_plate || null,
      barcode: form.barcode || null,
      branch_id: form.branch_id || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message.includes('duplicate') ? 'ID Driver atau barcode sudah terdaftar.' : 'Gagal menyimpan driver.')
      return
    }
    onAdded()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md mx-auto p-6 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">Tambah Driver</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required placeholder="ID Driver *" value={form.driver_id}
            onChange={e => setForm({ ...form, driver_id: e.target.value })}
            className="input"
          />
          <input
            required placeholder="Nama Driver *" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="input"
          />
          <input
            placeholder="No. HP" value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            className="input"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Jenis Kendaraan" value={form.vehicle_type}
              onChange={e => setForm({ ...form, vehicle_type: e.target.value })}
              className="input"
            />
            <input
              placeholder="Plat Nomor" value={form.vehicle_plate}
              onChange={e => setForm({ ...form, vehicle_plate: e.target.value })}
              className="input"
            />
          </div>
          <input
            placeholder="Barcode (opsional, boleh sama dengan ID Driver)" value={form.barcode}
            onChange={e => setForm({ ...form, barcode: e.target.value })}
            className="input"
          />
          <select
            value={form.branch_id}
            onChange={e => setForm({ ...form, branch_id: e.target.value })}
            className="input"
          >
            <option value="">Pilih Cabang (opsional)</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>}

          <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {saving ? 'Menyimpan...' : 'Simpan Driver'}
          </button>
        </form>
      </div>
    </div>
  )
}
