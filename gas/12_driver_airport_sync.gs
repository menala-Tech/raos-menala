// ============================================================
// 12_driver_airport_sync.gs — Sync Driver Airport dari SSOT
// ============================================================
//
// SUMBER SSOT: spreadsheet "Database Driver Airport" (7 tab cabang airport).
// Baca-only. Sync 1-arah ke Supabase raos_drivers + auth.users + user_profiles.
//
// PERFORMANCE OPTIMIZATION (2026-08-04):
// - Bulk upsert raos_drivers (1 HTTP call untuk 1500 rows)
// - Skip password refresh untuk driver yang sudah ter-provision (cached)
// - UrlFetchApp.fetchAll() parallel untuk auth API (new drivers only)
// - Bulk insert user_profiles untuk driver baru
//
// Target: dari 1-3 menit → 30-40 detik untuk full sync.
//
// KALAU ADMIN PERLU FORCE PASSWORD REFRESH (mis. bulk update PIN driver
// di SSOT dan mau langsung propagate): panggil resyncDriverAirportAuth()
// via Apps Script Editor.

const DRIVER_AIRPORT_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty('DRIVER_AIRPORT_SHEET_ID')
  || '1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc'

const DRIVER_AIRPORT_TABS = [
  'ID Rifim Airport Soeta',
  'ID Rifim Airport Batam',
  'ID Rifim Airport Jambi',
  'ID Rifim Airport Balikpapan',
  'ID Rifim Airport Manado',
  'ID Rifim Airport Pekanbaru',
  'ID Rifim Airport Makassar',
]

function getDriverAirportSpreadsheet_() {
  return SpreadsheetApp.openById(DRIVER_AIRPORT_SHEET_ID)
}

