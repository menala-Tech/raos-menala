// ============================================================
// 02_absensi.gs — Modul Absensi Staff
// ============================================================

function syncAbsensiToSupabase() {
  const sh = getSheet(CONFIG.SHEETS.ABSENSI)
  const rows = sh.getDataRange().getValues()
  const headers = rows[0]
  let synced = 0, errors = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0]) continue  // skip baris kosong

    const record = {}
    headers.forEach((h, idx) => { record[h] = row[idx] })

    try {
      const payload = {
        staff_id:         record['ID STAFF'],
        date:             formatDate(record['TANGGAL']),
        check_in_at:      record['JAM MASUK']  ? `${formatDate(record['TANGGAL'])}T${record['JAM MASUK']}` : null,
        check_out_at:     record['JAM PULANG'] ? `${formatDate(record['TANGGAL'])}T${record['JAM PULANG']}` : null,
        status:           record['STATUS'] === 'Valid' ? 'hadir' : 'terlambat',
        is_location_valid: record['LOKASI'] !== '',
      }
      callSupabase('attendance?on_conflict=staff_id,date', 'POST', payload)
      synced++
    } catch (e) {
      errors++
      logActivity('SYSTEM', 'sync_absensi_error', `Baris ${i + 1}: ${e.message}`)
    }
  }

  logSistem('import', 'syncAbsensiToSupabase', 'success',
    `Sinkron absensi: ${synced} berhasil, ${errors} error`)
  return { synced, errors }
}

function rekapAbulanan(bulan, tahun) {
  const sh = getSheet(CONFIG.SHEETS.ABSENSI)
  const rows = sh.getDataRange().getValues()
  const rekap = {}

  for (let i = 1; i < rows.length; i++) {
    const tgl = new Date(rows[i][0])
    if (!tgl || tgl.getMonth() + 1 !== bulan || tgl.getFullYear() !== tahun) continue
    const nama = rows[i][3]  // NAMA STAFF
    if (!rekap[nama]) rekap[nama] = { hadir: 0, terlambat: 0, alpha: 0 }
    const status = rows[i][7]  // STATUS
    if (status === 'Valid') rekap[nama].hadir++
    else if (status === 'Terlambat') rekap[nama].terlambat++
    else rekap[nama].alpha++
  }
  return rekap
}

function kirimReminderAbsensi() {
  const cfg = getSistemConfig()
  const sh = getSheet(CONFIG.SHEETS.DB_STAFF)
  const staff = sh.getDataRange().getValues().slice(1)
  const today = formatDate(new Date())

  const shAbsensi = getSheet(CONFIG.SHEETS.ABSENSI)
  const absensiRows = shAbsensi.getDataRange().getValues().slice(1)
  const sudahAbsen = new Set(
    absensiRows
      .filter(r => formatDate(r[0]) === today && r[7] !== '')
      .map(r => r[2])
  )

  staff.forEach(([id, nama, , , hp]) => {
    if (!sudahAbsen.has(id)) {
      sendWhatsApp(hp, `⏰ *PENGINGAT ABSENSI*\nHai ${nama}, kamu belum absen masuk hari ini.\nSegera lakukan absensi melalui aplikasi RAOS.`)
    }
  })
}
