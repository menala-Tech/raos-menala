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
        .addItem('🔄 Sync Driver Airport (SSOT — 7 tab)', 'syncDriverAirportFromSSOT')
        .addItem('🔄 Sync Driver Eksternal (SSOT — Batam + Jambi Luar)', 'syncDriverExternalFromSSOT')
        // initMockDriverData & importDriverFromSheet dihapus dari menu sejak sesi
        // 14 — dua fungsi itu era pre-SSOT (pakai sheet DATABASE DRIVER lokal),
        // sekarang driver Soeta harus dari sync SSOT. Fungsinya masih ada di
        // 03_order.gs kalau perlu dipanggil manual dari script editor untuk
        // debug, tapi tidak boleh dijalankan operasional (buat baris source=
        // manual yang bisa duplikat dengan hasil sync SSOT).
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('👥 Staff')
        .addItem('🔄 Sync Staff Soeta (SSOT MASTER DATA STAFF)', 'syncStaffFromSSOT')
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('📊 KPI RAOS')
        .addItem('🆕 Init Sheet KPI (MASTER TARGET + RAOS_KPI_MANUAL)', 'initKpiSheetsRAOS')
        .addItem('▶️ Update KPI Bulan Ini (semua staff Soeta)', 'updateAllKpiRAOS')
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('💰 Isi Saldo')
        .addItem('🆕 Init Sheet "Form Isi Saldo"', 'initSheetFormIsiSaldo')
        .addItem('🔄 Sync Pengajuan ke Sheet "Form Isi Saldo"', 'syncSaldoRequestsToSheet')
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('📋 Laporan')
        .addItem('Kirim Laporan Harian ke Admin', 'kirimLaporanHarianAdmin')
        .addItem('Export Laporan Bulanan ke Drive', 'exportLaporanBulanIni')
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('🔔 Notifikasi')
        .addSubMenu(
          SpreadsheetApp.getUi().createMenu('⏰ Reminder Masuk')
            .addItem('Pagi (06:30)', 'reminderMasukPagi')
            .addItem('Siang (14:30)', 'reminderMasukSiang')
            .addItem('Malam (22:30)', 'reminderMasukMalam')
        )
        .addSubMenu(
          SpreadsheetApp.getUi().createMenu('🏁 Reminder Pulang')
            .addItem('Pagi (15:00)', 'reminderPulangPagi')
            .addItem('Siang (23:00)', 'reminderPulangSiang')
            .addItem('Malam (07:00)', 'reminderPulangMalam')
        )
        .addItem('Notif Scan Pending → Koordinator', 'notifyPendingScansKoordinator')
        .addItem('Push Dashboard ke Supabase', 'pushDashboardToSupabase')
    )
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('⚙️ Sistem')
        .addItem('Setup Semua Trigger', 'setupAllTriggers')
        .addItem('Init/Refresh Konfigurasi Sistem', 'initSistemConfig')
        .addItem('🗑️ Tandai Sheet Deprecated (TARGET STAFF/DATABASE STAFF/DRIVER)', 'markDeprecatedSheets')
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

  // Entries multi-cabang + isi saldo + KPI refactor sesi 16-17.
  const configs = [
    ['KEY', 'VALUE', 'KETERANGAN'],
    // ── KPI ──
    ['KPI_PILAR_1_ORDER_MAX',   '50',  'Poin max Pilar 1 mode Order (Soeta)'],
    ['KPI_PILAR_1_SALDO_MAX',   '50',  'Poin max Pilar 1 mode Saldo (cabang lain)'],
    ['KPI_PILAR_2_DRIVER_MAX',  '30',  'Poin max Pilar 2 pembinaan driver'],
    ['KPI_PILAR_3_SOP_MAX',     '20',  'Poin max Pilar 3 disiplin & SOP'],
    ['KPI_AKTIF_TINGGI_MIN',    '8',   'Threshold scan/bulan driver dianggap aktif tinggi (Pilar 2)'],
    ['KPI_EXPECTED_WORKDAYS',   '26',  'Ekspektasi hari kerja per bulan (Pilar 3)'],
    ['KPI_BOBOT_KOORDINATOR',   '1.2', 'Bobot jabatan koordinator target staff'],
    ['KPI_BOBOT_STAFF',         '1.0', 'Bobot jabatan staff'],
    // ── Isi Saldo ──
    ['SALDO_REMINDER_MENIT',    '5',   'Menit sebelum reminder chat "Belum Diisi" dikirim'],
    ['SALDO_SYNC_MENIT',        '5',   'Interval sync raos_saldo_requests → sheet Form Isi Saldo'],
    // ── Absensi ──
    ['ATTENDANCE_TOLERANCE_MIN','15',  'Toleransi keterlambatan absensi (menit)'],
    ['GEOFENCE_TOLERANCE_METER','50',  'Toleransi hard-block scan/absen di luar radius (staff only)'],
    ['AUTO_CHECKOUT_TIME',      '23:59','Waktu auto checkout jika staff lupa absen pulang'],
    // ── Email & Sistem ──
    ['EMAIL_ADMIN',             'rifiminternationalgemilang@gmail.com', 'Email penerima laporan harian'],
    ['DATA_RETENTION_DAYS',     '30',  'Retensi log activity & sistem (hari)'],
    ['COMPANY_NAME',            'PT. Rifim Internasional Gemilang', 'Nama perusahaan'],
    ['APP_VERSION',             '2.0.0-multicabang', 'Versi aplikasi RAOS (P1-P3 multi-cabang)'],
    // ── SSoT sources ──
    ['SSOT_STAFF_SHEET_ID',     '1fcraq3QHqIaD-13Ebzt6stT9aA6j_loTXeAtpNX12kw', 'Spreadsheet MASTER DATA STAFF'],
    ['SSOT_DRIVER_SHEET_ID',    '1FEZxyHPx_GCQKw92hLSf6QxxkXgZn5R1sRswOYM_Tlc', 'Spreadsheet Database Driver Airport'],
    ['SUPABASE_URL',            'https://vlievtojpmrbsmzlqswl.supabase.co', 'URL project Supabase RAOS'],
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

/**
 * Kasih banner "DEPRECATED" di 3 sheet legacy yang sudah tidak dipakai
 * post-refactor (SSoT staff + driver + KPI DASHBOARD STAFF).
 * Idempotent — kalau banner sudah ada, tidak duplikat.
 */
function markDeprecatedSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const targets = [
    { name: 'TARGET STAFF',    reason: 'Digantikan sheet DASHBOARD STAFF (dari 📊 KPI RAOS)' },
    { name: 'DATABASE STAFF',  reason: 'Digantikan SSoT MASTER DATA STAFF (sync otomatis)' },
    { name: 'DATABASE DRIVER', reason: 'Digantikan SSoT Database Driver Airport (sync otomatis)' },
  ]
  const marked = []
  const skipped = []
  targets.forEach(t => {
    const sh = ss.getSheetByName(t.name)
    if (!sh) { skipped.push(t.name + ' (tidak ada)'); return }
    // Cek apakah baris 1 sudah punya banner
    const firstCell = String(sh.getRange(1, 1).getValue() || '')
    if (firstCell.indexOf('DEPRECATED') === 0) {
      skipped.push(t.name + ' (sudah ada banner)')
      return
    }
    sh.insertRowBefore(1)
    sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 5)).merge()
    sh.getRange(1, 1).setValue(`⚠️ DEPRECATED — ${t.reason}. Sheet ini disimpan hanya untuk histori, JANGAN diedit manual.`)
      .setBackground('#DC2626').setFontColor('#fff').setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle')
    sh.setRowHeight(1, 40)
    marked.push(t.name)
  })
  SpreadsheetApp.getUi().alert(
    '✅ Banner deprecated diapply\n\n' +
    (marked.length ? 'Ditandai: ' + marked.join(', ') + '\n' : '') +
    (skipped.length ? 'Dilewati:  ' + skipped.join(', ') : '')
  )
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
