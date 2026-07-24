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

function syncDriverAirportFromSSOT() {
  let inserted = 0, updated = 0, deactivated = 0, errors = 0

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

          if (existing && existing.length > 0) {
            if (existing[0].source !== 'ssot_driver_airport') {
              logSistem('warning', 'syncDriverAirportFromSSOT', 'warning',
                `Driver ${idStr} sudah ada dengan source=manual, dilewati (tidak ditimpa)`)
              return
            }
            const patch = {
              name: String(namaDriver).trim(),
              is_active: true,
              ssot_synced_at: new Date().toISOString(),
            }
            // Set branch_id kalau belum ada nilai eksplisit — jangan timpa
            // kalau admin sudah pindahkan driver ke cabang lain manual.
            if (branchId && !existing[0].branch_id) patch.branch_id = branchId
            callSupabase(`raos_drivers?driver_id=eq.${encodeURIComponent(idStr)}`, 'PATCH', patch)
            updated++
          } else {
            callSupabase('raos_drivers', 'POST', {
              driver_id: idStr,
              name: String(namaDriver).trim(),
              branch_id: branchId,
              source: 'ssot_driver_airport',
              is_active: true,
              ssot_synced_at: new Date().toISOString(),
            })
            inserted++
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