function syncDriverAirportFromSSOT() {
  const t0 = Date.now()
  let upsertedDrivers = 0, skippedNonSsot = 0, deactivated = 0, errors = 0
  let authProvisionedNew = 0, authCached = 0, authFailed = 0

  try {
    const ss = getDriverAirportSpreadsheet_()
    const branchMap = kpiBranchMap_()
    const now = new Date().toISOString()

    // ─── 1) Pre-fetch existing driver profiles (auth cache) ─────────────
    const existingProfilesRaw = callSupabase(
      'user_profiles?role=eq.driver&source=eq.ssot_driver_airport&is_active=eq.true&select=id,staff_id'
    ) || []
    const provisionedByStaffId = {}
    existingProfilesRaw.forEach(p => {
      if (p.staff_id) provisionedByStaffId[p.staff_id] = p.id
    })

    // ─── 2) Pre-fetch semua raos_drivers existing ───────────────────────
    const existingDriversRaw = callSupabase(
      'raos_drivers?select=driver_id,source,branch_id&limit=10000'
    ) || []
    const existingDriverMap = {}
    existingDriversRaw.forEach(d => { existingDriverMap[d.driver_id] = d })

    // ─── 3) Kumpulkan rows dari 7 tab ───────────────────────────────────
    const seenDriverIds = []
    const newForAuthProvision = [] // driver yang perlu auth create
    const bulkDriverPayload = []
    const availableTabNames = ss.getSheets().map(s => s.getName())

    DRIVER_AIRPORT_TABS.forEach(tabName => {
      const sh = ss.getSheetByName(tabName)
      if (!sh) {
        logSistem('warning', 'syncDriverAirportFromSSOT', 'warning',
          `Tab "${tabName}" tidak ditemukan (tersedia: ${availableTabNames.join(', ')})`)
        return
      }
      const branchId = branchMap[tabName] || null
      if (!branchId) {
        logSistem('warning', 'syncDriverAirportFromSSOT', 'warning',
          `Branch untuk "${tabName}" tidak ada di tabel branches — driver dibiarkan branch_id NULL`)
      }
      sh.getDataRange().getValues().slice(1).forEach(row => {
        const driverId = String(row[1] || '').trim()
        const namaDriver = String(row[2] || '').trim()
        if (!driverId) return

        const existing = existingDriverMap[driverId]
        if (existing && existing.source !== 'ssot_driver_airport') {
          // milik external / manual — jangan timpa
          skippedNonSsot++
          return
        }
        seenDriverIds.push(driverId)
        bulkDriverPayload.push({
          driver_id: driverId,
          name: namaDriver,
          branch_id: (existing && existing.branch_id) ? existing.branch_id : branchId,
          source: 'ssot_driver_airport',
          driver_type: 'airport',
          is_active: true,
          ssot_synced_at: now,
        })

        // Yang belum ter-provision auth
        if (!provisionedByStaffId[driverId] && driverId.length >= 6) {
          newForAuthProvision.push({
            driver_id: driverId,
            name: namaDriver,
            branch_id: branchId,
          })
        } else if (provisionedByStaffId[driverId]) {
          authCached++
        }
      })
    })

    // ─── 4) Bulk upsert raos_drivers (chunks 500) ───────────────────────
    const CHUNK = 500
    for (let i = 0; i < bulkDriverPayload.length; i += CHUNK) {
      const chunk = bulkDriverPayload.slice(i, i + CHUNK)
      try {
        _raosDriverBulkUpsert_(chunk)
        upsertedDrivers += chunk.length
      } catch (e) {
        errors++
        logSistem('error', 'syncDriverAirportFromSSOT', 'error',
          `Bulk raos_drivers chunk ${i}: ${e.message}`)
      }
    }

    // ─── 5) Refresh map raos_drivers UUID (untuk driver baru) ───────────
    // Setelah bulk upsert, kita perlu UUID mereka untuk user_profiles.driver_id FK.
    // Fetch UUID untuk semua driver yang perlu auth provisioning.
    if (newForAuthProvision.length) {
      const newIds = newForAuthProvision.map(d => d.driver_id)
      // Chunk fetch (IN clause bisa panjang, safe di 200)
      const uuidMap = {}
      for (let i = 0; i < newIds.length; i += 200) {
        const idSlice = newIds.slice(i, i + 200)
        const inList = idSlice.map(id => '"' + id.replace(/"/g, '\\"') + '"').join(',')
        const rows = callSupabase(
          'raos_drivers?driver_id=in.(' + inList + ')&select=id,driver_id'
        ) || []
        rows.forEach(r => { uuidMap[r.driver_id] = r.id })
      }

      // ─── 6) Parallel create auth users via fetchAll ────────────────────
      const authRequests = newForAuthProvision.map(d => ({
        driver: d,
        request: {
          url: CONFIG.SUPABASE_URL + '/auth/v1/admin/users',
          method: 'post',
          contentType: 'application/json',
          headers: {
            apikey: CONFIG.SUPABASE_KEY,
            Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
          },
          payload: JSON.stringify({
            email: d.driver_id + '@driver.rifim.local',
            password: d.driver_id,
            email_confirm: true,
            user_metadata: {
              full_name: d.name,
              driver_id_text: d.driver_id,
              role: 'driver',
            },
          }),
          muteHttpExceptions: true,
        },
      }))

      // fetchAll parallel dalam batch 50 (GAS quota ~100 concurrent)
      const AUTH_BATCH = 50
      const profileBulk = []
      for (let i = 0; i < authRequests.length; i += AUTH_BATCH) {
        const batch = authRequests.slice(i, i + AUTH_BATCH)
        const responses = UrlFetchApp.fetchAll(batch.map(b => b.request))
        for (let j = 0; j < batch.length; j++) {
          const { driver } = batch[j]
          const res = responses[j]
          const code = res.getResponseCode()
          let authId = null
          if (code >= 200 && code < 300) {
            try {
              authId = JSON.parse(res.getContentText()).id
            } catch (e) { /* ignore */ }
          } else if (code === 422 || res.getContentText().indexOf('already') >= 0) {
            // email exists — fetch existing auth id
            try {
              authId = callSupabase('rpc/get_auth_user_id_by_email', 'POST',
                { p_email: driver.driver_id + '@driver.rifim.local' })
              if (Array.isArray(authId)) authId = authId[0]
            } catch (e) { /* ignore */ }
          }

          if (!authId) {
            authFailed++
            logSistem('error', 'syncDriverAirportFromSSOT', 'error',
              `Create auth ${driver.driver_id}: HTTP ${code} ${res.getContentText().substring(0, 200)}`)
            continue
          }

          const raosDriverUuid = uuidMap[driver.driver_id]
          if (!raosDriverUuid) {
            authFailed++
            continue
          }

          profileBulk.push({
            id: authId,
            staff_id: driver.driver_id,
            full_name: driver.name,
            role: 'driver',
            driver_id: raosDriverUuid,
            branch_id: driver.branch_id,
            source: 'ssot_driver_airport',
            ssot_synced_at: now,
            is_active: true,
          })
          authProvisionedNew++
        }
      }

      // ─── 7) Bulk upsert user_profiles untuk auth users baru ────────────
      if (profileBulk.length) {
        for (let i = 0; i < profileBulk.length; i += CHUNK) {
          const chunk = profileBulk.slice(i, i + CHUNK)
          try {
            _raosUserProfilesBulkUpsert_(chunk)
          } catch (e) {
            errors++
            logSistem('error', 'syncDriverAirportFromSSOT', 'error',
              `Bulk user_profiles chunk ${i}: ${e.message}`)
          }
        }
      }
    }

    // ─── 8) Soft-delist stale drivers (1 batch PATCH) ───────────────────
    const staleIds = existingDriversRaw
      .filter(d => d.source === 'ssot_driver_airport' && seenDriverIds.indexOf(d.driver_id) < 0)
      .map(d => d.driver_id)
    if (staleIds.length) {
      try {
        const inList = staleIds.map(id => '"' + id.replace(/"/g, '\\"') + '"').join(',')
        callSupabase(
          'raos_drivers?driver_id=in.(' + inList + ')',
          'PATCH',
          { is_active: false, ssot_synced_at: now }
        )
        deactivated = staleIds.length
      } catch (e) {
        errors++
        logSistem('error', 'syncDriverAirportFromSSOT', 'error',
          `Batch deactivate: ${e.message}`)
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    const summary = `${upsertedDrivers} upsert, ${deactivated} nonaktif, ${skippedNonSsot} skip-non-ssot, ` +
      `${authProvisionedNew} auth baru, ${authCached} auth cached, ${authFailed} auth failed, ` +
      `${errors} error, ${elapsed}s`
    logSistem('sync', 'syncDriverAirportFromSSOT', errors ? 'warning' : 'success', summary)

    try {
      SpreadsheetApp.getUi().alert('✅ Sync Driver Airport (SSOT) Selesai\n\n' + summary)
    } catch (e) { /* trigger/webapp context */ }

    return {
      upserted: upsertedDrivers, deactivated, skippedNonSsot,
      authProvisionedNew, authCached, authFailed, errors, elapsed_s: Number(elapsed),
    }
  } catch (e) {
    logSistem('error', 'syncDriverAirportFromSSOT', 'error', e.message)
    throw e
  }
}

// Bulk upsert helper untuk user_profiles (driver auth entries)
function _raosUserProfilesBulkUpsert_(rows) {
  const res = UrlFetchApp.fetch(
    CONFIG.SUPABASE_URL + '/rest/v1/user_profiles?on_conflict=id',
    {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      payload: JSON.stringify(rows),
      muteHttpExceptions: true,
    }
  )
  const code = res.getResponseCode()
  if (code >= 400) throw new Error('HTTP ' + code + ': ' + res.getContentText().substring(0, 500))
}

/**
 * FORCE re-provision password untuk SEMUA driver airport (jangan skip cached).
 * Pakai kalau admin habis update PIN driver di SSOT dan mau langsung propagate
 * ke Supabase Auth password. Jalankan MANUAL dari Apps Script Editor.
 */
function resyncDriverAirportAuth() {
  const ss = getDriverAirportSpreadsheet_()
  const drivers = []
  DRIVER_AIRPORT_TABS.forEach(tab => {
    const sh = ss.getSheetByName(tab)
    if (!sh) return
    sh.getDataRange().getValues().slice(1).forEach(row => {
      const id = String(row[1] || '').trim()
      if (id && id.length >= 6) drivers.push(id)
    })
  })

  let ok = 0, failed = 0
  const requests = drivers.map(id => ({
    url: CONFIG.SUPABASE_URL + '/auth/v1/admin/users/' + id + '@driver.rifim.local',
    method: 'get',
    headers: {
      apikey: CONFIG.SUPABASE_KEY,
      Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
    },
    muteHttpExceptions: true,
  }))
  // Note: this is a stub — full re-provision would need PUT admin/users/{id}
  // per driver dengan new password. Kalau memang butuh, extend function ini.
  logSistem('sync', 'resyncDriverAirportAuth', 'info',
    `${drivers.length} driver — belum di-implementasi force refresh. Update code kalau perlu.`)
  return { drivers: drivers.length, ok, failed, note: 'not_implemented' }
}
