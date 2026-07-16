// ============================================================
// 09_trigger.gs — Trigger Otomatis
// ============================================================

function setupAllTriggers() {
  // Hapus semua trigger lama
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t))

  // Import order dari Supabase setiap jam
  ScriptApp.newTrigger('importOrderFromSupabase')
    .timeBased().everyHours(1).create()

  // Import absensi dari Supabase ke spreadsheet setiap 30 menit
  ScriptApp.newTrigger('importAbsensiFromSupabase')
    .timeBased().everyMinutes(30).create()

  // Kirim reminder absensi jam 07:00
  ScriptApp.newTrigger('kirimReminderAbsensi')
    .timeBased().atHour(7).everyDays(1).create()

  // Update KPI semua staff jam 22:00
  ScriptApp.newTrigger('updateAllKpiThisMonth')
    .timeBased().atHour(22).everyDays(1).create()

  // Laporan harian ke admin jam 21:00
  ScriptApp.newTrigger('kirimLaporanHarianAdmin')
    .timeBased().atHour(21).everyDays(1).create()

  // Backup harian jam 02:00
  ScriptApp.newTrigger('backupHarian')
    .timeBased().atHour(2).everyDays(1).create()

  // Push dashboard ke Supabase setiap 15 menit
  ScriptApp.newTrigger('pushDashboardToSupabase')
    .timeBased().everyMinutes(15).create()

  // Auto hapus riwayat lama setiap tanggal 2 jam 01:00
  ScriptApp.newTrigger('autoHapusRiwayatLama')
    .timeBased().atHour(1).onMonthDay(2).create()

  // Sync foto absensi ke Google Drive setiap 30 menit
  ScriptApp.newTrigger('syncSelfiePhotosToGDrive')
    .timeBased().everyMinutes(30).create()

  logSistem('setup', 'setupAllTriggers', 'success', 'Semua trigger berhasil dipasang')
  SpreadsheetApp.getUi().alert('✅ Semua trigger berhasil dipasang!')
}

function autoHapusRiwayatLama() {
  const cfg = getSistemConfig()
  const retensiHari = parseInt(cfg['data_retention_days'] ?? '30')
  const batas = new Date()
  batas.setDate(batas.getDate() - retensiHari)

  const sheets = [CONFIG.SHEETS.LOG_ACTIVITY, CONFIG.SHEETS.LOG_SISTEM]
  sheets.forEach(nama => {
    const sh = getSheet(nama)
    const rows = sh.getDataRange().getValues()
    const toDelete = []
    for (let i = rows.length - 1; i >= 1; i--) {
      if (new Date(rows[i][0]) < batas) toDelete.push(i + 1)
    }
    toDelete.forEach(r => sh.deleteRow(r))
    logSistem('cleanup', `autoHapusRiwayatLama:${nama}`, 'success', `${toDelete.length} baris dihapus`)
  })
}

function onEdit(e) {
  const sheet = e.source.getActiveSheet().getName()
  const user = Session.getActiveUser().getEmail()

  if (sheet === CONFIG.SHEETS.ABSENSI) {
    logActivity(user, 'edit_absensi', `Cell: ${e.range.getA1Notation()}`)
  } else if (sheet === CONFIG.SHEETS.ORDER) {
    logActivity(user, 'edit_order', `Cell: ${e.range.getA1Notation()}`)
  }
}
