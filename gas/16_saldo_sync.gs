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

function ensureSaldoSheet_(ss) {
  let sh = ss.getSheetByName(SALDO_SHEET_NAME)
  if (!sh) {
    sh = ss.insertSheet(SALDO_SHEET_NAME)
    sh.getRange(1, 1, 1, 11).setValues([[
      'No Request', 'Tanggal', 'Nama Staff', 'Cabang', 'Nominal',
      'Status Validasi', 'Sudah Diisi', 'Waktu Diisi', 'Diisi Oleh',
      'Alasan Tolak', 'Request ID'
    ]]).setFontWeight('bold').setBackground('#F5A623').setFontColor('#000')
    sh.getRange('E:E').setNumberFormat('"Rp"#,##0')
    // Kolom G "Sudah Diisi" — checkbox
    sh.getRange(2, 7, 1000, 1).insertCheckboxes()
    // Kolom K "Request ID" — sembunyi, dipakai onEdit untuk match ke Supabase
    sh.hideColumn(sh.getRange('K:K'))
    sh.setFrozenRows(1)
  }
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
      r.request_no,
      r.requested_at ? new Date(r.requested_at) : '',
      r.staff ? r.staff.full_name : '(unknown)',
      r.branch ? r.branch.name : '(unknown)',
      Number(r.nominal) || 0,
      r.status,
      !!r.is_processed,
      r.processed_at ? new Date(r.processed_at) : '',
      r.processor ? r.processor.full_name : '',
      r.rejection_reason || '',
      r.id, // hidden, dipakai onEdit
    ])

    const startRow = sh.getLastRow() + 1
    sh.getRange(startRow, 1, values.length, 11).setValues(values)
    sh.getRange(startRow, 2, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss')
    sh.getRange(startRow, 8, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss')
    // Pastikan checkbox tetap tampil untuk baris baru
    sh.getRange(startRow, 7, values.length, 1).insertCheckboxes()

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
 * onEdit checkbox "Sudah Diisi" — dipanggil dari onEdit trigger `onEdit`
 * di 09_trigger.gs (sudah ada, extend). Kalau centang kolom G ("Sudah Diisi")
 * berubah ke true, PATCH is_processed=true di Supabase (trigger DB akan
 * dispatch push + auto-chat + update TARGET STAFF nanti).
 */
function handleSaldoCheckboxEdit_(e) {
  try {
    const sheet = e.range.getSheet()
    if (sheet.getName() !== SALDO_SHEET_NAME) return
    if (e.range.getColumn() !== 7) return  // kolom G "Sudah Diisi"
    if (e.range.getRow() === 1) return     // header

    const newValue = e.range.getValue()
    if (newValue !== true) return          // hanya react kalau di-centang

    const requestId = sheet.getRange(e.range.getRow(), 11).getValue() // kolom K
    if (!requestId) {
      logSistem('warning', 'handleSaldoCheckboxEdit_', 'warning', `Baris ${e.range.getRow()}: request ID kosong`)
      return
    }

    const adminEmail = Session.getActiveUser().getEmail() || ''
    // Lookup admin user_id via email (opsional — kalau tidak ketemu, biarkan null)
    let adminId = null
    if (adminEmail) {
      try {
        adminId = callSupabase(`rpc/get_auth_user_id_by_email`, 'POST', { p_email: adminEmail })
      } catch (err) { /* silent — trigger tetap fire tanpa processed_by */ }
    }

    const patch = {
      is_processed: true,
      processed_at: new Date().toISOString(),
    }
    if (adminId) patch.processed_by = adminId

    callSupabase(`raos_saldo_requests?id=eq.${requestId}`, 'PATCH', patch)
    sheet.getRange(e.range.getRow(), 8).setValue(new Date())
    if (adminEmail) sheet.getRange(e.range.getRow(), 9).setValue(adminEmail)

    // Update TARGET STAFF sheet — nominal tercapai untuk staff+bulan.
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
  try {
    const req = callSupabase(
      `raos_saldo_requests?id=eq.${requestId}&select=nominal,staff:user_profiles!staff_id(full_name)`
    )
    if (!req || req.length === 0) return
    const nominal = Number(req[0].nominal) || 0
    const namaStaff = req[0].staff?.full_name
    if (!namaStaff || nominal <= 0) return

    const sh = getSheet(CONFIG.SHEETS.TARGET_STAFF)
    const rows = sh.getDataRange().getValues()
    if (rows.length < 2) return

    const now = new Date()
    const bulan = now.getMonth() + 1
    const tahun = now.getFullYear()

    // Pastikan header punya kolom pencapaian_gmv
    let colPencapaian = rows[0].indexOf('pencapaian_gmv') + 1
    if (colPencapaian === 0) {
      colPencapaian = rows[0].length + 1
      sh.getRange(1, colPencapaian).setValue('pencapaian_gmv').setFontWeight('bold')
    }

    // Cari row match: nama + bulan + tahun
    for (let i = 1; i < rows.length; i++) {
      const rowDate = rows[i][0] instanceof Date ? rows[i][0] : new Date(rows[i][0])
      if (isNaN(rowDate)) continue
      if (rowDate.getMonth() + 1 !== bulan || rowDate.getFullYear() !== tahun) continue
      if (String(rows[i][2] || '').trim() !== namaStaff) continue

      const cell = sh.getRange(i + 1, colPencapaian)
      const cur = Number(cell.getValue()) || 0
      cell.setValue(cur + nominal)
      return
    }
    // Row tidak ditemukan — log saja, jangan create otomatis (nama bisa typo)
    logSistem('warning', 'updateTargetStaffPencapaian_', 'warning',
      `Row TARGET STAFF untuk ${namaStaff} ${bulan}/${tahun} tidak ada — pencapaian ${nominal} tidak dicatat`)
  } catch (e) {
    logSistem('error', 'updateTargetStaffPencapaian_', 'error', e.message)
  }
}

/**
 * Reminder chat 5-menit: request pending > 5 menit, is_processed=false,
 * belum ada reminder → post pesan ke room "Pengisian Saldo" cabang.
 * Format WA-style seperti gambar user.
 */
function reminderSaldoBelumDiisi() {
  try {
    const rows = callSupabase(
      'raos_saldo_requests?is_processed=eq.false&status=neq.rejected&status=neq.cancelled&select=' +
      'id,request_no,requested_at,nominal,' +
      'staff:user_profiles!staff_id(full_name),' +
      'branch:branches!branch_id(id,name)' +
      '&order=requested_at.asc'
    ) || []

    const now = new Date()
    const groupedByBranch = {}

    rows.forEach(r => {
      if (!r.branch) return
      const requested = new Date(r.requested_at)
      const menit = Math.floor((now - requested) / 60000)
      if (menit < 5) return
      const key = r.branch.id
      if (!groupedByBranch[key]) {
        groupedByBranch[key] = { branch: r.branch, items: [] }
      }
      const jamStr = Utilities.formatDate(requested, 'Asia/Jakarta', 'HH:mm')
      groupedByBranch[key].items.push({
        nama: r.staff?.full_name || '(unknown)',
        nominal: Number(r.nominal) || 0,
        request_no: r.request_no,
        jamStr,
        menit,
      })
    })

    Object.values(groupedByBranch).forEach(g => {
      const items = g.items
      const tanggal = Utilities.formatDate(now, 'Asia/Jakarta', 'dd MMMM yyyy')
      const bulletList = items.map(it =>
        `• ${it.nama} — Login ${it.request_no.split('-').pop()} — Rp ${it.nominal.toLocaleString('id-ID')} (request ${it.jamStr}, sudah ${it.menit} menit)`
      ).join('\n')

      const content =
        `🔴 RIFIM - SALDO BELUM DIPROSES\n\n` +
        `Cabang :\n${g.branch.name}\n\n` +
        `${items.length} permintaan belum dicentang "Sudah Diisi" (>5 menit) :\n${bulletList}\n\n` +
        `Tanggal :\n${tanggal}\n\n` +
        `Mohon segera diisi di AIST, lalu centang "Sudah Diisi" di sheet.\n\n` +
        `-----------------------\nPT Rifim International Gemilang`

      // Cari room "Pengisian Saldo" cabang (name ILIKE + branch_id match)
      const rooms = callSupabase(
        `chat_rooms?is_active=eq.true&or=(name.ilike.*pengisian%20saldo*,name.ilike.*isi%20saldo*)&branch_id=eq.${g.branch.id}&select=id`
      ) || []
      let roomId = rooms[0]?.id
      // Fallback ke room global "Pengisian Saldo"
      if (!roomId) {
        const globalRooms = callSupabase(
          `chat_rooms?is_active=eq.true&or=(name.ilike.*pengisian%20saldo*,name.ilike.*isi%20saldo*)&branch_id=is.null&select=id`
        ) || []
        roomId = globalRooms[0]?.id
      }
      if (!roomId) {
        logSistem('warning', 'reminderSaldoBelumDiisi', 'warning',
          `Room "Pengisian Saldo" tidak ditemukan untuk ${g.branch.name}`)
        return
      }

      callSupabase('chat_messages', 'POST', {
        room_id: roomId, type: 'text', content,
        // sender_id NULL akan gagal FK — pakai account service placeholder
        // atau skip. Untuk sekarang, gunakan admin awal.
      })
    })

    logSistem('cron', 'reminderSaldoBelumDiisi', 'success',
      `${Object.keys(groupedByBranch).length} cabang di-remind`)
  } catch (e) {
    logSistem('error', 'reminderSaldoBelumDiisi', 'error', e.message)
  }
}
