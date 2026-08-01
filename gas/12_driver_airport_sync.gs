// ============================================================
// 12_driver_airport_sync.gs — Sync Driver Airport dari SSOT
// ============================================================
//
// SUMBER SSOT (WAJIB, lihat SSOT_DATA_SOURCES.md di root workspace):
// Spreadsheet "Database Driver Airport" — SATU-SATUNYA sumber data driver
// airport untuk SEMUA cabang RIFIM, dipakai bersama oleh semua PWA.
// RAOS HANYA boleh membaca (read-only), tidak pernah menulis balik ke sheet.
//
// Multi-cabang (P1.4, sesi 16 lanjutan) — RAOS sekarang tarik SEMUA tab
// airport aktif di spreadsheet SSOT. Setiap tab = 1 cabang → mapping
// tab-slug ke branch_id lewat kolom slug branches.
//
// Arah sync: Google Sheets → Supabase (satu arah). Kolom SSOT (driver_id,
// name, is_active) di-refresh; kolom RAOS (phone, vehicle_*, barcode,
// branch_id) di-set otomatis pertama kali dari tab, tapi tidak akan ditimpa
// kalau admin sudah refine manual.

const DRIVER_AIRPORT_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty('DRIVER_AIRPORT_SHEET_ID')
  || '1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc'

// Kolom tab SSOT (0-based): 0:No  1:ID Driver  2:Nama Driver  3:Cabang

/** Semua tab airport aktif — nama tab = slug branches. */
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

/**
 * Provision Supabase Auth user + user_profiles untuk driver.
 * Idempotent: kalau auth user sudah ada, refresh password (biar admin bisa
 * ubah PIN via update SSOT). Kalau user_profiles sudah ada + source=manual,
 * skip supaya baris manual tidak ditimpa.
 *
 * Email pattern: <driver_id>@driver.rifim.local (dummy, tidak dipakai kirim).
 * Password default: driver_id itu sendiri (numeric, min 9 digit dari SSOT).
 *
 * Return true kalau berhasil provision/refresh, false kalau di-skip / error.
 */
function provisionDriverAuth_(driverRaosId, driverIdText, driverName, branchId) {
  if (!driverIdText || String(driverIdText).length < 6) return false
  const email = `${driverIdText}@driver.rifim.local`
  const password = String(driverIdText)

  // 1) Cari auth user existing by email
  let authId = null
  try {
    authId = callSupabase('rpc/get_auth_user_id_by_email', 'POST', { p_email: email })
  } catch (e) {
    // RPC gagal — log tapi tetap coba create (kalau exists, GoTrue akan 422)
    logSistem('warning', 'provisionDriverAuth_', 'warning',
      `Lookup auth user ${email} gagal: ${e.message}`)
  }

  // 2) Kalau belum ada → create
  if (!authId) {
    try {
      const created = callSupabaseAuth_('admin/users', 'POST', {
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: driverName, driver_id_text: driverIdText, role: 'driver' },
      })
      authId = created && created.id
    } catch (e) {
      // Kalau 422 email_exists, coba lookup ulang
      if (String(e.message).indexOf('422') >= 0 || String(e.message).indexOf('already') >= 0) {
        try {
          authId = callSupabase('rpc/get_auth_user_id_by_email', 'POST', { p_email: email })
        } catch (e2) { /* ignore */ }
      }
      if (!authId) {
        logSistem('error', 'provisionDriverAuth_', 'error',
          `Create auth user ${email}: ${e.message}`)
        return false
      }
    }
  } else {
    // 3) Refresh password idempotent — supaya update SSOT propagate ke login
    try {
      callSupabaseAuth_(`admin/users/${authId}`, 'PUT', { password: password })
    } catch (e) {
      logSistem('warning', 'provisionDriverAuth_', 'warning',
        `Refresh password ${email}: ${e.message}`)
    }
  }

  // 4) Upsert user_profiles
  try {
    const existingProfile = callSupabase(
      `user_profiles?id=eq.${authId}&select=id,source,driver_id`
    )
    const now = new Date().toISOString()
    if (existingProfile && existingProfile.length > 0) {
      const existing = existingProfile[0]
      if (existing.source === 'manual') {
        // Manual entry → jangan ditimpa
        return false
      }
      callSupabase(`user_profiles?id=eq.${authId}`, 'PATCH', {
        full_name: driverName,
        role: 'driver',
        driver_id: driverRaosId,
        branch_id: branchId,
        source: 'ssot_driver_airport',
        ssot_synced_at: now,
        is_active: true,
      })
    } else {
      callSupabase('user_profiles', 'POST', {
        id: authId,
        staff_id: driverIdText,          // reuse staff_id column for driver_id text
        full_name: driverName,
        role: 'driver',
        driver_id: driverRaosId,
        branch_id: branchId,
        source: 'ssot_driver_airport',
        ssot_synced_at: now,
        is_active: true,
      })
    }
    return true
  } catch (e) {
    logSistem('error', 'provisionDriverAuth_', 'error',
      `Upsert user_profiles driver ${driverIdText}: ${e.message}`)
    return false
  }
}

