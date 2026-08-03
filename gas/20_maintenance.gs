// ============================================================
// 20_maintenance.gs — One-shot maintenance helpers (delete tab dsb)
// ============================================================
//
// Fungsi di sini dijalankan MANUAL sekali dari Apps Script Editor
// (pilih fungsi di dropdown → tekan ▶ Run). BUKAN via menu / cron.
// Cek Logger.log ("Log eksekusi" di editor) untuk hasil.

/**
 * Hapus 5 tab DEPRECATED di sheet RAOS (audit cross-file duplicate 2026-08-04).
 * Semua data sudah dipindahkan ke Supabase — tab tinggal banner DEPRECATED
 * atau kosong. Safe di-hapus.
 */
function deleteRaosDeprecatedTabs() {
  const SHEET_ID = '1eYS2mM3Sy-BNAVGfp8BUHtsZuLiGDetnJeGw-AWk__8'
  const TABS_TO_DELETE = [
    'TARGET STAFF',       // → Supabase kpi_targets
    'DATABASE STAFF',     // → Supabase user_profiles + SSOT MASTER DATA STAFF
    'DATABASE DRIVER',    // → Supabase raos_drivers
    'DATABASE ORDER',     // → Supabase scan_orders (kosong 0 rows)
    'ORDER',              // Redundant dengan DATABASE ORDER (kosong 0 rows)
  ]
  const ss = SpreadsheetApp.openById(SHEET_ID)
  const results = []
  TABS_TO_DELETE.forEach(name => {
    const sh = ss.getSheetByName(name)
    if (!sh) { results.push(`${name}: SKIP (tab tidak ada)`); return }
    const lastRow = sh.getLastRow()
    // Guard: jangan hapus tab yg tidak diharapkan punya banyak baris.
    // TARGET STAFF/DATABASE STAFF/DATABASE DRIVER expected ≤5 rows (banner + note).
    // DATABASE ORDER/ORDER expected 0 rows.
    if (lastRow > 20) {
      results.push(`${name}: SKIP (${lastRow} rows > 20, cek manual dulu)`)
      return
    }
    try {
      ss.deleteSheet(sh)
      results.push(`${name}: DELETED (${lastRow} rows)`)
    } catch (e) {
      results.push(`${name}: ERROR ${e.message}`)
    }
  })
  const summary = results.join('\n')
  Logger.log('=== deleteRaosDeprecatedTabs ===\n' + summary)
  return summary
}
