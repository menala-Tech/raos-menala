// ============================================================
// 10_menu.gs — Menu Custom di Spreadsheet
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🛠️ RAOS System')
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('📋 Data')
        .addItem('Import Order dari Supabase', 'importOrderFromSupabase')
        .addItem('Sinkron Absensi ke Supabase', 'syncAbsensiToSupabase')
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('📊 KPI & Laporan')
        .addItem('Update KPI Semua Staff (Bulan Ini)', 'updateAllKpiThisMonth')
        .addItem('Kirim Laporan Harian ke Admin', 'kirimLaporanHarianAdmin')
        .addItem('Export Laporan Bulanan ke Drive', 'exportLaporanBulanIni')
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('🔔 Notifikasi')
        .addItem('Kirim Reminder Absensi', 'kirimReminderAbsensi')
        .addItem('Push Dashboard ke Supabase', 'pushDashboardToSupabase')
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('⚙️ Sistem')
        .addItem('Setup Semua Trigger', 'setupAllTriggers')
        .addItem('Backup Manual ke Drive', 'backupHarian')
        .addItem('Sync Foto Absensi ke Drive', 'syncSelfiePhotosToGDrive')
        .addItem('Test Koneksi Supabase', 'testSupabaseConnection')
        .addItem('Hapus Riwayat Lama', 'autoHapusRiwayatLama')
    )
    .addToUi()
}

function exportLaporanBulanIni() {
  const now = new Date()
  exportLaporanBulanan(now.getMonth() + 1, now.getFullYear())
  SpreadsheetApp.getUi().alert('✅ Laporan berhasil diekspor ke Google Drive!')
}

function testSupabaseConnection() {
  try {
    const data = callSupabase('branches?select=code,name&limit=5')
    SpreadsheetApp.getUi().alert(
      `✅ Koneksi Supabase BERHASIL\n\nCabang terdaftar:\n${data.map(b => `• ${b.code} — ${b.name}`).join('\n')}`
    )
  } catch (e) {
    SpreadsheetApp.getUi().alert(`❌ Koneksi GAGAL\n${e.message}`)
  }
}
