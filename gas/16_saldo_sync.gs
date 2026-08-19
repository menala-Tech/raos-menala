// ============================================================
// 16_saldo_sync.gs — Sync raos_saldo_requests → sheet + admin flow
// ============================================================
//
// Alur akhir (setelah Batch A + B):
//   Staff /isisaldo N → row raos_saldo_requests (is_processed=false)
//   → sync 5-menit ke tab "Form Isi Saldo" (kolom "Sudah Diisi" checkbox
//     kosong)
//   → admin tick checkbox → onEdit → PATCH is_processed=true
//   → DB trigger dispatch push + auto-chat driver room + TARGET STAFF
//     tambah nominal (via GAS append)
//   → reminder5MinBelumDiisi cron 5 menit: request pending > 5 menit
//     post reminder ke Room "Pengisian Saldo" cabang.

const SALDO_SHEET_NAME = 'Form Isi Saldo'
const SALDO_TARGET_STAFF_SHEET = 'TARGET STAFF' // sudah ada di CONFIG.SHEETS

function getSaldoSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet()
  if (active) return active
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  if (!id) throw new Error('SPREADSHEET_ID Script Property belum diset')
  return SpreadsheetApp.openById(id)
}

// Kolom index (0-based) untuk match onEdit. Hemat magic number.
// A  B        C          D       E        F                G             H                I              J              K            L               M              N
// 1  2        3          4       5        6                7             8                9              10             11           12              13             14
// No Tanggal  Nama Staff Cabang  Nominal  ID Login Driver  Nama Driver   Status Validasi Sudah Diisi    Waktu Diisi    Diisi Oleh   Alasan Tolak    Alert Terkirim Alert Terakhir + O(15) Request ID hidden
const SALDO_COL = {
  NO_REQ:       1,
  TANGGAL:      2,
  NAMA_STAFF:   3,
  CABANG:       4,
  NOMINAL:      5,
  ID_DRIVER:    6,
  NAMA_DRIVER:  7,
  STATUS:       8,
  SUDAH_DIISI:  9,
  WAKTU_DIISI:  10,
  DIISI_OLEH:   11,
  ALASAN:       12,
  ALERT_SENT:   13,
  ALERT_LAST:   14,
  REQ_ID:       15,
}
const SALDO_HEADER = [
  'No Request', 'Tanggal', 'Nama Staff', 'Cabang', 'Nominal',
  'ID Login Driver', 'Nama Driver',
  'Status Validasi', 'Sudah Diisi', 'Waktu Diisi', 'Diisi Oleh',
  'Alasan Tolak', 'Alert Terkirim', 'Alert Terakhir',
  'Request ID'
]

function ensureSaldoSheet_(ss) {
  let sh = ss.getSheetByName(SALDO_SHEET_NAME)
  if (!sh) {
    sh = ss.insertSheet(SALDO_SHEET_NAME)
  }
  // Clear semua data validation (termasuk stray checkbox dari layout lama).
  // Data validation clear pakai clearDataValidations() cakupan seluruh sheet.
  const maxCols = Math.max(sh.getMaxColumns(), SALDO_HEADER.length)
  const maxRows = Math.max(sh.getMaxRows(), 1000)
  sh.getRange(2, 1, maxRows - 1, maxCols).clearDataValidations()

  // Refresh header (idempotent)
  sh.getRange(1, 1, 1, SALDO_HEADER.length).setValues([SALDO_HEADER])
    .setFontWeight('bold').setBackground('#F5A623').setFontColor('#000')
  sh.getRange(1, SALDO_COL.ALERT_LAST).setBackground('#DC2626').setFontColor('#fff')
  sh.getRange('E:E').setNumberFormat('"Rp"#,##0')

  // Pasang HANYA 2 checkbox column: I "Sudah Diisi" + M "Alert Terkirim"
  sh.getRange(2, SALDO_COL.SUDAH_DIISI, 1000, 1).insertCheckboxes()
  sh.getRange(2, SALDO_COL.ALERT_SENT, 1000, 1).insertCheckboxes()
  sh.hideColumn(sh.getRange(1, SALDO_COL.REQ_ID))
  sh.setFrozenRows(1)
  return sh
}

