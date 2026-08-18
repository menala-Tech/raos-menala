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
    // getUi() throw dari time-based trigger context — wrap try/catch supaya
    // trigger tidak 100% error (audit 1 Agu 2026).
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

// Helper: ambil shift id by name dari Supabase (cache di script property utk hemat request).
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

// Kirim reminder MASUK per shift. Panggil target: staff dengan shift ini
// yang BELUM absen hari ini. Kirim WA (kalau ada phone) + push.
//
// B14 fix (2026-08-19): shiftId dulu di-fetch tapi TIDAK PERNAH dipakai
// untuk filter -- audience sebenarnya adalah SEMUA staff aktif yang belum
// absen, terlepas dari shift mereka (komentar lama di sini bahkan mengakui
// ini: "Filter per shift bisa ditambah kalau nanti user_profiles punya
// kolom default_shift_id"). Sejak raos_shift_schedules (roster harian per
// staff, dipakai juga oleh raos_attendance_check_in RPC draft, B2/B13)
// sudah ada, filter itu sekarang mungkin: audience = staff yang punya
// entri roster untuk shift INI hari ini. Staff tanpa roster shift ini
// (shift lain, libur, atau roster belum diisi admin) tidak lagi menerima
// reminder shift yang bukan miliknya.
function kirimReminderMasukShift_(shiftName) {
  const shiftId = getShiftIdByName_(shiftName)
  if (!shiftId) {
    logSistem('warning', 'kirimReminderMasukShift_', 'warning', `Shift "${shiftName}" tidak ditemukan di DB shifts`)
    return
  }
  const today = new Date().toISOString().split('T')[0]

  const roster = callSupabase(
    `raos_shift_schedules?tanggal=eq.${today}&shift_id=eq.${shiftId}&select=staff_id`
  ) || []
  if (roster.length === 0) {
    logSistem('cron', `reminderMasuk${shiftName}`, 'success', '0 staff berjadwal shift ini hari ini (roster kosong)')
    return
  }
  const scheduledIds = new Set(roster.map(r => r.staff_id))

  // B14 review (round 4): explicit role=staff filter -- roster entries are
  // staff-only in practice today, but this makes the "role staff" audience
  // rule an actual query condition instead of an unstated assumption.
  const staffAktif = callSupabase(
    'user_profiles?is_active=eq.true&role=eq.staff&select=id,staff_id,full_name,phone'
  ) || []
  const staff = staffAktif.filter(s => scheduledIds.has(s.id))
  if (staff.length === 0) return

  const absensiHariIni = callSupabase(
    `raos_attendance?date=eq.${today}&check_in_at=not.is.null&select=staff_id`
  ) || []
  const sudahAbsen = new Set(absensiHariIni.map(a => a.staff_id))

  const belum = staff.filter(s => !sudahAbsen.has(s.id))
  if (belum.length === 0) {
    logSistem('cron', `reminderMasuk${shiftName}`, 'success', '0 staff belum absen (semua berjadwal shift ini sudah check-in)')
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

  const pushRes = invokePushFromGas_(
    belum.map(s => s.id),
    `⏰ Reminder Masuk — Shift ${shiftName}`,
    `Sebentar lagi shift ${shiftName} mulai. Buka RAOS untuk check-in.`,
    '/absensi',
    `reminder-masuk-${shiftName.toLowerCase()}-${today}`,
    'pengingat_absen'
  )

  logSistem('cron', `reminderMasuk${shiftName}`, 'success',
    `${belum.length} staff belum absen. WA: ${waTerkirim}, Push: ${pushRes.sent}/${pushRes.total}`)
}

// Kirim reminder PULANG per shift. Target: staff berjadwal shift ini hari
// ini yang sudah check_in tapi belum check_out.
//
// B14 fix (2026-08-19): shiftName dulu hanya dipakai untuk teks/logging --
// TIDAK ADA filter shift sama sekali (parameter tidak pernah dipakai untuk
// query). "Sudah check-in tapi belum check-out" saja tidak cukup: staff
// shift Malam yang belum waktunya pulang bisa kena reminder "Pulang Pagi"
// kalau kebetulan sudah check-in pagi itu untuk shift lain di hari yang
// sama (jarang tapi bukan mustahil dengan roster fleksibel). Sekarang
// di-scope ke staff yang rosternya memang shift ini hari ini.
function kirimReminderPulangShift_(shiftName) {
  const shiftId = getShiftIdByName_(shiftName)
  if (!shiftId) {
    logSistem('warning', 'kirimReminderPulangShift_', 'warning', `Shift "${shiftName}" tidak ditemukan di DB shifts`)
    return
  }
  const today = new Date().toISOString().split('T')[0]

  const roster = callSupabase(
    `raos_shift_schedules?tanggal=eq.${today}&shift_id=eq.${shiftId}&select=staff_id`
  ) || []
  if (roster.length === 0) {
    logSistem('cron', `reminderPulang${shiftName}`, 'success', '0 staff berjadwal shift ini hari ini (roster kosong)')
    return
  }
  const scheduledIds = new Set(roster.map(r => r.staff_id))

  // B14 review (round 4): explicit role=staff filter -- roster entries are
  // staff-only in practice today, but this makes the "role staff" audience
  // rule an actual query condition instead of an unstated assumption.
  const staffAktif = callSupabase(
    'user_profiles?is_active=eq.true&role=eq.staff&select=id,staff_id,full_name,phone'
  ) || []
  const staff = staffAktif.filter(s => scheduledIds.has(s.id))
  if (staff.length === 0) return

  const attendance = callSupabase(
    `raos_attendance?date=eq.${today}&check_in_at=not.is.null&check_out_at=is.null&select=staff_id`
  ) || []
  const belumPulangIds = new Set(attendance.map(a => a.staff_id))
  const target = staff.filter(s => belumPulangIds.has(s.id))
  if (target.length === 0) {
    logSistem('cron', `reminderPulang${shiftName}`, 'success', '0 staff perlu diingatkan')
    return
  }

  const pushRes = invokePushFromGas_(
    target.map(s => s.id),
    `🏁 Reminder Pulang — Shift ${shiftName}`,
    'Sudah waktunya check-out. Jangan lupa absen pulang di RAOS.',
    '/absensi',
    `reminder-pulang-${shiftName.toLowerCase()}-${today}`,
    'pengingat_absen'
  )

  logSistem('cron', `reminderPulang${shiftName}`, 'success',
    `Push ke ${pushRes.sent}/${target.length} staff belum check-out`)
}

// ─── Trigger callables (bind ke ScriptApp.newTrigger) ─────────────────
function reminderMasukPagi()  { kirimReminderMasukShift_('Pagi') }
function reminderMasukSiang() { kirimReminderMasukShift_('Siang') }
function reminderMasukMalam() { kirimReminderMasukShift_('Malam') }
function reminderPulangPagi()  { kirimReminderPulangShift_('Pagi') }
function reminderPulangSiang() { kirimReminderPulangShift_('Siang') }
function reminderPulangMalam() { kirimReminderPulangShift_('Malam') }

// Backward-compat alias untuk trigger lama
function kirimReminderAbsensi() { kirimReminderMasukShift_('Pagi') }
function kirimReminderPulang()  { kirimReminderPulangShift_('Pagi') }

// F: Notif ke koordinator kalau ada scan pending > 15 menit.
function notifyPendingScansKoordinator() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const pending = callSupabase(
    `scan_orders?status=eq.pending&scanned_at=lt.${cutoff}&select=id,scan_id,scanned_at`
  ) || []
  if (pending.length === 0) return

  // Ambil koordinator + admin + direksi + management
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

// Helper: invoke Edge Function raos-send-push dari GAS. Pakai SUPABASE_KEY
// (service role) di Script Properties → Edge Function verify_jwt=true
// bypass role check untuk service_role token.
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
