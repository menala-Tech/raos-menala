// ============================================================
// 13_staff_sync.gs — Sync Staff RAOS dari SSOT MASTER DATA STAFF
// ============================================================
//
// SUMBER SSOT (WAJIB, lihat SSOT_DATA_SOURCES.md di root workspace):
// Spreadsheet "DATABASE STAFF" — SATU-SATUNYA sumber data staff untuk seluruh
// sistem RIFIM, dipakai bersama oleh semua PWA. RAOS HANYA boleh membaca
// (read-only), tidak pernah menulis balik ke sheet.
//
// Arah sync: Google Sheets → Supabase (satu arah). Kolom SSOT (full_name,
// role, phone, staff_id) di-refresh tiap sync + PIN → password Supabase Auth;
// kolom milik RAOS sendiri (branch_id / Terminal T1/T2/T3, avatar_url) TIDAK
// PERNAH ditimpa sync — itu diset admin lewat /admin.
//
// FASE 3 Poin E (2026-08-08):
// - kolom "Role Sistem" menjadi override role bila diisi.
// - bila kosong/tidak ada, fallback ke mapping "Jabatan" existing.
// - lookup kolom memakai header, bukan posisi fixed, supaya insert Role Sistem
//   setelah Jabatan tidak menggeser No WA / Pin / RAOS PIN.

const MASTER_STAFF_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty('MASTER_STAFF_SHEET_ID')
  || '1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw'

const MASTER_STAFF_TAB_NAME = 'MASTER DATA STAFF'
const SYSTEM_ROLE_VALUES = [
  'staff', 'koordinator', 'admin', 'management', 'direksi', 'driver_manager', 'driver',
]

// Post sesi 17 lanjutan: RAOS jadi hub multi-PWA — sync SEMUA staff RIFIM.
const SKIP_CABANG_SYNC = [] // kosong = tarik semua

const GEOFENCE_EXEMPT_STAFF_PATTERNS = [
  /^gusril/i,
  /^hadityawarman/i,
]

function isStaffGeofenceExempt_(namaLengkap) {
  const s = String(namaLengkap || '').trim()
  return GEOFENCE_EXEMPT_STAFF_PATTERNS.some(re => re.test(s))
}

// DEPRECATED post sesi 17 lanjutan — filter dihapus, tarik semua staff RIFIM.
const RAOS_ALLOWED_BRANCHES_LEGACY = [
  'ID Rifim Airport Soeta', 'ID Rifim Airport Batam', 'ID Rifim Airport Jambi',
  'ID Rifim Airport Balikpapan', 'ID Rifim Airport Manado',
  'ID Rifim Airport Pekanbaru', 'ID Rifim Airport Makassar',
  'ID Rifim Batam', 'ID Rifim Jambi Luar', 'Head Office',
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
  if (code >= 400) throw new Error(`Auth API ${code}: ${text}`)
  return text ? JSON.parse(text) : null
}

function mapJabatanToRole_(jabatan) {
  const j = String(jabatan || '').trim().toUpperCase()
  if (j === 'DIREKSI') return 'direksi'
  if (j === 'MANAGEMENT') return 'management'
  if (j === 'KOORDINATOR') return 'koordinator'
  if (j === 'ADMIN') return 'admin'
  if (j === 'DRIVER MANAGER' || j === 'DRIVER MGR') return 'driver_manager'
  if (j === 'STAFF KONTER' || j === 'PICKUP POINT') return 'staff'
  return null
}

