// ============================================================
// 02_absensi.gs — Modul Absensi Staff
// ============================================================
// Kolom sheet ABSENSI (0-based index):
// 0:ID  1:TANGGAL  2:NAMA STAFF  3:ID STAFF  4:JAM MASUK
// 5:JAM PULANG  6:STATUS  7:LOKASI VALID  8:PICKUP POINT

function importAbsensiFromSupabase() {
  const sh = getSheet(CONFIG.SHEETS.ABSENSI)

  // B3 fix: raos_attendance has 2 FKs to user_profiles (staff_id AND
  // manual_edited_by) -- an unhinted user_profiles(...) embed is ambiguous
  // and PostgREST returns HTTP 300. Explicit FK hint picks the staff record,
  // which is what this report actually needs (matches previous behavior).
  const rows = callSupabase(
    'raos_attendance?select=id,date,check_in_at,check_out_at,status,is_location_valid,' +
    'pickup_points(name),user_profiles!raos_attendance_staff_id_fkey(full_name,staff_id)' +
    '&order=check_in_at.desc&limit=500'
  )

  if (!rows || !rows.length) {
    try { SpreadsheetApp.getUi().alert('Tidak ada data absensi di Supabase.') } catch (e) { /* trigger context */ }
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
  try { SpreadsheetApp.getUi().alert(`✅ Berhasil import ${rows.length} data absensi dari Supabase.`) } catch (e) { /* trigger context */ }
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
    const tgl = new Date(rows[i][1])
    if (!tgl || tgl.getMonth() + 1 !== bulan || tgl.getFullYear() !== tahun) continue
    const nama = rows[i][2]
    if (!rekap[nama]) rekap[nama] = { hadir: 0, terlambat: 0, alpha: 0 }
    const status = rows[i][6]
    if (status === 'hadir') rekap[nama].hadir++
    else if (status === 'terlambat') rekap[nama].terlambat++
    else rekap[nama].alpha++
  }
  return rekap
}

function getShiftIdByName_(name) {
  const key = 'SHIFT_ID_' + name.toUpperCase()
  let id = PropertiesService.getScriptProperties().getProperty(key)
  if (!id) {
    const shifts = callSupabase(`shifts?name=eq.${encodeURIComponent(name)}&select=id&limit=1`) || []
    if (shifts.length > 0) {
      id = shifts[0].id
      PropertiesService.getScriptProperties().setProperty(key, id)
    }
  }
  return id
}

// B14 timezone hardening: reminder audience follows each roster branch's
// business date. BPN/MDC/UPG are Asia/Makassar (WITA); WIB branches use
// Asia/Jakarta. Never derive roster date from UTC ISO date.
function reminderBranchTimezoneMap_() {
  const rows = callSupabase('branches?is_active=eq.true&select=id,timezone') || []
  const out = {}
  rows.forEach(b => { out[b.id] = b.timezone || 'Asia/Jakarta' })
  return out
}

function reminderLocalDate_(dateObj, timezone) {
  return Utilities.formatDate(dateObj || new Date(), timezone || 'Asia/Jakarta', 'yyyy-MM-dd')
}

function reminderRosterToday_(shiftId) {
  const now = new Date()
  const tzByBranch = reminderBranchTimezoneMap_()
  let dates = Array.from(new Set(Object.keys(tzByBranch).map(id => reminderLocalDate_(now, tzByBranch[id]))))
  if (dates.length === 0) dates = [reminderLocalDate_(now, 'Asia/Jakarta')]

  const roster = callSupabase(
    `raos_shift_schedules?tanggal=in.(${dates.join(',')})&shift_id=eq.${shiftId}&select=staff_id,branch_id,tanggal`
  ) || []

  const filtered = roster.filter(r => {
    const tz = tzByBranch[r.branch_id] || 'Asia/Jakarta'
    return r.tanggal === reminderLocalDate_(now, tz)
  })

  return {
    rows: filtered,
    dates: Array.from(new Set(filtered.map(r => r.tanggal))),
  }
}

