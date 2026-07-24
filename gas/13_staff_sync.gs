// ============================================================
// 13_staff_sync.gs — Sync Staff RAOS (Soeta) dari SSOT MASTER DATA STAFF
// ============================================================
//
// SUMBER SSOT (WAJIB, lihat SSOT_DATA_SOURCES.md di root workspace):
// Spreadsheet "DATABASE STAFF" — SATU-SATUNYA sumber data staff untuk seluruh
// sistem RIFIM, dipakai bersama oleh semua PWA. RAOS HANYA boleh membaca
// (read-only), tidak pernah menulis balik ke sheet.
//
// RAOS = Bandara Soekarno-Hatta → hanya tarik baris dengan
// kolom D "ID CABANG" = "ID Rifim Airport Soeta". Cabang lain di sheet
// (Batam, Jambi, Balikpapan, dll) BUKAN urusan RAOS, dilewati.
//
// Arah sync: Google Sheets → Supabase (satu arah). Kolom SSOT (full_name,
// role, phone, staff_id) di-refresh tiap sync + PIN → password Supabase Auth;
// kolom milik RAOS sendiri (branch_id / Terminal T1/T2/T3, avatar_url) TIDAK
// PERNAH ditimpa sync — itu diset admin lewat /admin.
//
// Mapping kolom sheet MASTER DATA STAFF (0-based):
//   A(0) Email    B(1) Nama    C(2) Gaji Staff    D(3) ID CABANG
//   E(4) ID Staff F(5) Jabatan G(6) No WA Staff  H(7) Pin
//
// Mapping jabatan → role RAOS:
//   STAFF KONTER / PICKUP POINT → 'staff'
//   KOORDINATOR                 → 'koordinator'
//   ADMIN                       → 'admin'
//   MANAGEMENT                  → 'management'
//   DIREKSI                     → 'direksi'

const MASTER_STAFF_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty('MASTER_STAFF_SHEET_ID')
  || '1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw'

const MASTER_STAFF_TAB_NAME = 'MASTER DATA STAFF'
// Multi-cabang (P1.4, sesi 16 lanjutan) — RAOS sekarang menampung 9 cabang
// aktif RIFIM + Head Office. Semua staff RIFIM di-sync ke user_profiles;
// scope akses per cabang di-enforce oleh RLS `is_branch_in_scope()` (mig.
// raos_038). Head Office masuk sebagai direksi/management (tidak scoped).
const RAOS_ALLOWED_BRANCHES = [
  'ID Rifim Airport Soeta',
  'ID Rifim Airport Batam',
  'ID Rifim Airport Jambi',
  'ID Rifim Airport Balikpapan',
  'ID Rifim Airport Manado',
  'ID Rifim Airport Pekanbaru',
  'ID Rifim Airport Makassar',
  'ID Rifim Batam',
  'ID Rifim Jambi Luar',
  'Head Office',
]

function getMasterStaffSheet_() {
  const ss = SpreadsheetApp.openById(MASTER_STAFF_SHEET_ID)
  const sh = ss.getSheetByName(MASTER_STAFF_TAB_NAME)
  if (!sh) {
    const allNames = ss.getSheets().map(s => s.getName()).join(', ')
    throw new Error(`Tab "${MASTER_STAFF_TAB_NAME}" tidak ditemukan di spreadsheet SSOT. Tab tersedia: ${allNames}`)
  }
  return sh
}