function normalizeStaffHeader_(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function findStaffColumn_(headers, names, fallback) {
  const normalized = headers.map(normalizeStaffHeader_)
  for (let i = 0; i < names.length; i++) {
    const idx = normalized.indexOf(normalizeStaffHeader_(names[i]))
    if (idx >= 0) return idx
  }
  return fallback
}

/**
 * Header-aware index map. Fallback A-H menjaga backward compatibility bila
 * sheet lama belum memiliki Role Sistem.
 */
function getStaffSheetColumns_(headers) {
  return {
    email: findStaffColumn_(headers, ['Email'], 0),
    nama: findStaffColumn_(headers, ['Nama'], 1),
    gaji: findStaffColumn_(headers, ['Gaji Staff', 'Gaji'], 2),
    idCabang: findStaffColumn_(headers, ['ID CABANG', 'ID Cabang'], 3),
    staffId: findStaffColumn_(headers, ['ID Staff', 'Staff ID'], 4),
    jabatan: findStaffColumn_(headers, ['Jabatan'], 5),
    roleSistem: findStaffColumn_(headers, ['Role Sistem'], -1),
    phone: findStaffColumn_(headers, ['No WA Staff', 'No  WA Staff', 'No WA'], 6),
    pin: findStaffColumn_(headers, ['Pin', 'PIN'], 7),
  }
}

function resolveSystemRole_(roleSistemRaw, jabatanRaw) {
  const explicit = String(roleSistemRaw || '').trim().toLowerCase()
  if (!explicit) return { role: mapJabatanToRole_(jabatanRaw), source: 'jabatan' }
  if (SYSTEM_ROLE_VALUES.indexOf(explicit) >= 0) return { role: explicit, source: 'role_sistem' }
  return { role: null, source: 'role_sistem_invalid', raw: explicit }
}

/** Parse "Rp 2.700.000" atau "2700000" → 2700000. Return null kalau invalid. */
function parseGajiSsot_(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return isFinite(raw) ? raw : null
  const s = String(raw).replace(/rp/i, '').replace(/[.\s]/g, '').replace(/,/g, '.').trim()
  if (!s) return null
  const n = parseFloat(s)
  return isFinite(n) && n >= 0 ? n : null
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
  const t0 = Date.now()
  let upserted = 0, deactivated = 0, skipped = 0, errors = 0, authNew = 0, authCached = 0
  const warnings = []

  try {
    const sh = getMasterStaffSheet_()
    const values = sh.getDataRange().getValues()
    if (!values.length) throw new Error('MASTER DATA STAFF kosong')
    const headers = values[0] || []
    const cols = getStaffSheetColumns_(headers)
    const rowsRaw = values.slice(1)
    const now = new Date().toISOString()
    const branchMap = kpiBranchMap_()

    // ─── 1) Parse + validate semua rows (in-memory, tanpa HTTP) ─────────
    const validRows = []
    const seenStaffIds = []
    rowsRaw.forEach((row, i) => {
      const rowNum = i + 2
      const emailRaw = row[cols.email]
      const namaRaw = row[cols.nama]
      const gajiRaw = row[cols.gaji]
      const idCabangRaw = row[cols.idCabang]
      const staffIdRaw = row[cols.staffId]
      const jabatanRaw = row[cols.jabatan]
      const roleSistemRaw = cols.roleSistem >= 0 ? row[cols.roleSistem] : ''
      const phoneRaw = row[cols.phone]
      const pinRaw = row[cols.pin]

      const idCabang = String(idCabangRaw || '').trim()
      if (SKIP_CABANG_SYNC.indexOf(idCabang) >= 0) return
      if (!idCabang) return

      const email = String(emailRaw || '').trim().toLowerCase()
      const nama = String(namaRaw || '').replace(/⁠/g, '').trim()
      const staffId = String(staffIdRaw || '').trim()
      const roleResult = resolveSystemRole_(roleSistemRaw, jabatanRaw)
      const role = roleResult.role
      const phone = String(phoneRaw || '').trim() || null
      const gaji = parseGajiSsot_(gajiRaw)
      const branchId = branchMap[idCabang] || null

      if (idCabang && !branchId && idCabang !== 'Head Office' && idCabang !== 'Admin') {
        warnings.push(`Baris ${rowNum} (${staffId}): cabang "${idCabang}" tidak ada di branches — branch_id NULL`)
      }
      if (!email || !staffId || !nama) {
        warnings.push(`Baris ${rowNum}: email/nama/staff_id kosong, skip`)
        skipped++
        return
      }
      if (!role) {
        const why = roleResult.source === 'role_sistem_invalid'
          ? `Role Sistem "${roleSistemRaw}" tidak valid`
          : `jabatan "${jabatanRaw}" unknown`
        warnings.push(`Baris ${rowNum} (${staffId}): ${why}, skip`)
        skipped++
        return
      }
      const pin = normalizePin_(pinRaw)
      if (!pin.valid) {
        warnings.push(`Baris ${rowNum} (${staffId} ${nama}): PIN ${pin.reason} — password tidak di-set`)
      }
      seenStaffIds.push(staffId)
      validRows.push({ rowNum, email, nama, staffId, role, phone, gaji, pin, branchId })
    })

    // ─── 2) Pre-fetch semua user_profiles source SSOT (1 call) ──────────
    const existingRaw = callSupabase(
      'user_profiles?source=eq.ssot_master_staff&select=id,staff_id,source,branch_id&limit=1000'
    ) || []
    const profilesByStaffId = {}
    existingRaw.forEach(p => { if (p.staff_id) profilesByStaffId[p.staff_id] = p })

    const manualRaw = callSupabase(
      'user_profiles?source=eq.manual&select=id&limit=200'
    ) || []
    const manualAuthIds = {}
    manualRaw.forEach(p => { manualAuthIds[p.id] = true })

    // ─── 3) Klasifikasi rows → cached / new-auth-needed ─────────────────
    const cachedRows = []
    const newAuthRows = []
    validRows.forEach(r => {
      const existing = profilesByStaffId[r.staffId]
      if (existing) {
        r.authId = existing.id
        r.existingBranch = existing.branch_id
        cachedRows.push(r)
      } else {
        newAuthRows.push(r)
      }
    })

    // ─── 4) Parallel create auth users untuk yang baru ──────────────────
    if (newAuthRows.length) {
      const requests = newAuthRows.map(r => {
        const payload = {
          email: r.email,
          email_confirm: true,
          user_metadata: { full_name: r.nama, staff_id: r.staffId },
        }
        if (r.pin.valid) payload.password = r.pin.value
        return {
          url: CONFIG.SUPABASE_URL + '/auth/v1/admin/users',
          method: 'post',
          contentType: 'application/json',
          headers: {
            apikey: CONFIG.SUPABASE_KEY,
            Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        }
      })
      const AUTH_BATCH = 50
      for (let i = 0; i < requests.length; i += AUTH_BATCH) {
        const batchReq = requests.slice(i, i + AUTH_BATCH)
        const batchRow = newAuthRows.slice(i, i + AUTH_BATCH)
        const responses = UrlFetchApp.fetchAll(batchReq)
        for (let j = 0; j < responses.length; j++) {
          const res = responses[j]
          const code = res.getResponseCode()
          const r = batchRow[j]
          if (code >= 200 && code < 300) {
            try { r.authId = JSON.parse(res.getContentText()).id; authNew++ }
            catch (e) { errors++; warnings.push(`${r.staffId}: parse auth create response fail`) }
          } else if (code === 422 || res.getContentText().indexOf('already') >= 0) {
            try {
              const looked = callSupabase('rpc/get_auth_user_id_by_email', 'POST', { p_email: r.email })
              r.authId = Array.isArray(looked) ? looked[0] : looked
              if (r.authId) authNew++
            } catch (e) { errors++ }
          } else {
            errors++
            logSistem('error', 'syncStaffFromSSOT', 'error',
              `Baris ${r.rowNum} (${r.staffId}) auth create: HTTP ${code} ${res.getContentText().substring(0, 200)}`)
          }
        }
      }
    }
    authCached = cachedRows.length

    // ─── 5) Build bulk payload user_profiles upsert ─────────────────────
    const bulkPayload = []
    validRows.forEach(r => {
      if (!r.authId) return
      if (manualAuthIds[r.authId]) {
        warnings.push(`Baris ${r.rowNum} (${r.staffId}): source=manual, skip`)
        skipped++
        return
      }
      const p = {
        id: r.authId,
        staff_id: r.staffId,
        full_name: r.nama,
        role: r.role,
        phone: r.phone,
        gaji: r.gaji,
        source: 'ssot_master_staff',
        ssot_synced_at: now,
        is_active: true,
        is_geofence_exempt: isStaffGeofenceExempt_(r.nama),
      }
      // Preserve branch_id kalau existing punya value spesifik (T1/T2/T3 admin manual)
      if (r.branchId && (!r.existingBranch || r.existingBranch === r.branchId)) {
        p.branch_id = r.branchId
      } else if (r.existingBranch) {
        p.branch_id = r.existingBranch
      } else {
        p.branch_id = r.branchId
      }
      bulkPayload.push(p)
    })

    // ─── 6a) Dedup bulkPayload by id ────────────────────────────────────
    const dedupMap = {}
    const dupWarnings = []
    bulkPayload.forEach(p => {
      if (dedupMap[p.id]) {
        dupWarnings.push(
          `Duplicate authId ${p.id.substring(0, 8)}…: ${dedupMap[p.id].staff_id}/${dedupMap[p.id].full_name} ` +
          `dan ${p.staff_id}/${p.full_name} — pakai row terakhir. Cek sheet SSOT: staff_id sama untuk 2 email berbeda.`
        )
      }
      dedupMap[p.id] = p
    })
    const dedupedPayload = Object.values(dedupMap)
    if (dupWarnings.length) {
      dupWarnings.forEach(w => {
        warnings.push(w)
        logSistem('warning', 'syncStaffFromSSOT', 'warning', w)
      })
    }

    // ─── 6b) Bulk upsert (chunks 500) ───────────────────────────────────
    for (let i = 0; i < dedupedPayload.length; i += 500) {
      const chunk = dedupedPayload.slice(i, i + 500)
      try {
        _raosUserProfilesBulkUpsert_(chunk)
        upserted += chunk.length
      } catch (e) {
        errors++
        logSistem('error', 'syncStaffFromSSOT', 'error',
          `Bulk upsert chunk ${i}: ${e.message}`)
      }
    }

    // ─── 7) Soft-delist stale (batch PATCH via IN filter, chunks 100) ────
    const staleIds = existingRaw
      .filter(p => p.staff_id && seenStaffIds.indexOf(p.staff_id) < 0)
      .map(p => p.id)
    if (staleIds.length) {
      let deactCount = 0
      for (let i = 0; i < staleIds.length; i += 100) {
        const slice = staleIds.slice(i, i + 100)
        try {
          const inList = slice.map(id => encodeURIComponent(id)).join(',')
          callSupabase(
            'user_profiles?id=in.(' + inList + ')',
            'PATCH',
            { is_active: false, ssot_synced_at: now }
          )
          deactCount += slice.length
        } catch (e) {
          errors++
          logSistem('error', 'syncStaffFromSSOT', 'error',
            `Batch deactivate chunk ${i}: ${e.message}`)
        }
      }
      deactivated = deactCount
    }

    warnings.slice(0, 50).forEach(w => logSistem('warning', 'syncStaffFromSSOT', 'warning', w))

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    const summary = `${upserted} upsert, ${authNew} auth baru, ${authCached} auth cached, ` +
      `${deactivated} nonaktif, ${skipped} dilewati, ${errors} error, ${warnings.length} peringatan, ${elapsed}s`
    logSistem('sync', 'syncStaffFromSSOT', errors ? 'warning' : 'success', summary)

    try { SpreadsheetApp.getUi().alert('✅ Sync Staff Selesai\n\n' + summary) }
    catch (e) { /* trigger/webapp context */ }

    return { upserted, authNew, authCached, deactivated, skipped, errors, warnings: warnings.length, elapsed_s: Number(elapsed) }
  } catch (e) {
    logSistem('error', 'syncStaffFromSSOT', 'error', e.message)
    throw e
  }
}

/**
 * FORCE refresh Supabase Auth password untuk SEMUA staff SSOT yg PIN-nya valid.
 * Header-based agar aman bila Role Sistem disisipkan setelah Jabatan.
 */
function forceRefreshStaffAuth() {
  const t0 = Date.now()
  let refreshed = 0, skippedNoPin = 0, skippedNoAuth = 0, failed = 0

  try {
    const sh = getMasterStaffSheet_()
    const values = sh.getDataRange().getValues()
    if (!values.length) throw new Error('MASTER DATA STAFF kosong')
    const headers = values[0] || []
    const cols = getStaffSheetColumns_(headers)
    const rowsRaw = values.slice(1)

    const profiles = callSupabase(
      'user_profiles?source=eq.ssot_master_staff&select=id,staff_id&limit=1000'
    ) || []
    const authByStaffId = {}
    profiles.forEach(p => { if (p.staff_id) authByStaffId[p.staff_id] = p.id })

    const targets = []
    rowsRaw.forEach(row => {
      const staffId = String(row[cols.staffId] || '').trim()
      const pin = normalizePin_(row[cols.pin])
      if (!staffId) return
      if (!pin.valid) { skippedNoPin++; return }
      const authId = authByStaffId[staffId]
      if (!authId) { skippedNoAuth++; return }
      targets.push({ staffId, authId, password: pin.value })
    })

    const requests = targets.map(t => ({
      url: CONFIG.SUPABASE_URL + '/auth/v1/admin/users/' + t.authId,
      method: 'put',
      contentType: 'application/json',
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
      },
      payload: JSON.stringify({ password: t.password }),
      muteHttpExceptions: true,
    }))

    const BATCH = 50
    for (let i = 0; i < requests.length; i += BATCH) {
      const batchReq = requests.slice(i, i + BATCH)
      const batchTgt = targets.slice(i, i + BATCH)
      const responses = UrlFetchApp.fetchAll(batchReq)
      for (let j = 0; j < responses.length; j++) {
        const code = responses[j].getResponseCode()
        if (code >= 200 && code < 300) refreshed++
        else {
          failed++
          logSistem('error', 'forceRefreshStaffAuth', 'error',
            `${batchTgt[j].staffId} PUT auth: HTTP ${code}`)
        }
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    const summary = `${refreshed} refreshed, ${skippedNoPin} skip-no-pin, ${skippedNoAuth} skip-no-auth, ${failed} failed, ${elapsed}s`
    logSistem('sync', 'forceRefreshStaffAuth', failed ? 'warning' : 'success', summary)

    try { SpreadsheetApp.getUi().alert('✅ Force Refresh Staff Auth Selesai\n\n' + summary) }
    catch (e) { /* webapp/trigger */ }

    return { refreshed, skippedNoPin, skippedNoAuth, failed, elapsed_s: Number(elapsed) }
  } catch (e) {
    logSistem('error', 'forceRefreshStaffAuth', 'error', e.message)
    throw e
  }
}
