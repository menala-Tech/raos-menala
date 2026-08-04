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
  let upserted = 0, deactivated = 0, skipped = 0, errors = 0
  const warnings = []
  const now = new Date().toISOString()

  try {
    const ss = getDriverExternalSpreadsheet_()
    const branchMap = kpiBranchMap_()
    const availableTabNames = ss.getSheets().map(s => s.getName())

    // 1) Pre-fetch semua driver existing (source-agnostic) — 1 HTTP call
    const existingAll = callSupabase(
      'raos_drivers?select=driver_id,source,branch_id&limit=10000'
    ) || []
    const existingMap = {}
    existingAll.forEach(d => { existingMap[d.driver_id] = d })

    // 2) Kumpulkan rows semua tab → buat payload bulk
    const payload = []
    const seenDriverIds = []

    DRIVER_EXTERNAL_TABS.forEach(tabName => {
      const sh = ss.getSheetByName(tabName)
      if (!sh) {
        warnings.push(`Tab "${tabName}" tidak ditemukan (tersedia: ${availableTabNames.join(', ')})`)
        return
      }
      const branchId = branchMap[tabName] || null
      if (!branchId) {
        warnings.push(`Branch untuk slug "${tabName}" tidak ada di tabel branches`)
      }
      sh.getDataRange().getValues().slice(1).forEach(row => {
        const driverId = String(row[1] || '').trim()
        const namaDriver = String(row[2] || '').trim()
        if (!driverId) return

        const existing = existingMap[driverId]
        if (existing && existing.source !== 'ssot_driver_external') {
          // milik airport / manual — jangan timpa
          skipped++
          return
        }
        seenDriverIds.push(driverId)
        payload.push({
          driver_id: driverId,
          name: namaDriver,
          // preserve branch_id yg sudah diset admin manual; overwrite kalau kosong
          branch_id: (existing && existing.branch_id) ? existing.branch_id : branchId,
          source: 'ssot_driver_external',
          driver_type: 'external',
          is_active: true,
          ssot_synced_at: now,
        })
      })
    })

    // 3) Bulk upsert dalam chunks (Supabase batas ~1000 rows per POST, kita pakai 500)
    const CHUNK_SIZE = 500
    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE)
      try {
        _raosDriverBulkUpsert_(chunk)
        upserted += chunk.length
      } catch (e) {
        errors++
        logSistem('error', 'syncDriverExternalFromSSOT', 'error',
          `Bulk chunk ${i}-${i + chunk.length}: ${e.message}`)
      }
    }

    // 4) Soft-delist stale — 1 batch PATCH via IN filter
    const staleIds = existingAll
      .filter(d => d.source === 'ssot_driver_external' && seenDriverIds.indexOf(d.driver_id) < 0)
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
        warnings.push('Batch deactivate failed: ' + e.message)
      }
    }

    warnings.forEach(w => logSistem('warning', 'syncDriverExternalFromSSOT', 'warning', w))
    const summary = `${upserted} upsert, ${deactivated} nonaktif, ${skipped} skip, ${errors} error, ${warnings.length} peringatan`
    logSistem('sync', 'syncDriverExternalFromSSOT', errors ? 'warning' : 'success', summary)

    try {
      SpreadsheetApp.getUi().alert('✅ Sync Driver Eksternal Selesai\n\n' + summary + '\n\nCek LOG SISTEM untuk detail.')
    } catch (e) { /* trigger/webapp context */ }

    return { upserted, deactivated, skipped, errors, warnings }
  } catch (e) {
    logSistem('error', 'syncDriverExternalFromSSOT', 'error', e.message)
    throw e
  }
}

// Bulk upsert helper — custom Prefer header (callSupabase built-in tidak
// support extra headers). Butuh Prefer resolution=merge-duplicates untuk
// upsert Supabase.
function _raosDriverBulkUpsert_(rows) {
  const res = UrlFetchApp.fetch(
    CONFIG.SUPABASE_URL + '/rest/v1/raos_drivers?on_conflict=driver_id',
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
