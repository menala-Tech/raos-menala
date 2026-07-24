// ============================================================
// 17_driver_external_sync.gs — Sync Driver Eksternal (Batam + Jambi Luar)
// ============================================================
//
// Sumber SSoT (dari SSOT_DATA_SOURCES.md):
//   Spreadsheet ID: 1suoDC-RsWOgTHiLq4max6iIsWe39Ou-RMddRXl5DVJc
//   Tab: "ID Rifim Batam", "ID Rifim Jambi Luar"
//   Kolom: NO | ID Driver | Nama | Id Cabang
//
// RAOS sekarang jadi hub multi-PWA (post sesi 17) — sync driver eksternal
// juga masuk ke raos_drivers untuk dipakai project lain (rifim-isi-saldo,
// radms-driver, rifim-os).
//
// Beda dengan driver_airport (source='ssot_driver_airport'):
//   source = 'ssot_driver_external'
//   branch_id auto-map dari tab name → branches.slug

const DRIVER_EXTERNAL_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty('DRIVER_EXTERNAL_SHEET_ID')
  || '1suoDC-RsWOgTHiLq4max6iIsWe39Ou-RMddRXl5DVJc'

const DRIVER_EXTERNAL_TABS = [
  'ID Rifim Batam',
  'ID Rifim Jambi Luar',
]

function getDriverExternalSpreadsheet_() {
  return SpreadsheetApp.openById(DRIVER_EXTERNAL_SHEET_ID)
}

function syncDriverExternalFromSSOT() {
  let inserted = 0, updated = 0, deactivated = 0, errors = 0
  const warnings = []

  try {
    const ss = getDriverExternalSpreadsheet_()
    const branchMap = kpiBranchMap_() // dari 13_staff_sync.gs
    const seenDriverIds = []
    const availableTabNames = ss.getSheets().map(s => s.getName())

    DRIVER_EXTERNAL_TABS.forEach(tabName => {
      const sh = ss.getSheetByName(tabName)
      if (!sh) {
        warnings.push(`Tab "${tabName}" tidak ditemukan di SSOT (tersedia: ${availableTabNames.join(', ')})`)
        return
      }
      const branchId = branchMap[tabName] || null
      if (!branchId) {
        warnings.push(`Branch untuk slug "${tabName}" tidak ada di tabel branches — driver di-set branch_id NULL`)
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
            if (existing[0].source !== 'ssot_driver_external') {
              // Kalau source-nya airport atau manual, jangan timpa
              warnings.push(`Driver ${idStr} sudah ada dengan source=${existing[0].source}, dilewati`)
              return
            }
            const patch = {
              name: String(namaDriver).trim(),
              is_active: true,
              ssot_synced_at: new Date().toISOString(),
            }
            if (branchId && !existing[0].branch_id) patch.branch_id = branchId
            callSupabase(`raos_drivers?driver_id=eq.${encodeURIComponent(idStr)}`, 'PATCH', patch)
            updated++
          } else {
            callSupabase('raos_drivers', 'POST', {
              driver_id: idStr,
              name: String(namaDriver).trim(),
              branch_id: branchId,
              source: 'ssot_driver_external',
              is_active: true,
              ssot_synced_at: new Date().toISOString(),
            })
            inserted++
          }
        } catch (e) {
          errors++
          logSistem('error', 'syncDriverExternalFromSSOT', 'error',
            `${tabName} baris ${i + 2} (${idStr}): ${e.message}`)
        }
      })
    })

    // Soft-delist driver_external yang hilang dari sheet
    const currentSsot = callSupabase(
      `raos_drivers?source=eq.ssot_driver_external&is_active=eq.true&select=driver_id`
    ) || []
    const stale = currentSsot.filter(d => seenDriverIds.indexOf(d.driver_id) < 0)

    stale.forEach(d => {
      try {
        callSupabase(`raos_drivers?driver_id=eq.${encodeURIComponent(d.driver_id)}`, 'PATCH', {
          is_active: false,
          ssot_synced_at: new Date().toISOString(),
        })
        deactivated++
      } catch (e) {
        errors++
      }
    })

    warnings.forEach(w => logSistem('warning', 'syncDriverExternalFromSSOT', 'warning', w))
    logSistem('sync', 'syncDriverExternalFromSSOT', errors ? 'warning' : 'success',
      `${inserted} baru, ${updated} update, ${deactivated} nonaktif, ${errors} error, ${warnings.length} peringatan`)

    try {
      SpreadsheetApp.getUi().alert(
        `✅ Sync Driver Eksternal Selesai\n\n` +
        `• Baru: ${inserted}\n• Update: ${updated}\n• Nonaktif: ${deactivated}\n• Error: ${errors}\n\n` +
        'Cek LOG SISTEM untuk detail warning.'
      )
    } catch (e) { /* trigger context */ }
  } catch (e) {
    logSistem('error', 'syncDriverExternalFromSSOT', 'error', e.message)
    throw e
  }
}