function kirimReminderMasukShift_(shiftName) {
  const shiftId = getShiftIdByName_(shiftName)
  if (!shiftId) {
    logSistem('warning', 'kirimReminderMasukShift_', 'warning', `Shift "${shiftName}" tidak ditemukan di DB shifts`)
    return
  }

  const rosterInfo = reminderRosterToday_(shiftId)
  const roster = rosterInfo.rows
  if (roster.length === 0) {
    logSistem('cron', `reminderMasuk${shiftName}`, 'success', '0 staff berjadwal shift ini pada tanggal lokal cabang')
    return
  }

  const scheduledDateByStaff = new Map(roster.map(r => [r.staff_id, r.tanggal]))
  const staffAktif = callSupabase(
    'user_profiles?is_active=eq.true&role=eq.staff&select=id,staff_id,full_name,phone,branch_id'
  ) || []
  const staff = staffAktif.filter(s => scheduledDateByStaff.has(s.id))
  if (staff.length === 0) return

  const attendanceDates = rosterInfo.dates
  const absensiHariIni = callSupabase(
    `raos_attendance?date=in.(${attendanceDates.join(',')})&check_in_at=not.is.null&select=staff_id,date`
  ) || []
  const sudahAbsen = new Set(absensiHariIni.map(a => `${a.staff_id}|${a.date}`))

  const belum = staff.filter(s => !sudahAbsen.has(`${s.id}|${scheduledDateByStaff.get(s.id)}`))
  if (belum.length === 0) {
    logSistem('cron', `reminderMasuk${shiftName}`, 'success', '0 staff belum absen (semua roster lokal cabang sudah check-in)')
    return
  }

  let waTerkirim = 0
  belum.forEach(s => {
    if (!s.phone) return
    sendWhatsApp(
      s.phone,
      `⏰ *PENGINGAT ABSENSI MASUK — Shift ${shiftName}*\nHai ${s.full_name}, sebentar lagi shift ${shiftName} mulai.\nSegera absen masuk di aplikasi RAOS.`
    )
    waTerkirim++
  })

  const tagDate = attendanceDates.slice().sort().join('_')
  const pushRes = invokePushFromGas_(
    belum.map(s => s.id),
    `⏰ Reminder Masuk — Shift ${shiftName}`,
    `Sebentar lagi shift ${shiftName} mulai. Buka RAOS untuk check-in.`,
    '/absensi',
    `reminder-masuk-${shiftName.toLowerCase()}-${tagDate}`,
    'pengingat_absen'
  )

  logSistem('cron', `reminderMasuk${shiftName}`, 'success',
    `${belum.length} staff belum absen. WA: ${waTerkirim}, Push: ${pushRes.sent}/${pushRes.total}`)
}

