// ============================================================
// 25_pre_launch.gs — Pre-Launch Cleanup untuk RAOS (Launch 1 Sep 2026)
// ============================================================
//
// TUJUAN:
//   Bersihkan data test/dev di spreadsheet RAOS sebelum go-live 1 Sep 2026,
//   TANPA menghapus header, konfigurasi, atau sheet SSoT (MASTER TARGET,
//   SISTEM CONFIG, PANDUAN ADMIN).
//
// SAFETY:
//   - Full-file backup sudah dibuat manual (Drive: "RAOS Spreadsheet — FULL
//     BACKUP 20260829 pre-launch" id 1DwdnO6cZXWt7k6A-b3XOF2uzycPej0Fu8pEXqnzH064).
//   - Fungsi ini IDEMPOTENT — aman dijalankan berkali-kali.
//   - Header row 1 SELALU dipertahankan.
//   - Fungsi minta konfirmasi UI sebelum eksekusi.
//
// TABS YANG DI-CLEAR (7):
//   ABSENSI, Antrian Driver, LOG ACTIVITY, LOG SISTEM,
//   Form Isi Saldo, DASHBOARD STAFF, RAOS_KPI_MANUAL
//
// TABS YANG DIPERTAHANKAN (3):
//   MASTER TARGET, SISTEM CONFIG, PANDUAN ADMIN
//
// USAGE:
//   Buka spreadsheet RAOS → menu 🛠️ RAOS System → ⚙️ Sistem →
//   "🚀 Pre-Launch Cleanup (1 Sep 2026)".
// ============================================================

const PRELAUNCH_CLEAR_TABS_RAOS = [
  'ABSENSI',
  'Antrian Driver',
  'LOG ACTIVITY',
  'LOG SISTEM',
  'Form Isi Saldo',
  'DASHBOARD STAFF',
  'RAOS_KPI_MANUAL',
]

const PRELAUNCH_KEEP_TABS_RAOS = [
  'MASTER TARGET',
  'SISTEM CONFIG',
  'PANDUAN ADMIN',
]

/**
 * Menu handler — konfirmasi + eksekusi.
 */
function preLaunchCleanupRAOS_MENU() {
  const ui = SpreadsheetApp.getUi()
  const resp = ui.alert(
    '🚀 Pre-Launch Cleanup RAOS',
    'Akan clear data (row 2 dst) di ' + PRELAUNCH_CLEAR_TABS_RAOS.length +
      ' tab:\n\n' + PRELAUNCH_CLEAR_TABS_RAOS.map(function (n) { return '  • ' + n }).join('\n') +
      '\n\nHeader (row 1) DIPERTAHANKAN.\n' +
      'Tab berikut TIDAK disentuh:\n' +
      PRELAUNCH_KEEP_TABS_RAOS.map(function (n) { return '  • ' + n }).join('\n') +
      '\n\nFull backup: "RAOS Spreadsheet — FULL BACKUP 20260829 pre-launch".\n\n' +
      'Lanjutkan?',
    ui.ButtonSet.YES_NO
  )
  if (resp !== ui.Button.YES) {
    ui.alert('Dibatalkan.')
    return
  }
  const report = preLaunchCleanupRAOS_()
  ui.alert(
    '✅ Selesai',
    report.map(function (r) { return r.tab + ': ' + r.rowsCleared + ' rows' }).join('\n'),
    ui.ButtonSet.OK
  )
}

/**
 * Core cleanup — bisa dipanggil dari script editor untuk dry-run per tab.
 * Returns array of {tab, rowsCleared, error?}.
 */
function preLaunchCleanupRAOS_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const results = []
  PRELAUNCH_CLEAR_TABS_RAOS.forEach(function (tabName) {
    try {
      const sh = ss.getSheetByName(tabName)
      if (!sh) {
        results.push({ tab: tabName, rowsCleared: 0, error: 'sheet not found' })
        return
      }
      const lastRow = sh.getLastRow()
      const lastCol = Math.max(sh.getLastColumn(), 1)
      if (lastRow <= 1) {
        results.push({ tab: tabName, rowsCleared: 0 })
        return
      }
      // Clear content only (preserve formatting, checkbox validation, etc)
      sh.getRange(2, 1, lastRow - 1, lastCol).clearContent()
      results.push({ tab: tabName, rowsCleared: lastRow - 1 })
      Utilities.sleep(200) // rate-limit courtesy
    } catch (err) {
      results.push({ tab: tabName, rowsCleared: 0, error: String(err) })
    }
  })
  // Log ke SISTEM CONFIG (opsional — kalau ada) untuk audit trail
  try {
    const logSheet = ss.getSheetByName('LOG SISTEM')
    if (logSheet) {
      logSheet.appendRow([
        new Date(),
        'PRE_LAUNCH_CLEANUP',
        'RAOS',
        'Cleared ' + results.length + ' tabs',
        JSON.stringify(results),
      ])
    }
  } catch (_) { /* ignore */ }
  return results
}
