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
 * Poin 7 (2026-08-08): cron 5-menit reminder chat "Belum Diisi".
 * Request eligible: belum diproses, umur >5 menit, reminder terakhir
 * NULL atau sudah >5 menit. Post WAJIB via raos_post_system_message.
 */
function reminderSaldoBelumDiisi() {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(10000)) {
    logSistem('cron', 'reminderSaldoBelumDiisi', 'skipped',
      'Run sebelumnya masih aktif — skip duplicate reminder')
    return { success: true, skipped: true }
  }

  try {
    const now = new Date()
    const nowIso = now.toISOString()
    const cutoffIso = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

    const rows = callSupabase(
      'raos_saldo_requests?is_processed=eq.false&status=in.(pending,approved)' +
      '&requested_at=lt.' + encodeURIComponent(cutoffIso) +
      '&or=(last_reminded_at.is.null,last_reminded_at.lt.' + encodeURIComponent(cutoffIso) + ')' +
      '&select=id,request_no,requested_at,nominal,driver_name,' +
      'staff:user_profiles!staff_id(full_name),' +
      'branch:branches!branch_id(id,name)' +
      '&order=requested_at.asc&limit=50'
    ) || []

    if (!rows.length) {
      logSistem('cron', 'reminderSaldoBelumDiisi', 'success',
        'Tidak ada request saldo yang perlu reminder')
      return { success: true, reminded: 0, failed: 0 }
    }

    let reminded = 0
    let failed = 0

    rows.forEach(r => {
      if (!r.branch?.id) return

      try {
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
        ].join('
')

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
      `${reminded} request di-remind, ${failed} error`)
    return { success: failed === 0, reminded, failed }
  } catch (e) {
    logSistem('error', 'reminderSaldoBelumDiisi', 'error', e.message)
    return { success: false, message: e.message }
  } finally {
    lock.releaseLock()
  }
}
