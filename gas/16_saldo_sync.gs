// ============================================================
// 16_saldo_sync.gs — Sync raos_saldo_requests → tab "Form Isi Saldo"
// ============================================================
//
// Pull raos_saldo_requests dari Supabase yang belum synced, tulis ke tab
// "Form Isi Saldo" di spreadsheet RAOS. Setelah tulis, patch
// synced_to_sheet_at supaya baris tidak double-tulis di run berikutnya.
//
// Trigger: 15 menit (di-append di 09_trigger.gs setupAllTriggers).
// Manual: menu 🛠️ RAOS System → 💰 Isi Saldo → 🔄 Sync ke Sheet.

const SALDO_SHEET_NAME = 'Form Isi Saldo'

function getSaldoSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet()
  if (active) return active
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  if (!id) throw new Error('SPREADSHEET_ID Script Property belum diset')
  return SpreadsheetApp.openById(id)
}

function ensureSaldoSheet_(ss) {
  let sh = ss.getSheetByName(SALDO_SHEET_NAME)
  if (!sh) {
    sh = ss.insertSheet(SALDO_SHEET_NAME)
    sh.getRange(1, 1, 1, 10).setValues([[
      'No Request', 'Tanggal', 'Nama Staff', 'Cabang', 'Nominal',
      'Status', 'Disetujui Oleh', 'Waktu Disetujui', 'Alasan Tolak', 'Catatan'
    ]]).setFontWeight('bold').setBackground('#F5A623').setFontColor('#000')
    sh.getRange('E:E').setNumberFormat('"Rp"#,##0')
    sh.setFrozenRows(1)
  }
  return sh
}

function syncSaldoRequestsToSheet() {
  let synced = 0, errors = 0
  try {
    // Ambil request yang belum di-sync (semua status — pending/approved/rejected).
    const rows = callSupabase(
      'raos_saldo_requests?synced_to_sheet_at=is.null&select=' +
      'id,request_no,requested_at,nominal,status,rejection_reason,note,approved_at,' +
      'staff:user_profiles!staff_id(full_name),' +
      'branch:branches!branch_id(name,slug),' +
      'approver:user_profiles!approved_by(full_name)' +
      '&order=requested_at.asc'
    ) || []

    if (rows.length === 0) {
      logSistem('sync', 'syncSaldoRequestsToSheet', 'success', '0 request baru untuk di-sync')
      return
    }

    const ss = getSaldoSpreadsheet_()
    const sh = ensureSaldoSheet_(ss)

    const values = rows.map(r => [
      r.request_no,
      r.requested_at ? new Date(r.requested_at) : '',
      r.staff ? r.staff.full_name : '(unknown staff)',
      r.branch ? r.branch.name : '(unknown branch)',
      Number(r.nominal) || 0,
      r.status,
      r.approver ? r.approver.full_name : '',
      r.approved_at ? new Date(r.approved_at) : '',
      r.rejection_reason || '',
      r.note || '',
    ])

    const startRow = sh.getLastRow() + 1
    sh.getRange(startRow, 1, values.length, 10).setValues(values)
    sh.getRange(startRow, 2, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss')
    sh.getRange(startRow, 8, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss')

    // Patch synced_to_sheet_at supaya tidak double-tulis
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
      `${synced} baris ditulis ke sheet, ${errors} error`)

    try {
      if (typeof SpreadsheetApp !== 'undefined') {
        SpreadsheetApp.getUi().alert(`✅ Sync Isi Saldo Selesai\n\n${synced} pengajuan ditulis ke tab "${SALDO_SHEET_NAME}"`)
      }
    } catch (e) { /* trigger context — no UI */ }
  } catch (e) {
    logSistem('error', 'syncSaldoRequestsToSheet', 'error', e.message)
    throw e
  }
}
