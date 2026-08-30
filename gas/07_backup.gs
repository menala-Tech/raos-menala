// ============================================================
// 07_backup.gs — Backup Otomatis ke Google Drive
// ============================================================
//
// CATATAN (2026-08-29): backupHarian() versi lama (xlsx export ke
// CONFIG.DRIVE.BACKUP_FOLDER_ID + 30-day retention) DI-DEPRECATE.
// Versi kanonik ada di `11_drive_sync.gs` yang pakai
// raosCanonicalBackupActiveSpreadsheet_. Karena GAS load order
// alphabetical, versi 11_* menang otomatis — versi lama di sini
// jadi dead code kalau namanya sama. Di-rename ke *_legacy_ untuk
// menghindari shadow-conflict silent.

function backupHarian_legacy_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const folderId = CONFIG.DRIVE.BACKUP_FOLDER_ID
  if (!folderId) { Logger.log('BACKUP_FOLDER_ID belum diset'); return }

  const folder = DriveApp.getFolderById(folderId)
  const today = formatDate(new Date()).replace(/\//g, '-')
  const namaFile = `RAOS_Backup_${today}.xlsx`

  // Ekspor spreadsheet sebagai XLSX
  const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export?format=xlsx`
  const token = ScriptApp.getOAuthToken()
  const resp = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  folder.createFile(resp.getBlob().setName(namaFile))
  logSistem('backup', 'backupHarian_legacy_', 'success', namaFile)

  // Hapus backup lebih dari 30 hari
  bersihkanBackupLama(folder, 30)
}

function bersihkanBackupLama(folder, maxHari) {
  const batasWaktu = new Date()
  batasWaktu.setDate(batasWaktu.getDate() - maxHari)

  const files = folder.getFiles()
  let deleted = 0
  while (files.hasNext()) {
    const file = files.next()
    if (file.getDateCreated() < batasWaktu) {
      file.setTrashed(true)
      deleted++
    }
  }
  if (deleted) logSistem('backup', 'bersihkanBackupLama', 'success', `${deleted} file lama dihapus`)
}

function exportLaporanBulanan(bulan, tahun) {
  const folderId = CONFIG.DRIVE.BACKUP_FOLDER_ID
  if (!folderId) return

  const folder = DriveApp.getFolderById(folderId)
  const namaFile = `RAOS_Laporan_${bulan}-${tahun}.pdf`
  const ss = SpreadsheetApp.getActiveSpreadsheet()

  const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export?format=pdf&size=A4&portrait=true&fitw=true`
  const token = ScriptApp.getOAuthToken()
  const resp = UrlFetchApp.fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })

  folder.createFile(resp.getBlob().setName(namaFile))
  logSistem('backup', 'exportLaporanBulanan', 'success', namaFile)
}