function syncSaldoRequestsToSheet() {
  let synced = 0, errors = 0
  try {
    const rows = callSupabase(
      'raos_saldo_requests?synced_to_sheet_at=is.null&select=' +
      'id,request_no,requested_at,nominal,status,rejection_reason,processed_at,is_processed,' +
      'staff:user_profiles!staff_id(full_name),' +
      'branch:branches!branch_id(name),' +
      'processor:user_profiles!processed_by(full_name)' +
      '&order=requested_at.asc'
    ) || []

    if (rows.length === 0) {
      logSistem('sync', 'syncSaldoRequestsToSheet', 'success', '0 request baru untuk di-sync')
      return { synced: 0 }
    }

    const ss = getSaldoSpreadsheet_()
    const sh = ensureSaldoSheet_(ss)

    const values = rows.map(r => [
      r.request_no,                                     // A No Request
      r.requested_at ? new Date(r.requested_at) : '',   // B Tanggal
      r.staff ? r.staff.full_name : '(unknown)',        // C Nama Staff
      r.branch ? r.branch.name : '(unknown)',           // D Cabang
      Number(r.nominal) || 0,                           // E Nominal
      '',                                               // F ID Login Driver (admin isi manual saat proses)
      '',                                               // G Nama Driver (admin isi manual)
      r.status,                                         // H Status Validasi
      !!r.is_processed,                                 // I Sudah Diisi (checkbox)
      r.processed_at ? new Date(r.processed_at) : '',   // J Waktu Diisi
      r.processor ? r.processor.full_name : '',         // K Diisi Oleh
      r.rejection_reason || '',                         // L Alasan Tolak
      false,                                            // M Alert Terkirim (checkbox)
      '',                                               // N Alert Terakhir (timestamp)
      r.id,                                             // O Request ID (hidden)
    ])

    const startRow = sh.getLastRow() + 1
    sh.getRange(startRow, 1, values.length, SALDO_HEADER.length).setValues(values)
    sh.getRange(startRow, SALDO_COL.TANGGAL, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss')
    sh.getRange(startRow, SALDO_COL.WAKTU_DIISI, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss')
    sh.getRange(startRow, SALDO_COL.ALERT_LAST, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss')
    // Pastikan checkbox tetap tampil untuk baris baru
    sh.getRange(startRow, SALDO_COL.SUDAH_DIISI, values.length, 1).insertCheckboxes()
    sh.getRange(startRow, SALDO_COL.ALERT_SENT, values.length, 1).insertCheckboxes()

    const now = new Date().toISOString()
    rows.forEach(r => {
      try {
        callSupabase(`raos_saldo_requests?id=eq.${r.id}`, 'PATCH', { synced_to_sheet_at: now })
        synced++
      } catch (e) {
        errors++
        logSistem('error', 'syncSaldoRequestsToSheet', 'error', `Patch ${r.request_no}: ${e.message}`)
      }
    })

    logSistem('sync', 'syncSaldoRequestsToSheet', errors ? 'warning' : 'success',
      `${synced} baris → sheet, ${errors} error`)

    try {
      if (typeof SpreadsheetApp !== 'undefined') {
        SpreadsheetApp.getUi().alert(`✅ Sync Isi Saldo Selesai\n${synced} pengajuan ditulis ke tab "${SALDO_SHEET_NAME}"`)
      }
    } catch (e) { /* trigger context */ }
    return { synced }
  } catch (e) {
    logSistem('error', 'syncSaldoRequestsToSheet', 'error', e.message)
    throw e
  }
}

/**
 * @deprecated sesi 22 — jalur "admin centang sheet → PATCH Supabase" TIDAK
 * lagi dipakai. Finance Dashboard PWA /finance yang menangani centang
 * "Lunas" via `markSaldoRequestProcessed`. Function ini disimpan sebagai
 * referensi historis + boleh dipanggil manual dari Script Editor untuk
 * backfill; tidak lagi wire ke onEdit di 09_trigger.gs.
 *
 * onEdit checkbox "Sudah Diisi" — kalau centang kolom G ("Sudah Diisi")
 * berubah ke true, PATCH is_processed=true di Supabase (trigger DB akan
 * dispatch push + auto-chat + update TARGET STAFF).
 */
function handleSaldoCheckboxEdit_(e) {
  // Guard: kalau dipanggil dari onEdit sesudah sesi 22, log deprecation.
  // Manual invocation (bulk backfill) tetap dilewatkan.
  if (e && e.triggerUid) {
    logSistem('warning', 'handleSaldoCheckboxEdit_', 'deprecated',
      'Sheet write-back sudah dinonaktifkan. Pakai Finance Dashboard /finance.')
    return
  }
  try {
    const sheet = e.range.getSheet()
    if (sheet.getName() !== SALDO_SHEET_NAME) return
    if (e.range.getColumn() !== SALDO_COL.SUDAH_DIISI) return
    if (e.range.getRow() === 1) return

    const newValue = e.range.getValue()
    if (newValue !== true) return

    const rowNum = e.range.getRow()
    const requestId = sheet.getRange(rowNum, SALDO_COL.REQ_ID).getValue()
    if (!requestId) {
      logSistem('warning', 'handleSaldoCheckboxEdit_', 'warning', `Baris ${rowNum}: request ID kosong`)
      return
    }

    const adminEmail = Session.getActiveUser().getEmail() || ''
    let adminId = null
    if (adminEmail) {
      try {
        adminId = callSupabase(`rpc/get_auth_user_id_by_email`, 'POST', { p_email: adminEmail })
      } catch (err) { /* silent */ }
    }

    const patch = { is_processed: true, processed_at: new Date().toISOString() }
    if (adminId) patch.processed_by = adminId

    callSupabase(`raos_saldo_requests?id=eq.${requestId}`, 'PATCH', patch)
    sheet.getRange(rowNum, SALDO_COL.WAKTU_DIISI).setValue(new Date())
    if (adminEmail) sheet.getRange(rowNum, SALDO_COL.DIISI_OLEH).setValue(adminEmail)

    updateTargetStaffPencapaian_(requestId)

    logSistem('sync', 'handleSaldoCheckboxEdit_', 'success',
      `Request ${requestId} → is_processed=true oleh ${adminEmail || '(unknown admin)'}`)
  } catch (e) {
    logSistem('error', 'handleSaldoCheckboxEdit_', 'error', e.message)
  }
}

/**
 * Update TARGET STAFF sheet — nominal request bertambah ke pencapaian
 * bulan berjalan untuk staff tersebut. Structure sheet TARGET STAFF:
 *   A: tanggal_target, B: staff_id, C: nama_staff, D: cabang,
 *   E: target_order, F: target_gmv, G: target_kehadiran, H: pencapaian_gmv
 * Kalau kolom H belum ada → ditambahkan.
 */
function updateTargetStaffPencapaian_(requestId) {
  // NO-OP sejak 2026-08-04: sheet TARGET STAFF sudah dihapus (deleted via
  // deleteRaosDeprecatedTabs). Pencapaian sekarang tersimpan otomatis di
  // raos_saldo_requests.nominal + is_processed=true, aggregasi dilakukan
  // updateAllKpiRAOS() saat generate kpi_targets Supabase.
  return
}

/**
 * Reminder policy (2026-08-19 fix — Finding 2/3, replaces Poin 7
 * 2026-08-08 flat 5-menit cadence).
 *
 * Root cause audited sebelum patch ini: eligibility lama pakai SATU cutoff
 * (now-5min) untuk DUA hal sekaligus — umur minimum request DAN staleness
 * last_reminded_at. Trigger sendiri jalan tiap 5 menit (gas/09_trigger.gs).
 * Hasilnya: begitu request lolos umur 5 menit, ia jadi eligible LAGI setiap
 * kali cron fire (tiap 5 menit) tanpa batas atas — production confirmed
 * beberapa request pending berhari-hari terkumpul 87 reminder (query count
 * dari chat_messages metadata `saldo_belum_diisi`, sebelum akhirnya
 * diproses). Tidak ada cron Supabase (`cron.job` kosong) — semua reminder
 * murni dari trigger GAS ini.
 *
 * Policy baru:
 *   1. Request dibuat → 1 pesan awal (existing flow, DI LUAR fungsi ini —
 *      raos_saldo_after_submitted / raos_broadcast_new_saldo_request).
 *   2. Masih pending setelah 15 menit → reminder #1 (AGE_THRESHOLD_MS).
 *   3. Sesudah itu maksimal 1 reminder / 60 menit (RATE_LIMIT_MS,
 *      menggantikan last_reminded_at cutoff 5 menit lama).
 *   4. Maksimal 6 reminder / 24 jam per request (DAILY_CAP) — dihitung
 *      dari chat_messages system message metadata (`saldo_belum_diisi` +
 *      request_id), BUKAN kolom baru. raos_post_system_message embed
 *      metadata sebagai `<!--SYSMETA:{...}-->` di awal `content` (lihat
 *      _countSaldoReminders24h_) — sudah cukup reliable untuk cap 24 jam,
 *      jadi TIDAK perlu migration kolom reminder_count baru untuk gap ini.
 *   5. is_processed=true / rejected / cancelled → STOP — sudah otomatis
 *      terpenuhi oleh filter existing `is_processed=eq.false&status=in.
 *      (pending,approved)`, tidak berubah.
 *   6. Histori reminder lama TIDAK di-backfill/dihapus — last_reminded_at
 *      existing tetap dipakai apa adanya, hanya threshold-nya yang berubah.
 *
 * Cron cadence sendiri (gas/09_trigger.gs, every 5 menit) TIDAK diubah di
 * patch ini — mengubah cadence butuh re-run setupAllTriggers() yang hapus
 * SEMUA trigger project lalu re-create (blast radius ke trigger lain di
 * luar scope saldo), dan itu adalah aksi "deploy" yang di luar batas aman
 * sesi ini. Cron 5-menit yang sering no-op (karena rate-limit 60 menit di
 * dalam fungsi) valid secara fungsional, hanya sedikit boros — optional
 * follow-up terpisah kalau mau dirapikan ke every 15 menit.
 */
function reminderSaldoBelumDiisi() {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(10000)) {
    logSistem('cron', 'reminderSaldoBelumDiisi', 'skipped',
      'Run sebelumnya masih aktif — skip duplicate reminder')
    return { success: true, skipped: true }
  }

  const AGE_THRESHOLD_MS = 15 * 60 * 1000   // reminder #1 setelah 15 menit
  const RATE_LIMIT_MS = 60 * 60 * 1000      // sesudah itu max 1x / 60 menit
  const DAILY_CAP = 6                       // max 6 reminder / 24 jam / request

  try {
    const now = new Date()
    const nowIso = now.toISOString()
    const ageCutoffIso = new Date(now.getTime() - AGE_THRESHOLD_MS).toISOString()
    const rateCutoffIso = new Date(now.getTime() - RATE_LIMIT_MS).toISOString()

    const rows = callSupabase(
      'raos_saldo_requests?is_processed=eq.false&status=in.(pending,approved)' +
      '&requested_at=lt.' + encodeURIComponent(ageCutoffIso) +
      '&or=(last_reminded_at.is.null,last_reminded_at.lt.' + encodeURIComponent(rateCutoffIso) + ')' +
      '&select=id,request_no,requested_at,nominal,driver_name,' +
      'staff:user_profiles!staff_id(full_name),' +
      'branch:branches!branch_id(id,name)' +
      '&order=requested_at.asc&limit=50'
    ) || []

    if (!rows.length) {
      logSistem('cron', 'reminderSaldoBelumDiisi', 'success',
        'Tidak ada request saldo yang perlu reminder')
      return { success: true, reminded: 0, capped: 0, failed: 0 }
    }

    let reminded = 0
    let capped = 0
    let failed = 0

    rows.forEach(r => {
      if (!r.branch?.id) return

      try {
        // Poin 4: cap 24 jam — cek SEBELUM kirim, bukan sesudah, supaya
        // request yang sudah kena cap tidak ikut update last_reminded_at
        // (last_reminded_at hanya berarti "reminder terakhir terkirim").
        if (_countSaldoReminders24h_(r.id, DAILY_CAP) >= DAILY_CAP) {
          capped++
          return
        }

        const roomId = callSupabase('rpc/raos_resolve_saldo_room', 'POST', {
p_branch_id: r.branch.id,
        })
        if (!roomId) throw new Error(`Room Pengisian Saldo tidak ditemukan untuk ${r.branch.name}`)

        const requested = new Date(r.requested_at)
        const minutes = Math.max(5, Math.floor((now.getTime() - requested.getTime()) / 60000))
        const content = [
'⏰ BELUM DIISI — PENGAJUAN SALDO',
'',
`Cabang: ${r.branch.name}`,
`No Request: ${r.request_no || '-'}`,
`Staff: ${r.staff?.full_name || '-'}`,
`Driver: ${r.driver_name || '-'}`,
`Nominal: Rp ${(Number(r.nominal) || 0).toLocaleString('id-ID')}`,
`Menunggu: ${minutes} menit`,
'',
'Mohon segera proses pengisian saldo di AIST melalui Finance RIFIM OS.',
        ].join('\n')

        callSupabase('rpc/raos_post_system_message', 'POST', {
p_room_id: roomId,
p_content: content,
p_category: 'saldo_reminder',
p_metadata: {
  source: 'raos_gas',
  event: 'saldo_belum_diisi',
  request_id: r.id,
  request_no: r.request_no,
  branch_id: r.branch.id,
  branch_name: r.branch.name,
  reminded_at: nowIso,
},
        })

        // Update hanya setelah post system message berhasil.
        callSupabase(
`raos_saldo_requests?id=eq.${encodeURIComponent(r.id)}`,
'PATCH',
{ last_reminded_at: nowIso }
        )
        reminded++
      } catch (rowErr) {
        failed++
        logSistem('error', 'reminderSaldoBelumDiisi', 'error',
`${r.request_no || r.id}: ${rowErr.message}`)
      }
    })

    logSistem('cron', 'reminderSaldoBelumDiisi', failed ? 'warning' : 'success',
      `${reminded} request di-remind, ${capped} di-cap 24h, ${failed} error`)
    return { success: failed === 0, reminded, capped, failed }
  } catch (e) {
    logSistem('error', 'reminderSaldoBelumDiisi', 'error', e.message)
    return { success: false, message: e.message }
  } finally {
    lock.releaseLock()
  }
}

/**
 * Hitung berapa kali reminder 'saldo_belum_diisi' sudah dikirim untuk
 * request ini dalam 24 jam terakhir. Sumber: chat_messages system message
 * yang di-post raos_post_system_message — metadata (event, request_id, dst)
 * di-embed sebagai `<!--SYSMETA:{...}-->` di awal kolom `content` (lihat
 * RPC raos_post_system_message), BUKAN kolom terpisah. Tidak perlu kolom
 * reminder_count baru untuk Finding 2 — count 24 jam ini cukup reliable
 * karena setiap reminder yang berhasil terkirim SELALU lewat RPC yang sama
 * (satu-satunya caller: reminderSaldoBelumDiisi di atas).
 *
 * Architect review (2026-08-19): match key WAJIB deterministic —
 * `"event": "saldo_belum_diisi"` (exact JSON key:value, bukan cuma
 * substring `saldo_belum_diisi` yang bisa keliru match field lain) DAN
 * `"request_id": "<uuid>"` (exact JSON key:value). TIDAK pernah cari
 * berdasarkan nama driver atau nominal — keduanya bukan identifier unik
 * (driver/nominal yang sama bisa muncul di request lain).
 *
 * Dipanggil HANYA untuk row yang SUDAH lolos filter murah (status/
 * is_processed, umur >=15 menit, last_reminded_at >=60 menit) di query
 * PostgREST reminderSaldoBelumDiisi di atas — bukan untuk semua pending
 * row setiap cron tick. Ini query tambahan (network call) per kandidat
 * yang SUDAH eligible, bukan per semua row pending.
 *
 * `limit` dipakai sebagai batas count query (hemat payload) — cukup untuk
 * cek "apakah sudah >= cap", tidak perlu count eksak di atas cap.
 */
function _countSaldoReminders24h_(requestId, limit) {
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const pattern = '*"event": "saldo_belum_diisi"*"request_id": "' + requestId + '"*'
  const rows = callSupabase(
    'chat_messages?type=eq.system' +
    '&content=like.' + encodeURIComponent(pattern) +
    '&created_at=gte.' + encodeURIComponent(cutoffIso) +
    '&select=id&limit=' + encodeURIComponent(String(limit))
  ) || []
  return rows.length
}
