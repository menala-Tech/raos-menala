// ============================================================
// 18_driver_queue_sync.gs — Sync raos_driver_queue → tab "Antrian Driver"
// ============================================================
//
// Snapshot state queue driver per cabang untuk audit + laporan admin.
// Dipull SEMUA row (waiting/called/completed/left) → tab "Antrian Driver".
// Idempotent — refresh full setiap run.

const QUEUE_SHEET_NAME = 'Antrian Driver'

function getQueueSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet()
  if (active) return active
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  if (!id) throw new Error('SPREADSHEET_ID Script Property belum diset')
  return SpreadsheetApp.openById(id)
}

function ensureQueueSheet_(ss) {
  let sh = ss.getSheetByName(QUEUE_SHEET_NAME)
  if (!sh) sh = ss.insertSheet(QUEUE_SHEET_NAME)
  sh.clear()
  sh.getRange(1, 1, 1, 10).setValues([[
    'Cabang', 'Posisi', 'Driver ID', 'Nama Driver', 'Vehicle Plate',
    'Status', 'Bergabung', 'Dipanggil', 'Selesai', 'Note'
  ]]).setFontWeight('bold').setBackground('#F5A623').setFontColor('#000')
  sh.setFrozenRows(1)
  return sh
}

function syncDriverQueueToSheet() {
  try {
    const rows = callSupabase(
      'raos_driver_queue?select=' +
      'position,status,joined_at,called_at,completed_at,note,' +
      'driver:raos_drivers!driver_id(driver_id,name,vehicle_plate),' +
      'branch:branches!branch_id(name,slug)' +
      '&order=branch_id.asc,position.asc'
    ) || []

    const ss = getQueueSpreadsheet_()
    const sh = ensureQueueSheet_(ss)

    if (rows.length === 0) {
      logSistem('sync', 'syncDriverQueueToSheet', 'success', '0 baris queue')
      try { SpreadsheetApp.getUi().alert('✅ Sync Antrian Driver — tabel kosong (belum ada driver antre).') } catch(e){}
      return
    }

    const values = rows.map(r => [
      r.branch?.name || r.branch?.slug || '(unknown)',
      r.position,
      r.driver?.driver_id || '',
      r.driver?.name || '',
      r.driver?.vehicle_plate || '',
      r.status,
      r.joined_at ? new Date(r.joined_at) : '',
      r.called_at ? new Date(r.called_at) : '',
      r.completed_at ? new Date(r.completed_at) : '',
      r.note || '',
    ])

    sh.getRange(2, 1, values.length, 10).setValues(values)
    sh.getRange(2, 7, values.length, 3).setNumberFormat('yyyy-mm-dd hh:mm:ss')
    sh.autoResizeColumns(1, 10)

    logSistem('sync', 'syncDriverQueueToSheet', 'success', `${values.length} row → sheet`)
    try {
      SpreadsheetApp.getUi().alert(`✅ Sync Antrian Driver Selesai — ${values.length} baris tertulis.`)
    } catch(e) { /* trigger */ }
  } catch (e) {
    logSistem('error', 'syncDriverQueueToSheet', 'error', e.message)
    throw e
  }
}
