'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/accessPolicy'
import { cacheReadSync, cacheWriteSync } from '@/lib/apiCache'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { runtimeMessage, runtimeTechnicalMessage } from '@/lib/runtimeError'
import AppShell from '@/components/layout/AppShell'
import {
  ArrowLeft, CheckCircle2, XCircle, ShieldCheck,
  Users, ScanLine, Loader2, QrCode, X, Lock,
  MessageCirclePlus, Search, Check, Bell,
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { UserProfile, Branch } from '@/types'
import { logActivity } from '@/lib/activity'
import { invokePush } from '@/lib/pushClient'
import AnnouncementBroadcast from '@/components/AnnouncementBroadcast'
import NotificationStatsPanel from '@/components/NotificationStatsPanel'

type Tab = 'validasi' | 'staff'

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [tab, setTab] = useState<Tab>('validasi')
  const [pendingScans, setPendingScans] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [showCreateRoom, setShowCreateRoom] = useState(false)

  const loadData = useCallback(async (uid: string) => {
    const cached=cacheReadSync<any>(['admin-page',uid],5*60*1000)
    if(cached){setPendingScans(cached.pendingScans);setStaffList(cached.staffList);setBranches(cached.branches);setLoading(false)}
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
    cacheWriteSync(['admin-page',uid],{pendingScans:scans??[],staffList:staff??[],branches:branchData??[]})
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
      if (!profile || !can(profile.role,'admin:panel')) {
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
    // B12 fix: this page is gated by can(role,'admin:panel'), which only
    // admin/direksi hold (koordinator does not -- confirmed in accessPolicy.ts
    // CAPS and unreachable via ROLE_ROUTES/RoleGuard, B1) -- every caller here
    // is Admin/Direksi, never Koordinator. The old code unconditionally wrote
    // koordinator_id, falsely recording every Admin/Direksi validation as a
    // koordinator action. scan_orders already has a separate admin_id column
    // (FK-verified) that was simply unused -- writing there instead needs no
    // schema change and stops overloading koordinator_id with a role it
    // never represents.
    const { error } = await supabase
      .from('scan_orders')
      .update({
        status,
        admin_id: user.id,
        validated_at: new Date().toISOString(),
      })
      .eq('id', scanId)
    if (!error) {
      const scan = pendingScans.find(s => s.id === scanId)
      setPendingScans(prev => prev.filter(s => s.id !== scanId))
      logActivity(`validasi_scan_${status}`, `Scan ${scan?.scan_id ?? scanId} → ${status.toUpperCase()}`)

      // Notif ke staff yang melakukan scan (A: scan validated/rejected)
      if (scan?.staff_id) {
        const driverName = scan.raos_drivers?.name ?? 'Driver'
        invokePush({
          user_ids: [scan.staff_id],
          title: status === 'valid' ? '✅ Scan Divalidasi' : '❌ Scan Ditolak',
          body: status === 'valid'
            ? `Scan ${scan.scan_id} untuk ${driverName} disetujui oleh ${user.full_name}.`
            : `Scan ${scan.scan_id} untuk ${driverName} ditolak oleh ${user.full_name}. Cek riwayat untuk detail.`,
          url: '/riwayat',
          tag: `scan-${scan.scan_id}`,
          kategori: 'scan_berhasil',
        })
      }
    }
    setProcessing(null)
  }


  useRealtimeRefresh(`admin-${user?.id ?? 'anon'}`,[{table:'scan_orders'},{table:'user_profiles'},{table:'branches'}],()=>user?.id?loadData(user.id):undefined,300,!!user?.id)

  const isAdmin = !!user && can(user.role,'admin:panel')

  return (
    <AppShell>
      <div className="bg-secondary text-white px-4 pt-10 pb-4 sticky top-0 z-30">
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

      {/* Quick links */}
      <div className="px-4 pt-3 pb-1 bg-white border-b border-gray-100 space-y-1.5">
        <Link
          href="/admin/barcodes"
          className="flex items-center gap-2 text-sm text-primary font-medium py-2 px-3 bg-primary/5 rounded-lg"
        >
          <QrCode size={16} />
          Generator QR Code Driver
        </Link>
        {isAdmin && (
          <>
            <button
              onClick={() => setShowCreateRoom(true)}
              className="w-full flex items-center gap-2 text-sm text-secondary font-medium py-2 px-3 bg-secondary/5 rounded-lg text-left"
            >
              <MessageCirclePlus size={16} />
              Buat Room Proyek Baru
            </button>
            <button
              onClick={async () => {
                if (!confirm('Buat room "Pengisian Saldo" untuk semua 9 cabang aktif? (skip yang sudah ada)')) return
                const { data, error } = await supabase.rpc('seed_room_per_branch', { p_room_name: 'Pengisian Saldo' })
                if (error) { console.warn('[admin] RPC failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Operasi Admin gagal.')); return }
                const rows = data as { branch_slug: string; created: boolean }[]
                const created = rows.filter(r => r.created).length
                alert(`✅ Selesai — ${created} room baru, ${rows.length - created} sudah ada.`)
              }}
              className="w-full flex items-center gap-2 text-sm text-secondary font-medium py-2 px-3 bg-primary/10 rounded-lg text-left"
            >
              <MessageCirclePlus size={16} className="text-primary" />
              Bulk-create Room &ldquo;Pengisian Saldo&rdquo; per Cabang
            </button>
            <button
              onClick={async () => {
                if (!confirm('Buat room "Driver" untuk semua 9 cabang aktif? (skip yang sudah ada)')) return
                const { data, error } = await supabase.rpc('seed_room_per_branch', { p_room_name: 'Driver' })
                if (error) { console.warn('[admin] RPC failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Operasi Admin gagal.')); return }
                const rows = data as { branch_slug: string; created: boolean }[]
                const created = rows.filter(r => r.created).length
                alert(`✅ Selesai — ${created} room baru, ${rows.length - created} sudah ada.`)
              }}
              className="w-full flex items-center gap-2 text-sm text-secondary font-medium py-2 px-3 bg-primary/10 rounded-lg text-left"
            >
              <MessageCirclePlus size={16} className="text-primary" />
              Bulk-create Room &ldquo;Driver&rdquo; per Cabang
            </button>
            <button
              onClick={async () => {
                if (!user) return
                const branchId = prompt('Random-assign driver ke staff cabang mana? (paste UUID branch_id — cek di tab Finance > DB Driver Portal Rifim-OS)')
                if (!branchId) return
                const force = confirm('Force rebalance? (OK = hapus semua assignment cabang ini lalu redistribute, Cancel = hanya assign driver yang belum punya staff)')
                const { data, error } = await supabase.rpc('raos_random_assign_drivers', { p_branch_id: branchId, p_force: force })
                if (error) { console.warn('[admin] random assign failed', runtimeTechnicalMessage(error)); alert(runtimeMessage(error,'Random assign driver gagal.')); return }
                alert(`✅ ${data} driver ter-assign${force ? ' (rebalanced)' : ''}`)
              }}
              className="w-full flex items-center gap-2 text-sm text-secondary font-medium py-2 px-3 bg-amber-500/10 rounded-lg text-left"
            >
              <QrCode size={16} className="text-amber-600" />
              🎲 Random Assign Driver → Staff (Admin/Direksi only)
            </button>
            <button
              onClick={async () => {
                if (!user) return
                if (!confirm('Kirim test push notification ke akun Anda sendiri sekarang?')) return
                const { data: { session } } = await supabase.auth.getSession()
                const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/raos-send-push`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    user_ids: [user.id],
                    title: '🔔 Test Notifikasi RAOS',
                    body: 'Kalau Anda lihat pesan ini di lock screen HP, push notification jalan!',
                    url: '/dashboard',
                    tag: 'raos-test',
                  }),
                })
                const j = await res.json()
                alert(res.ok
                  ? `Test push terkirim.\nSent: ${j.sent}, Failed: ${j.failed}, Total: ${j.total}${j.note ? `\nNote: ${j.note}` : ''}${j.errors ? '\n\nErrors:\n' + JSON.stringify(j.errors, null, 2) : ''}`
                  : `Gagal: HTTP ${res.status}\n${JSON.stringify(j, null, 2)}`)
              }}
              className="w-full flex items-center gap-2 text-sm text-blue-600 font-medium py-2 px-3 bg-blue-50 rounded-lg text-left"
            >
              <Bell size={16} />
              Test Push Notification (ke saya sendiri)
            </button>
          </>
        )}
      </div>

      {/* Notification Engine metrics — admin/mgmt/direksi */}
      {isAdmin && (
        <div className="px-4 pt-3">
          <NotificationStatsPanel />
        </div>
      )}

      {/* Broadcast Pengumuman — admin/mgmt/direksi */}
      {isAdmin && user && (
        <div className="px-4 pt-3">
          <AnnouncementBroadcast senderId={user.id} senderRole={user.role} />
        </div>
      )}

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
          <div className="text-[11px] text-gray-500 bg-amber-50 border border-amber-200
                          rounded-lg px-3 py-2 mb-1 flex items-start gap-2">
            <Lock size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              Daftar staff Soeta disinkron otomatis dari sheet <b>MASTER DATA STAFF</b> (SSoT).
              Untuk tambah/hapus/ganti nama/role/HP/PIN/cabang/status aktif staff → edit di sheet lalu tunggu sinkronisasi berikutnya.
              Daftar Staff di PWA ini bersifat <b>read-only</b> terhadap master identity.
            </span>
          </div>
        )}

        {!loading && tab === 'staff' && staffList.map(s => (
          <div key={s.id} className="card flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center
                            text-primary font-bold flex-shrink-0">
              {s.full_name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-800 truncate flex items-center gap-1.5">
                {s.full_name}
                {s.source === 'ssot_master_staff' && (
                  <span title="Dari SSoT MASTER DATA STAFF" className="text-amber-500">
                    <Lock size={11} />
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400 capitalize truncate">
                {s.staff_id} • {s.role} • {s.branches?.name ?? '—'}
              </p>
            </div>
            <span className={clsx(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
              s.is_active ? 'badge-valid' : 'badge-rejected'
            )}>
              {s.is_active ? 'AKTIF' : 'NONAKTIF'}
            </span>
          </div>
        ))}
      </div>

      {showCreateRoom && user && (
        <CreateProyekRoomModal
          me={user.id}
          onClose={() => setShowCreateRoom(false)}
          onCreated={() => { setShowCreateRoom(false); router.push('/chat') }}
        />
      )}
    </AppShell>
  )
}

function CreateProyekRoomModal({
  me, onClose, onCreated,
}: { me: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [branchId, setBranchId] = useState<string>('') // '' = global (semua cabang)
  const [branches, setBranches] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [search, setSearch] = useState('')
  const [staffList, setStaffList] = useState<Array<{ id: string; full_name: string; staff_id: string; role: string }>>([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('branches').select('id, name, slug').eq('is_active', true)
      .order('name').then(({ data }) => setBranches(data ?? []))
  }, [])

  useEffect(() => {
    supabase.from('user_profiles')
      .select('id, full_name, staff_id, role')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => {
        setStaffList((data ?? []).filter(u => u.id !== me))
        setLoadingStaff(false)
      })
  }, [me])

  function toggleMember(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (name.trim().length < 3) { setError('Nama room minimal 3 karakter.'); return }
    setSaving(true)
    const { error } = await supabase.rpc('create_proyek_room', {
      p_name: name.trim(),
      p_description: description.trim(),
      p_member_ids: Array.from(selected),
      p_branch_id: branchId || null,
    })
    setSaving(false)
    if (error) { console.warn('[admin] create room failed', runtimeTechnicalMessage(error)); setError(runtimeMessage(error,'Gagal membuat room.')); return }
    onCreated()
  }

  const filtered = staffList.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.staff_id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md mx-auto px-6 pt-6 max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-gray-800">Buat Room Proyek</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Room kolaborasi lintas staff. Anda otomatis jadi anggota, staff yang di-tag
          bisa langsung akses room begitu dibuat.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required minLength={3}
            placeholder="Nama Room *"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input"
          />
          <textarea
            placeholder="Deskripsi (opsional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="input resize-none"
          />

          {/* Branch selector — global (semua cabang) atau cabang spesifik */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              Cabang
            </label>
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="input">
              <option value="">Semua Cabang (Global)</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              Global = anggota lintas cabang (mis. room Umum, Pengumuman).
              Cabang spesifik = hanya staff/koordinator cabang tersebut yang bisa akses.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Anggota ({selected.size} dipilih)
              </p>
              {selected.size > 0 && (
                <button type="button" onClick={() => setSelected(new Set())}
                  className="text-[11px] text-red-500 font-semibold">Kosongkan</button>
              )}
            </div>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text" placeholder="Cari nama / ID staff..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input pl-8 text-sm"
              />
            </div>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {loadingStaff && <p className="text-center text-gray-400 text-xs py-6">Memuat staff...</p>}
              {!loadingStaff && filtered.length === 0 && (
                <p className="text-center text-gray-400 text-xs py-6">Tidak ada staff cocok.</p>
              )}
              {!loadingStaff && filtered.map(u => {
                const isSelected = selected.has(u.id)
                return (
                  <button
                    type="button" key={u.id}
                    onClick={() => toggleMember(u.id)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                      isSelected ? 'bg-primary/5' : 'hover:bg-gray-50'
                    )}
                  >
                    <div className={clsx(
                      'w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2',
                      isSelected ? 'bg-primary border-primary' : 'border-gray-300'
                    )}>
                      {isSelected && <Check size={12} className="text-secondary" strokeWidth={4} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{u.full_name}</p>
                      <p className="text-[11px] text-gray-400 capitalize truncate">
                        {u.staff_id} • {u.role}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              Kosongkan pilihan kalau mau bikin room dulu, undang anggota belakangan lewat Info Room.
            </p>
          </div>

          {error && <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>}

          <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <MessageCirclePlus size={16} />}
            {saving ? 'Membuat...' : 'Buat Room Proyek'}
          </button>
        </form>
      </div>
    </div>
  )
}
