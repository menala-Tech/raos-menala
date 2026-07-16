// ============================================================
// 10_menu.gs — Menu Custom di Spreadsheet
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🛠️ RAOS System')
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('📋 Data')
        .addItem('Import Absensi dari Supabase', 'importAbsensiFromSupabase')
        .addItem('Import Order dari Supabase', 'importOrderFromSupabase')
        .addItem('Sinkron Absensi ke Supabase (manual)', 'syncAbsensiToSupabase')
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('🚗 Driver')
        .addItem('Isi Data Mock Driver', 'initMockDriverData')
        .addItem('Import Driver ke Supabase', 'importDriverFromSheet')
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
        .addItem('Init Konfigurasi Sistem', 'initSistemConfig')
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

function initSistemConfig() {
  const sh = getSheet(CONFIG.SHEETS.SISTEM_CONFIG)
  sh.clearContents()

  const configs = [
    // Header
    ['KEY', 'VALUE', 'KETERANGAN'],
    // KPI & Keuangan
    ['KPI KEHADIRAN (%)',   '15',    'Bobot KPI kehadiran dalam perhitungan total'],
    ['KPI ORDER (%)',       '40',    'Bobot KPI jumlah order'],
    ['KPI GMV (%)',         '20',    'Bobot KPI total GMV'],
    ['BONUS ORDER (%)',     '2',     'Persen bonus insentif dari GMV per order'],
    // Email & Notifikasi
    ['EMAIL_ADMIN',         'rifiminternationalgemilang@gmail.com', 'Email penerima laporan harian'],
    // Sistem
    ['data_retention_days', '30',   'Retensi log activity & sistem (hari)'],
    ['attendance_tolerance','15',   'Toleransi keterlambatan absensi (menit)'],
    ['auto_checkout_time',  '23:59','Waktu auto checkout jika staff lupa absen pulang'],
    ['company_name',        'Menala Internasional Gemilang', 'Nama perusahaan'],
    ['app_version',         '1.0.0','Versi aplikasi RAOS'],
  ]

  sh.getRange(1, 1, configs.length, 3).setValues(configs)

  // Style header
  sh.getRange(1, 1, 1, 3)
    .setBackground('#1a3a5c').setFontColor('#ffffff').setFontWeight('bold')

  // Style kolom KEY
  sh.getRange(2, 1, configs.length - 1, 1).setFontWeight('bold')

  sh.autoResizeColumns(1, 3)
  SpreadsheetApp.getUi().alert('✅ SISTEM CONFIG berhasil diisi!\n\nEdit nilai di sheet SISTEM CONFIG sesuai kebutuhan operasional.')
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
