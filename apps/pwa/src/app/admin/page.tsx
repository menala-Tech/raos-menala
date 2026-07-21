'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import {
  ArrowLeft, CheckCircle2, XCircle, ShieldCheck,
  Users, ScanLine, Loader2, QrCode, Plus, Pencil, X, Power
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { UserProfile, Branch } from '@/types'

type Tab = 'validasi' | 'staff'
type StaffRole = 'direksi' | 'admin' | 'koordinator' | 'staff'

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [tab, setTab] = useState<Tab>('validasi')
  const [pendingScans, setPendingScans] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [editingStaff, setEditingStaff] = useState<any | null>(null)

  const loadData = useCallback(async (uid: string) => {
    const [{ data: scans }, { data: staff }, { data: branchData }] = await Promise.all([
      supabase
        .from('scan_orders')
        .select('*, raos_drivers(driver_id, name, vehicle_plate), user_profiles!scan_orders_staff_id_fkey(full_name, staff_id)')
        .eq('status', 'pending')
        .order('scanned_at', { ascending: false })
        .limit(100),
      supabase
        .from('user_profiles')
        .select('*, branches(name)')
        .order('full_name'),
      supabase.from('branches').select('*').order('name'),
    ])
    setPendingScans(scans ?? [])
    setStaffList(staff ?? [])
    setBranches(branchData ?? [])
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
      if (!profile || !['koordinator', 'admin', 'direksi'].includes(profile.role)) {
        router.push('/dashboard')
        return
      }
      setUser(profile)
      loadData(session.user.id)
    }
    init()
  }, [router, loadData])

  async function validateScan(scanId: string, status: 'valid' | 'rejected') {
    if (!user) return
    setProcessing(scanId)
    const { error } = await supabase
      .from('scan_orders')
      .update({
        status,
        koordinator_id: user.id,
        validated_at: new Date().toISOString(),
      })
      .eq('id', scanId)
    if (!error) {
      setPendingScans(prev => prev.filter(s => s.id !== scanId))
    }
    setProcessing(null)
  }

  async function toggleStaffActive(staff: any) {
    setProcessing(staff.id)
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: !staff.is_active })
      .eq('id', staff.id)
    if (!error) {
      setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, is_active: !s.is_active } : s))
    }
    setProcessing(null)
  }

  const isAdmin = user && ['admin', 'direksi'].includes(user.role)

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard"><ArrowLeft size={22} /></Link>
          <div>
            <h1 className="font-bold text-base flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" />
              Panel Admin
            </h1>
            <p className="text-white/50 text-xs capitalize">{user?.role} • Validasi & Manajemen</p>
          </div>
        </div>
      </div>

      {/* Quick link */}
      <div className="px-4 pt-3 pb-1 bg-white border-b border-gray-100">
        <Link
          href="/admin/barcodes"
          className="flex items-center gap-2 text-sm text-primary font-medium py-2 px-3 bg-primary/5 rounded-lg"
        >
          <QrCode size={16} />
          Generator QR Code Driver
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4">
        {([
          { key: 'validasi', label: `Validasi (${pendingScans.length})`, icon: ScanLine },
          { key: 'staff', label: 'Staff', icon: Users },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
              tab === key ? 'text-primary border-b-2 border-primary' : 'text-gray-500'
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 space-y-2">
        {loading && (
          <div className="text-center py-10 text-gray-400 text-sm">Memuat data...</div>
        )}

        {/* TAB VALIDASI */}
        {!loading && tab === 'validasi' && pendingScans.length === 0 && (
          <div className="text-center py-10">
            <CheckCircle2 size={40} className="text-green-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm font-medium">Tidak ada scan pending</p>
            <p className="text-gray-400 text-xs">Semua order sudah tervalidasi</p>
          </div>
        )}

        {!loading && tab === 'validasi' && pendingScans.map(scan => (
          <div key={scan.id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-sm text-gray-800">
                  {scan.raos_drivers?.name ?? 'Driver?'}
                </p>
                <p className="text-xs text-gray-400">
                  {scan.scan_id} • {scan.raos_drivers?.driver_id}
                </p>
                <p className="text-xs text-gray-400">
                  Scanner: {scan.user_profiles?.full_name} •{' '}
                  {new Date(scan.scanned_at).toLocaleString('id-ID', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
              <span className="badge-pending">PENDING</span>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => validateScan(scan.id, 'valid')}
                disabled={processing === scan.id}
                className="flex-1 bg-green-600 text-white text-xs font-bold py-2 rounded-lg
                           flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50"
              >
                {processing === scan.id
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CheckCircle2 size={14} />}
                VALIDASI
              </button>
              <button
                onClick={() => validateScan(scan.id, 'rejected')}
                disabled={processing === scan.id}
                className="flex-1 bg-red-50 text-red-600 text-xs font-bold py-2 rounded-lg
                           flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50"
              >
                <XCircle size={14} />
                TOLAK
              </button>
            </div>
          </div>
        ))}

        {/* TAB STAFF */}
        {!loading && tab === 'staff' && isAdmin && (
          <button
            onClick={() => setShowAddStaff(true)}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium
                       text-primary bg-primary/5 py-2.5 rounded-xl mb-1"
          >
            <Plus size={16} /> Tambah Staff
          </button>
        )}

        {!loading && tab === 'staff' && staffList.map(s => (
          <div key={s.id} className="card flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center
                            text-primary font-bold flex-shrink-0">
              {s.full_name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-800 truncate">{s.full_name}</p>
              <p className="text-xs text-gray-400 capitalize truncate">
                {s.staff_id} • {s.role} • {s.branches?.name ?? '-'}
              </p>
            </div>
            <span className={clsx(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
              s.is_active ? 'badge-valid' : 'badge-rejected'
            )}>
              {s.is_active ? 'AKTIF' : 'NONAKTIF'}
            </span>
            {isAdmin && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setEditingStaff(s)}
                  className="p-1.5 text-gray-400 hover:text-primary"
                  aria-label="Edit staff"
                >
                  <Pencil size={14} />
                </button>
                {s.id !== user?.id && (
                  <button
                    onClick={() => toggleStaffActive(s)}
                    disabled={processing === s.id}
                    className={clsx('p-1.5', s.is_active ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600')}
                    aria-label={s.is_active ? 'Nonaktifkan staff' : 'Aktifkan staff'}
                  >
                    {processing === s.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showAddStaff && (
        <AddStaffModal
          branches={branches}
          onClose={() => setShowAddStaff(false)}
          onAdded={() => { setShowAddStaff(false); user && loadData(user.id) }}
        />
      )}

      {editingStaff && (
        <EditStaffModal
          staff={editingStaff}
          branches={branches}
          onClose={() => setEditingStaff(null)}
          onSaved={() => { setEditingStaff(null); user && loadData(user.id) }}
        />
      )}
    </AppShell>
  )
}

function AddStaffModal({
  branches, onClose, onAdded,
}: { branches: Branch[]; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    email: '', staff_id: '', full_name: '', role: 'staff' as StaffRole, branch_id: '', phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setWarning('')

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(json.error ?? 'Gagal menambah staff.')
      return
    }
    if (json.warning) {
      setWarning(json.warning)
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
          <h2 className="font-bold text-gray-800">Tambah Staff</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        {warning ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{warning}</p>
            <button onClick={onAdded} className="btn-primary">Tutup</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              required type="email" placeholder="Email *" value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="input"
            />
            <input
              required placeholder="ID Staff *" value={form.staff_id}
              onChange={e => setForm({ ...form, staff_id: e.target.value })}
              className="input"
            />
            <input
              required placeholder="Nama Lengkap *" value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              className="input"
            />
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value as StaffRole })}
              className="input"
            >
              <option value="staff">Staff</option>
              <option value="koordinator">Koordinator</option>
              <option value="admin">Admin</option>
              <option value="direksi">Direksi</option>
            </select>
            <select
              value={form.branch_id}
              onChange={e => setForm({ ...form, branch_id: e.target.value })}
              className="input"
            >
              <option value="">Pilih Cabang (opsional)</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input
              placeholder="No. HP (opsional)" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="input"
            />

            <p className="text-[11px] text-gray-400">
              Staff akan menerima email untuk membuat password sendiri.
            </p>

            {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>}

            <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Menyimpan...' : 'Buat Akun Staff'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function EditStaffModal({
  staff, branches, onClose, onSaved,
}: { staff: any; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: staff.full_name ?? '',
    role: staff.role as StaffRole,
    branch_id: staff.branch_id ?? '',
    phone: staff.phone ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('user_profiles').update({
      full_name: form.full_name,
      role: form.role,
      branch_id: form.branch_id || null,
      phone: form.phone || null,
    }).eq('id', staff.id)
    setSaving(false)
    if (error) {
      setError('Gagal menyimpan perubahan.')
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md mx-auto p-6 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-gray-800">Edit Staff</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{staff.staff_id}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required placeholder="Nama Lengkap *" value={form.full_name}
            onChange={e => setForm({ ...form, full_name: e.target.value })}
            className="input"
          />
          <select
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value as StaffRole })}
            className="input"
          >
            <option value="staff">Staff</option>
            <option value="koordinator">Koordinator</option>
            <option value="admin">Admin</option>
            <option value="direksi">Direksi</option>
          </select>
          <select
            value={form.branch_id}
            onChange={e => setForm({ ...form, branch_id: e.target.value })}
            className="input"
          >
            <option value="">Pilih Cabang (opsional)</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input
            placeholder="No. HP" value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            className="input"
          />

          {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>}

          <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </form>
      </div>
    </div>
  )
}
