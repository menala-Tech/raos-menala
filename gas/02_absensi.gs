// ============================================================
// 02_absensi.gs — Modul Absensi Staff
// ============================================================
// Kolom sheet ABSENSI (0-based index):
// 0:ID  1:TANGGAL  2:NAMA STAFF  3:ID STAFF  4:JAM MASUK
// 5:JAM PULANG  6:STATUS  7:LOKASI VALID  8:PICKUP POINT

function importAbsensiFromSupabase() {
  const sh = getSheet(CONFIG.SHEETS.ABSENSI)

  const rows = callSupabase(
    'raos_attendance?select=id,date,check_in_at,check_out_at,status,is_location_valid,' +
    'pickup_points(name),user_profiles(full_name,staff_id)' +
    '&order=check_in_at.desc&limit=500'
  )

  if (!rows || !rows.length) {
    SpreadsheetApp.getUi().alert('Tidak ada data absensi di Supabase.')
    return
  }

  const headers = ['ID', 'TANGGAL', 'NAMA STAFF', 'ID STAFF', 'JAM MASUK', 'JAM PULANG', 'STATUS', 'LOKASI VALID', 'PICKUP POINT']

  const data = rows.map(r => {
    const masuk  = r.check_in_at  ? new Date(r.check_in_at).toLocaleTimeString('id-ID',  { hour: '2-digit', minute: '2-digit' }) : ''
    const pulang = r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''
    return [
      r.id,
      r.date || '',
      r.user_profiles?.full_name || '',
      r.user_profiles?.staff_id  || '',
      masuk,
      pulang,
      r.status || '',
      r.is_location_valid ? 'Ya' : 'Tidak',
      r.pickup_points?.name || '',
    ]
  })

  sh.clearContents()
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
  sh.getRange(2, 1, data.length, headers.length).setValues(data)
  sh.getRange(1, 1, 1, headers.length)
    .setBackground('#1a3a5c').setFontColor('#ffffff').setFontWeight('bold')

  logSistem('import', 'importAbsensiFromSupabase', 'success', `${rows.length} data diimport`)
  SpreadsheetApp.getUi().alert(`✅ Berhasil import ${rows.length} data absensi dari Supabase.`)
}

function syncAbsensiToSupabase() {
  const sh = getSheet(CONFIG.SHEETS.ABSENSI)
  const rows = sh.getDataRange().getValues()
  const headers = rows[0]
  let synced = 0, errors = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0]) continue

    const record = {}
    headers.forEach((h, idx) => { record[h] = row[idx] })

    try {
      const payload = {
        staff_id:          record['ID STAFF'],
        date:              formatDate(record['TANGGAL']),
        check_in_at:       record['JAM MASUK']  ? `${formatDate(record['TANGGAL'])}T${record['JAM MASUK']}` : null,
        check_out_at:      record['JAM PULANG'] ? `${formatDate(record['TANGGAL'])}T${record['JAM PULANG']}` : null,
        status:            record['STATUS'] === 'Valid' ? 'hadir' : 'terlambat',
        is_location_valid: record['LOKASI VALID'] === 'Ya',
      }
      callSupabase('raos_attendance?on_conflict=staff_id,date', 'POST', payload)
      synced++
    } catch (e) {
      errors++
      logSistem('error', 'syncAbsensiToSupabase', 'error', `Baris ${i + 1}: ${e.message}`)
    }
  }

  logSistem('import', 'syncAbsensiToSupabase', 'success', `${synced} berhasil, ${errors} error`)
  return { synced, errors }
}

function rekapAbulanan(bulan, tahun) {
  const sh = getSheet(CONFIG.SHEETS.ABSENSI)
  const rows = sh.getDataRange().getValues()
  const rekap = {}

  for (let i = 1; i < rows.length; i++) {
    const tgl = new Date(rows[i][1])  // index 1 = TANGGAL
    if (!tgl || tgl.getMonth() + 1 !== bulan || tgl.getFullYear() !== tahun) continue
    const nama = rows[i][2]           // index 2 = NAMA STAFF
    if (!rekap[nama]) rekap[nama] = { hadir: 0, terlambat: 0, alpha: 0 }
    const status = rows[i][6]         // index 6 = STATUS
    if (status === 'hadir') rekap[nama].hadir++
    else if (status === 'terlambat') rekap[nama].terlambat++
    else rekap[nama].alpha++
  }
  return rekap
}

function kirimReminderAbsensi() {
  const sh = getSheet(CONFIG.SHEETS.DB_STAFF)
  const staff = sh.getDataRange().getValues().slice(1)
  const today = formatDate(new Date())

  const shAbsensi = getSheet(CONFIG.SHEETS.ABSENSI)
  const absensiRows = shAbsensi.getDataRange().getValues().slice(1)
  const sudahAbsen = new Set(
    absensiRows
      .filter(r => formatDate(r[1]) === today && r[4] !== '')  // r[1]=TANGGAL, r[4]=JAM MASUK
      .map(r => r[3])                                           // r[3]=ID STAFF
  )

  staff.forEach(([id, nama, , , hp]) => {
    if (!sudahAbsen.has(id)) {
      sendWhatsApp(hp, `⏰ *PENGINGAT ABSENSI*\nHai ${nama}, kamu belum absen masuk hari ini.\nSegera lakukan absensi melalui aplikasi RAOS.`)
    }
  })
}