function kirimReminderPulangShift_(shiftName) {
  const shiftId = getShiftIdByName_(shiftName)
  if (!shiftId) {
    logSistem('warning', 'kirimReminderPulangShift_', 'warning', `Shift "${shiftName}" tidak ditemukan di DB shifts`)
    return
  }

  const rosterInfo = reminderRosterToday_(shiftId)
  const roster = rosterInfo.rows
  if (roster.length === 0) {
    logSistem('cron', `reminderPulang${shiftName}`, 'success', '0 staff berjadwal shift ini pada tanggal lokal cabang')
    return
  }

  const scheduledDateByStaff = new Map(roster.map(r => [r.staff_id, r.tanggal]))
  const staffAktif = callSupabase(
    'user_profiles?is_active=eq.true&role=eq.staff&select=id,staff_id,full_name,phone,branch_id'
  ) || []
  const staff = staffAktif.filter(s => scheduledDateByStaff.has(s.id))
  if (staff.length === 0) return

  const attendanceDates = rosterInfo.dates
  const attendance = callSupabase(
    `raos_attendance?date=in.(${attendanceDates.join(',')})&check_in_at=not.is.null&check_out_at=is.null&select=staff_id,date`
  ) || []
  const belumPulang = new Set(attendance.map(a => `${a.staff_id}|${a.date}`))
  const target = staff.filter(s => belumPulang.has(`${s.id}|${scheduledDateByStaff.get(s.id)}`))
  if (target.length === 0) {
    logSistem('cron', `reminderPulang${shiftName}`, 'success', '0 staff perlu diingatkan')
    return
  }

  const tagDate = attendanceDates.slice().sort().join('_')
  const pushRes = invokePushFromGas_(
    target.map(s => s.id),
    `🏁 Reminder Pulang — Shift ${shiftName}`,
    'Sudah waktunya check-out. Jangan lupa absen pulang di RAOS.',
    '/absensi',
    `reminder-pulang-${shiftName.toLowerCase()}-${tagDate}`,
    'pengingat_absen'
  )

  logSistem('cron', `reminderPulang${shiftName}`, 'success',
    `Push ke ${pushRes.sent}/${target.length} staff belum check-out`)
}

function reminderMasukPagi()  { kirimReminderMasukShift_('Pagi') }
function reminderMasukSiang() { kirimReminderMasukShift_('Siang') }
function reminderMasukMalam() { kirimReminderMasukShift_('Malam') }
function reminderPulangPagi()  { kirimReminderPulangShift_('Pagi') }
function reminderPulangSiang() { kirimReminderPulangShift_('Siang') }
function reminderPulangMalam() { kirimReminderPulangShift_('Malam') }

function kirimReminderAbsensi() { kirimReminderMasukShift_('Pagi') }
function kirimReminderPulang()  { kirimReminderPulangShift_('Pagi') }

function notifyPendingScansKoordinator() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const pending = callSupabase(
    `scan_orders?status=eq.pending&scanned_at=lt.${cutoff}&select=id,scan_id,scanned_at`
  ) || []
  if (pending.length === 0) return

  const koord = callSupabase(
    `user_profiles?is_active=eq.true&role=in.(koordinator,admin,management,direksi)&select=id`
  ) || []
  if (koord.length === 0) return

  const pushRes = invokePushFromGas_(
    koord.map(k => k.id),
    '⚠️ Scan Pending Perlu Validasi',
    `${pending.length} scan pending >15 menit. Buka Panel Admin untuk validasi.`,
    '/admin',
    'pending-scans',
    'validasi_koordinator'
  )

  logSistem('cron', 'notifyPendingScansKoordinator', 'success',
    `${pending.length} scan pending → push ke ${pushRes.sent}/${koord.length} koord/admin`)
}

function invokePushFromGas_(userIds, title, body, url, tag, kategori) {
  if (!userIds || userIds.length === 0) return { sent: 0, total: 0, failed: 0 }
  try {
    const payloadObj = { user_ids: userIds, title, body, url, tag }
    if (kategori) payloadObj.kategori = kategori
    const res = UrlFetchApp.fetch(
      `${CONFIG.SUPABASE_URL}/functions/v1/raos-send-push`,
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        },
        payload: JSON.stringify(payloadObj),
        muteHttpExceptions: true,
      }
    )
    const code = res.getResponseCode()
    const text = res.getContentText()
    if (code >= 400) {
      logSistem('warning', 'invokePushFromGas_', 'warning', `Edge Function HTTP ${code}: ${text}`)
      return { sent: 0, total: userIds.length, failed: userIds.length }
    }
    const j = JSON.parse(text)
    return { sent: j.sent || 0, total: j.total || 0, failed: j.failed || 0 }
  } catch (e) {
    logSistem('error', 'invokePushFromGas_', 'error', e.message)
    return { sent: 0, total: userIds.length, failed: userIds.length }
  }
}