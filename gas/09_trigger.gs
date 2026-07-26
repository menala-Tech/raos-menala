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

  // Reminder absensi per shift — dispatcher tiap 5 menit cek WIB clock vs
  // target time (06:30/14:30/22:30 masuk + 15:00/23:00/07:00 pulang).
  // Presisi: dispatcher fire kalau jam+menit MATCH target (±2 menit window).
  // GAS ScriptApp cron minimum granularity 1 menit — 5 menit hemat quota.
  ScriptApp.newTrigger('reminderShiftDispatcher')
    .timeBased().everyMinutes(5).create()

  // Notif ke koordinator kalau scan pending >15 menit (F) — cek tiap 15 menit
  ScriptApp.newTrigger('notifyPendingScansKoordinator')
    .timeBased().everyMinutes(15).create()

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

  // Sync driver airport (7 tab SSOT) — 2 JAM (dari 10 menit di sesi 18).
  // GAS UrlFetchApp quota default 20,000/hari — 10 menit × 7 tab × banyak fetch
  // bikin over-quota. 2 jam = 12x/hari, aman + admin bisa run manual kalau
  // butuh cepat via menu 🚗 Driver → 🔄 Sync Driver Airport.
  ScriptApp.newTrigger('syncDriverAirportFromSSOT')
    .timeBased().everyHours(2).create()

  // Sync driver eksternal (Batam + Jambi Luar) — 2 JAM (dari 10 menit)
  ScriptApp.newTrigger('syncDriverExternalFromSSOT')
    .timeBased().everyHours(2).create()

  // Sync staff (semua RIFIM dari MASTER DATA STAFF) setiap 6 jam — perubahan
  // roster/PIN/jabatan tidak sering, cukup 6 jam. Kalau butuh update cepat,
  // admin bisa run manual dari menu 👥 Staff → 🔄 Sync Staff
  ScriptApp.newTrigger('syncStaffFromSSOT')
    .timeBased().everyHours(6).create()

  // Sync pengajuan isi saldo ke tab "Form Isi Saldo" — 15 MENIT (dari 5 menit).
  // Real-time berlebihan, isi saldo tidak sering. Onboarding manual via
  // menu 💰 Isi Saldo → 🔄 Sync ke Sheet untuk instant refresh.
  ScriptApp.newTrigger('syncSaldoRequestsToSheet')
    .timeBased().everyMinutes(15).create()

  // Reminder chat "SALDO BELUM DIPROSES" untuk request >5 menit yang belum
  // dicentang. Cron 15 MENIT (dari 5) — cukup, kirim reminder tetap tepat waktu.
  ScriptApp.newTrigger('reminderSaldoBelumDiisi')
    .timeBased().everyMinutes(15).create()

  // Sync raos_driver_queue → tab "Antrian Driver" setiap 30 MENIT (dari 15).
  // Antrian sudah realtime via /antrian-driver page + realtime subscribe,
  // sheet-side cukup untuk backup/reporting.
  ScriptApp.newTrigger('syncDriverQueueToSheet')
    .timeBased().everyMinutes(30).create()

  logSistem('setup', 'setupAllTriggers', 'success', 'Semua trigger berhasil dipasang')
  SpreadsheetApp.getUi().alert('✅ Semua trigger berhasil dipasang!')
}

// Dispatcher reminder shift — fire tiap 5 menit, cek jam WIB sekarang
// vs 6 target (masuk pagi/siang/malam + pulang pagi/siang/malam).
// Kalau match dalam window ±2 menit (karena cron ±5 min), panggil fungsi
// yang sesuai. Sekali per hari per target (dedup via script cache).
function reminderShiftDispatcher() {
  const now = new Date()
  // WIB = UTC+7. GAS timezone bisa beda, hitung manual.
  const wibNow = new Date(now.getTime() + (7 - now.getTimezoneOffset() / -60) * 3600 * 1000)
  // Actually simpler: pakai Utilities.formatDate dengan zone 'Asia/Jakarta'
  const hhmm = Utilities.formatDate(now, 'Asia/Jakarta', 'HH:mm')
  const today = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd')

  // Target: 6 slot reminder
  const targets = [
    { time: '06:30', fn: reminderMasukPagi,  key: 'masuk-pagi' },
    { time: '14:30', fn: reminderMasukSiang, key: 'masuk-siang' },
    { time: '22:30', fn: reminderMasukMalam, key: 'masuk-malam' },
    { time: '15:00', fn: reminderPulangPagi, key: 'pulang-pagi' },
    { time: '23:00', fn: reminderPulangSiang, key: 'pulang-siang' },
    { time: '07:00', fn: reminderPulangMalam, key: 'pulang-malam' },
  ]

  const cache = PropertiesService.getScriptProperties()

  targets.forEach(t => {
    if (!isWithinWindow_(hhmm, t.time, 2)) return
    const cacheKey = `REMINDER_FIRED_${today}_${t.key}`
    if (cache.getProperty(cacheKey)) return // sudah fire hari ini
    try {
      t.fn()
      cache.setProperty(cacheKey, '1')
    } catch (e) {
      logSistem('error', `reminderShiftDispatcher:${t.key}`, 'error', e.message)
    }
  })
}

// Cek apakah hhmm within ±windowMin menit dari targetHhmm
function isWithinWindow_(hhmm, targetHhmm, windowMin) {
  const [h1, m1] = hhmm.split(':').map(Number)
  const [h2, m2] = targetHhmm.split(':').map(Number)
  const min1 = h1 * 60 + m1
  const min2 = h2 * 60 + m2
  return Math.abs(min1 - min2) <= windowMin
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
  } else if (sheet === 'Form Isi Saldo') {
    // Hook admin centang checkbox "Sudah Diisi" (kolom G).
    // handleSaldoCheckboxEdit_ di 16_saldo_sync.gs handle detail.
    try { handleSaldoCheckboxEdit_(e) } catch (err) {
      logSistem('error', 'onEdit:saldo', 'error', err.message)
    }
  }
}