function syncDriverAirportFromSSOT() {
  let inserted = 0, updated = 0, deactivated = 0, errors = 0
  let authProvisioned = 0, authSkipped = 0

  try {
    const ss = getDriverAirportSpreadsheet_()
    const branchMap = kpiBranchMap_() // dari 13_staff_sync.gs — slug → branch_id
    const seenDriverIds = []
    const availableTabNames = ss.getSheets().map(s => s.getName())

    DRIVER_AIRPORT_TABS.forEach(tabName => {
      const sh = ss.getSheetByName(tabName)
      if (!sh) {
        logSistem('warning', 'syncDriverAirportFromSSOT', 'warning',
          `Tab "${tabName}" tidak ditemukan di SSOT (tersedia: ${availableTabNames.join(', ')})`)
        return
      }
      const branchId = branchMap[tabName] || null
      if (!branchId) {
        logSistem('warning', 'syncDriverAirportFromSSOT', 'warning',
          `Branch untuk slug "${tabName}" tidak ditemukan di tabel branches — driver akan di-set branch_id NULL`)
      }
      const rows = sh.getDataRange().getValues().slice(1) // skip header

      rows.forEach((row, i) => {
        const [, driverId, namaDriver] = row
        if (!driverId) return

        const idStr = String(driverId).trim()
        seenDriverIds.push(idStr)

        try {
          const existing = callSupabase(
            `raos_drivers?driver_id=eq.${encodeURIComponent(idStr)}&select=id,source,branch_id`
          )

          let raosDriverUuid = null
          if (existing && existing.length > 0) {
            if (existing[0].source !== 'ssot_driver_airport') {
              logSistem('warning', 'syncDriverAirportFromSSOT', 'warning',
                `Driver ${idStr} sudah ada dengan source=manual, dilewati (tidak ditimpa)`)
              return
            }
            raosDriverUuid = existing[0].id
            const patch = {
              name: String(namaDriver).trim(),
              is_active: true,
              driver_type: 'airport',
              ssot_synced_at: new Date().toISOString(),
            }
            // Set branch_id kalau belum ada nilai eksplisit — jangan timpa
            // kalau admin sudah pindahkan driver ke cabang lain manual.
            if (branchId && !existing[0].branch_id) patch.branch_id = branchId
            callSupabase(`raos_drivers?driver_id=eq.${encodeURIComponent(idStr)}`, 'PATCH', patch)
            updated++
          } else {
            const created = callSupabase('raos_drivers?select=id', 'POST', {
              driver_id: idStr,
              name: String(namaDriver).trim(),
              branch_id: branchId,
              source: 'ssot_driver_airport',
              driver_type: 'airport',
              is_active: true,
              ssot_synced_at: new Date().toISOString(),
            })
            raosDriverUuid = (created && created[0] && created[0].id) || null
            inserted++
          }

          // Provision auth user + user_profiles (idempotent).
          // ID Driver di SSOT = username/password login (per feedback 1 Agu 2026).
          if (raosDriverUuid) {
            const ok = provisionDriverAuth_(raosDriverUuid, idStr, String(namaDriver).trim(), branchId)
            if (ok) authProvisioned++
            else authSkipped++
          }
        } catch (e) {
          errors++
          logSistem('error', 'syncDriverAirportFromSSOT', 'error',
            `${tabName} baris ${i + 2} (${idStr}): ${e.message}`)
        }
      })
    })

    // Nonaktifkan driver ssot_driver_airport yang sudah tidak ada di sheet
    // (soft-delist, bukan delete — jaga histori scan_orders/FK)
    const currentSsotDrivers = callSupabase(
      `raos_drivers?source=eq.ssot_driver_airport&is_active=eq.true&select=driver_id`
    ) || []
    const stale = currentSsotDrivers.filter(d => !seenDriverIds.includes(d.driver_id))

    stale.forEach(d => {
      try {
        callSupabase(`raos_drivers?driver_id=eq.${encodeURIComponent(d.driver_id)}`, 'PATCH', {
          is_active: false,
          ssot_synced_at: new Date().toISOString(),
        })
        deactivated++
      } catch (e) {
        errors++
        logSistem('error', 'syncDriverAirportFromSSOT', 'error', `Deactivate ${d.driver_id}: ${e.message}`)
      }
    })

    logSistem('sync', 'syncDriverAirportFromSSOT', errors ? 'warning' : 'success',
      `${inserted} baru, ${updated} update, ${deactivated} nonaktif, ${authProvisioned} auth OK, ${authSkipped} auth skip, ${errors} error`)

    if (typeof SpreadsheetApp !== 'undefined') {
      try {
        SpreadsheetApp.getUi().alert(
          `✅ Sync Driver Airport (SSOT) Selesai\n\n• Baru: ${inserted}\n• Update: ${updated}\n• Nonaktif (hilang dari sheet): ${deactivated}\n• Auth login OK: ${authProvisioned}\n• Auth skipped/error: ${authSkipped}\n• Error: ${errors}\n\nCek sheet LOG SISTEM untuk detail.`
        )
      } catch (e) { /* dipanggil dari trigger, bukan menu — tidak ada UI */ }
    }
  } catch (e) {
    logSistem('error', 'syncDriverAirportFromSSOT', 'error', e.message)
    throw e
  }
}