// GoTrue admin API (untuk auth.users) — beda base path dari REST API (/rest/v1)
function callSupabaseAuth_(endpoint, method, body) {
  const opts = {
    method: method || 'GET',
    headers: {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    muteHttpExceptions: true,
  }
  if (body) opts.payload = JSON.stringify(body)
  const res = UrlFetchApp.fetch(`${CONFIG.SUPABASE_URL}/auth/v1/${endpoint}`, opts)
  const code = res.getResponseCode()
  const text = res.getContentText()
  if (code >= 400) {
    throw new Error(`Auth API ${code}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}

function mapJabatanToRole_(jabatan) {
  const j = String(jabatan || '').trim().toUpperCase()
  if (j === 'DIREKSI') return 'direksi'
  if (j === 'MANAGEMENT') return 'management'
  if (j === 'KOORDINATOR') return 'koordinator'
  if (j === 'ADMIN') return 'admin'
  if (j === 'STAFF KONTER' || j === 'PICKUP POINT') return 'staff'
  return null // jabatan tidak dikenal → skip baris
}

function normalizePin_(rawPin) {
  const s = String(rawPin || '').trim()
  if (!s) return { valid: false, reason: 'kosong' }
  if (!/^\d+$/.test(s)) return { valid: false, reason: `bukan angka: "${s}"` }
  if (s.length < 6) return { valid: false, reason: `terlalu pendek (${s.length} digit, min 6)` }
  return { valid: true, value: s }
}

/** Ambil map slug → branch_id dari Supabase supaya sync bisa auto-set branch_id staff. */
function kpiBranchMap_() {
  const rows = callSupabase('branches?select=id,slug') || []
  const map = {}
  rows.forEach(r => { if (r.slug) map[r.slug] = r.id })
  return map
}

function syncStaffFromSSOT() {
  let inserted = 0, updated = 0, deactivated = 0, skipped = 0, errors = 0
  const warnings = []

  try {
    const sh = getMasterStaffSheet_()
    const rows = sh.getDataRange().getValues().slice(1) // skip header
    const seenStaffIds = []
    const now = new Date().toISOString()
    const branchMap = kpiBranchMap_()
    // Head Office tidak punya branch entry — direksi/management bebas cabang
    // (branch_id NULL, is_branch_in_scope bypass via role).

    rows.forEach((row, i) => {
      const rowNum = i + 2 // sheet row (1-based, +1 for skipped header)
      const [emailRaw, namaRaw, /* gaji */, idCabangRaw, staffIdRaw, jabatanRaw, phoneRaw, pinRaw] = row

      const idCabang = String(idCabangRaw || '').trim()
      if (RAOS_ALLOWED_BRANCHES.indexOf(idCabang) < 0) return // bukan cabang aktif — lewati

      // Auto-map slug ID CABANG → branches.id (P1.4). Head Office → NULL (bebas cabang).
      const branchId = branchMap[idCabang] || null

      const email = String(emailRaw || '').trim().toLowerCase()
      const nama = String(namaRaw || '').replace(/⁠/g, '').trim() // buang word joiner
      const staffId = String(staffIdRaw || '').trim()
      const role = mapJabatanToRole_(jabatanRaw)
      const phone = String(phoneRaw || '').trim() || null

      if (!email || !staffId || !nama) {
        warnings.push(`Baris ${rowNum}: email/nama/staff_id kosong, dilewati`)
        skipped++
        return
      }
      if (!role) {
        warnings.push(`Baris ${rowNum} (${staffId}): jabatan "${jabatanRaw}" tidak dikenal, dilewati`)
        skipped++
        return
      }

      const pin = normalizePin_(pinRaw)
      if (!pin.valid) {
        warnings.push(`Baris ${rowNum} (${staffId} ${nama}): PIN ${pin.reason} — akun tetap dibuat tanpa password, staff harus pakai "Lupa Kata Sandi" untuk set PIN`)
      }

      seenStaffIds.push(staffId)

      try {
        // 1) Cari auth user by email
        const authIdResult = callSupabase(
          'rpc/get_auth_user_id_by_email',
          'POST',
          { p_email: email }
        )
        let authId = authIdResult // RPC returns raw uuid or null

        // 2) Kalau auth user belum ada → buat
        if (!authId) {
          const createBody = {
            email: email,
            email_confirm: true,
            user_metadata: { full_name: nama, staff_id: staffId },
          }
          if (pin.valid) createBody.password = pin.value

          const created = callSupabaseAuth_('admin/users', 'POST', createBody)
          authId = created.id
        } else if (pin.valid) {
          // 3) Auth user sudah ada + PIN valid → refresh password (idempotent)
          callSupabaseAuth_(`admin/users/${authId}`, 'PUT', { password: pin.value })
        }

        // 4) Upsert user_profiles
        const existingProfile = callSupabase(
          `user_profiles?id=eq.${authId}&select=id,source,staff_id,branch_id`
        )

        if (existingProfile && existingProfile.length > 0) {
          const existing = existingProfile[0]
          if (existing.source === 'manual') {
            // Baris manual (mis. admin awal) — jangan ditimpa sync
            warnings.push(`Baris ${rowNum} (${staffId}): user_profiles ${authId} sudah source=manual, dilewati`)
            skipped++
            return
          }
          // Update kolom SSoT + branch_id (auto-map dari slug ID CABANG, P1.4).
          // Sub-terminal Soeta (T1/T2/T3) tetap di-set admin manual dari /admin
          // — sheet SSOT tidak punya info terminal, hanya cabang top-level.
          const patch = {
            staff_id: staffId,
            full_name: nama,
            role: role,
            phone: phone,
            source: 'ssot_master_staff',
            ssot_synced_at: now,
            is_active: true,
          }
          // Hanya set branch_id kalau belum ada value spesifik (T1/T2/T3
          // yang di-set admin manual di /admin tidak boleh ditimpa cabang
          // top-level). Kalau existing NULL atau parent Soeta, isi.
          if (branchId && (!existing.branch_id || existing.branch_id === branchId)) {
            patch.branch_id = branchId
          }
          callSupabase(`user_profiles?id=eq.${authId}`, 'PATCH', patch)
          updated++
        } else {
          // Insert baru — branch_id auto-set dari slug SSOT.
          // Untuk staff Soeta, admin masih perlu refine ke T1/T2/T3 via /admin.
          callSupabase('user_profiles', 'POST', {
            id: authId,
            staff_id: staffId,
            full_name: nama,
            role: role,
            phone: phone,
            branch_id: branchId,
            source: 'ssot_master_staff',
            ssot_synced_at: now,
            is_active: true,
          })
          inserted++
        }
      } catch (e) {
        errors++
        logSistem('error', 'syncStaffFromSSOT', 'error',
          `Baris ${rowNum} (${staffId}): ${e.message}`)
      }
    })

    // Soft-delist staff SSoT yang hilang dari sheet — jaga histori (FK ke user_profiles.id)
    const currentSsot = callSupabase(
      'user_profiles?source=eq.ssot_master_staff&is_active=eq.true&select=id,staff_id'
    ) || []
    const stale = currentSsot.filter(p => seenStaffIds.indexOf(p.staff_id) < 0)

    stale.forEach(p => {
      try {
        callSupabase(`user_profiles?id=eq.${p.id}`, 'PATCH', {
          is_active: false,
          ssot_synced_at: now,
        })
        deactivated++
      } catch (e) {
        errors++
        logSistem('error', 'syncStaffFromSSOT', 'error',
          `Deactivate ${p.staff_id}: ${e.message}`)
      }
    })

    // Log warnings ke LOG SISTEM (satu baris per warning)
    warnings.forEach(w => logSistem('warning', 'syncStaffFromSSOT', 'warning', w))

    logSistem('sync', 'syncStaffFromSSOT', errors ? 'warning' : 'success',
      `${inserted} baru, ${updated} update, ${deactivated} nonaktif, ${skipped} dilewati, ${errors} error, ${warnings.length} peringatan`)

    if (typeof SpreadsheetApp !== 'undefined') {
      try {
        SpreadsheetApp.getUi().alert(
          '✅ Sync Staff Soeta (SSOT) Selesai\n\n' +
          `• Baru:      ${inserted}\n` +
          `• Update:    ${updated}\n` +
          `• Nonaktif:  ${deactivated}\n` +
          `• Dilewati:  ${skipped}\n` +
          `• Error:     ${errors}\n` +
          `• Peringatan:${warnings.length}\n\n` +
          'Cek sheet LOG SISTEM untuk detail (PIN pendek/kosong, dsb).'
        )
      } catch (e) { /* dipanggil dari trigger, tidak ada UI */ }
    }
  } catch (e) {
    logSistem('error', 'syncStaffFromSSOT', 'error', e.message)
    throw e
  }
}
