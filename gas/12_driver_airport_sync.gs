// ============================================================
// 12_driver_airport_sync.gs — Sync Driver Airport dari SSOT
// ============================================================
//
// SUMBER SSOT (WAJIB, lihat SSOT_DATA_SOURCES.md di root workspace):
// Spreadsheet "Database Driver Airport" — SATU-SATUNYA sumber data driver
// airport untuk SEMUA cabang RIFIM, dipakai bersama oleh semua PWA.
// RAOS HANYA boleh membaca (read-only), tidak pernah menulis balik ke sheet.
//
// RAOS = Bandara Soekarno-Hatta ("Soeta") → hanya tarik tab
// "ID Rifim Airport Soeta" dari spreadsheet itu, BUKAN cabang lain.
//
// Arah sync: Google Sheets → Supabase (satu arah). Kolom SSOT (driver_id,
// name, is_active) di-refresh tiap sync; kolom milik RAOS sendiri (phone,
// vehicle_type, vehicle_plate, barcode, branch_id — diisi manual via
// /admin) TIDAK PERNAH ditimpa oleh sync ini.

const DRIVER_AIRPORT_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty('DRIVER_AIRPORT_SHEET_ID')
  || '1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc'

const DRIVER_AIRPORT_TAB_NAME = 'ID Rifim Airport Soeta'

// Kolom tab SSOT (0-based): 0:No  1:ID Driver  2:Nama Driver  3:Cabang

function getDriverAirportSheet_() {
  const ss = SpreadsheetApp.openById(DRIVER_AIRPORT_SHEET_ID)
  let sh = ss.getSheetByName(DRIVER_AIRPORT_TAB_NAME)

  if (!sh) {
    // Fallback: cari tab yang namanya mengandung "Soeta" kalau nama persis
    // berubah di spreadsheet SSOT (mis. spasi/kapitalisasi beda)
    const fallback = ss.getSheets().find(s => /soeta/i.test(s.getName()))
    if (fallback) {
      logSistem('warning', 'getDriverAirportSheet_', 'warning',
        `Tab "${DRIVER_AIRPORT_TAB_NAME}" tidak ditemukan, pakai fallback "${fallback.getName()}"`)
      sh = fallback
    }
  }

  if (!sh) {
    const allNames = ss.getSheets().map(s => s.getName()).join(', ')
    throw new Error(`Tab driver Soeta tidak ditemukan di spreadsheet SSOT. Tab tersedia: ${allNames}`)
  }
  return sh
}

function syncDriverAirportFromSSOT() {
  let inserted = 0, updated = 0, deactivated = 0, errors = 0

  try {
    const sh = getDriverAirportSheet_()
    const rows = sh.getDataRange().getValues().slice(1) // skip header
    const seenDriverIds = []

    rows.forEach((row, i) => {
      const [, driverId, namaDriver] = row
      if (!driverId) return

      const idStr = String(driverId).trim()
      seenDriverIds.push(idStr)

      try {
        const existing = callSupabase(
          `raos_drivers?driver_id=eq.${encodeURIComponent(idStr)}&select=id,source`
        )

        if (existing && existing.length > 0) {
          if (existing[0].source !== 'ssot_driver_airport') {
            // Driver sudah ada tapi diinput manual sebelumnya — jangan
            // timpa, cukup log supaya kelihatan ada duplikat potensial.
            logSistem('warning', 'syncDriverAirportFromSSOT', 'warning',
              `Driver ${idStr} sudah ada dengan source=manual, dilewati (tidak ditimpa)`)
            return
          }
          callSupabase(`raos_drivers?driver_id=eq.${encodeURIComponent(idStr)}`, 'PATCH', {
            name: String(namaDriver).trim(),
            is_active: true,
            ssot_synced_at: new Date().toISOString(),
          })
          updated++
        } else {
          callSupabase('raos_drivers', 'POST', {
            driver_id: idStr,
            name: String(namaDriver).trim(),
            source: 'ssot_driver_airport',
            is_active: true,
            ssot_synced_at: new Date().toISOString(),
          })
          inserted++
        }
      } catch (e) {
        errors++
        logSistem('error', 'syncDriverAirportFromSSOT', 'error', `Baris ${i + 2} (${idStr}): ${e.message}`)
      }
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
      `${inserted} baru, ${updated} update, ${deactivated} nonaktif, ${errors} error`)

    if (typeof SpreadsheetApp !== 'undefined') {
      try {
        SpreadsheetApp.getUi().alert(
          `✅ Sync Driver Airport (SSOT) Selesai\n\n• Baru: ${inserted}\n• Update: ${updated}\n• Nonaktif (hilang dari sheet): ${deactivated}\n• Error: ${errors}\n\nCek sheet LOG SISTEM untuk detail.`
        )
      } catch (e) { /* dipanggil dari trigger, bukan menu — tidak ada UI */ }
    }
  } catch (e) {
    logSistem('error', 'syncDriverAirportFromSSOT', 'error', e.message)
    throw e
  }
}
