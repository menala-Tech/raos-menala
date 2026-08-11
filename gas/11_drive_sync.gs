// ============================================================
// 11_drive_sync.gs — RAOS selfie + backup writer V4
// ============================================================
// Replacement writer. Mempertahankan public function existing:
//   syncSelfiePhotosToGDrive() — trigger 30 menit
//   backupHarian()             — trigger 02:00
//
// Destination V4:
// ABSENSI/YYYY/MM_Bulan/01_FOTO_ABSENSI/<Pickup Point>/...
// RAOS_PWA/YYYY/MM_Bulan/04_BACKUP_SPREADSHEET/...

const RAOS_DRIVE_SYNC_BATCH = 250

function _raosSafeFilePart_(value, fallback) {
  const s = String(value || fallback || '').trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .substring(0, 100)
  return s || String(fallback || 'unknown')
}

function _raosDownloadSelfieBlob_(url, fileName) {
  const target = String(url || '').trim()
  if (!target) return null
  const res = UrlFetchApp.fetch(target, { muteHttpExceptions: true, followRedirects: true })
  const code = res.getResponseCode()
  if (code < 200 || code >= 300) {
    throw new Error(`Foto HTTP ${code}: ${target.substring(0, 120)}`)
  }
  return res.getBlob().setName(fileName)
}

function _raosDriveLookupMaps_() {
  const pickupRows = callSupabase('pickup_points?select=id,name&limit=1000') || []
  const profileRows = callSupabase('user_profiles?select=id,staff_id,full_name&limit=2000') || []
  const pickup = {}
  const profile = {}
  pickupRows.forEach(row => { if (row.id) pickup[row.id] = row.name || row.id })
  profileRows.forEach(row => {
    if (row.id) profile[row.id] = { name: row.full_name || row.staff_id || row.id, staff_id: row.staff_id || '' }
  })
  return { pickup, profile }
}

function _raosPendingSelfieRows_() {
  // Fetch recent unsynced candidates. Client-side condition avoids fragile PostgREST OR encoding.
  const rows = callSupabase(
    'raos_attendance?select=id,staff_id,pickup_point_id,date,selfie_in_url,selfie_out_url,selfie_in_drive_synced,selfie_out_drive_synced,created_at&order=date.desc&limit=' + RAOS_DRIVE_SYNC_BATCH
  ) || []
  return rows.filter(row =>
    (!!row.selfie_in_url && row.selfie_in_drive_synced !== true) ||
    (!!row.selfie_out_url && row.selfie_out_drive_synced !== true)
  )
}

function _raosSyncOneSelfie_(row, side, maps) {
  const urlKey = side === 'in' ? 'selfie_in_url' : 'selfie_out_url'
  const flagKey = side === 'in' ? 'selfie_in_drive_synced' : 'selfie_out_drive_synced'
  const url = String(row[urlKey] || '').trim()
  if (!url || row[flagKey] === true) return false

  const profile = maps.profile[row.staff_id] || {}
  const pickupName = _raosSafeFilePart_(maps.pickup[row.pickup_point_id], 'Tanpa Pickup Point')
  const dateText = String(row.date || Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd'))
  const when = new Date(`${dateText}T12:00:00+07:00`)
  const staffCode = _raosSafeFilePart_(profile.staff_id || row.staff_id, 'staff')
  const staffName = _raosSafeFilePart_(profile.name, 'staff')
  const ext = /\.png(?:\?|$)/i.test(url) ? 'png' : 'jpg'
  const fileName = `${dateText}_${staffCode}_${staffName}_${side === 'in' ? 'MASUK' : 'PULANG'}.${ext}`

  const blob = _raosDownloadSelfieBlob_(url, fileName)
  raosCanonicalSaveBlob_('absensi', 'foto_absensi', blob, fileName, when, pickupName)

  const patch = {}
  patch[flagKey] = true
  callSupabase('raos_attendance?id=eq.' + encodeURIComponent(row.id), 'PATCH', patch)
  return true
}

function syncSelfiePhotosToGDrive() {
  let synced = 0, failed = 0
  const errors = []
  try {
    const maps = _raosDriveLookupMaps_()
    const rows = _raosPendingSelfieRows_()
    rows.forEach(row => {
      ;['in', 'out'].forEach(side => {
        try {
          if (_raosSyncOneSelfie_(row, side, maps)) synced++
        } catch (err) {
          failed++
          errors.push(`${row.id}/${side}: ${err.message || err}`)
        }
      })
    })
    const summary = `${synced} foto tersinkron, ${failed} gagal`
    try { logSistem('sync', 'syncSelfiePhotosToGDrive', failed ? 'warning' : 'success', summary) } catch (_) {}
    errors.slice(0, 20).forEach(msg => { try { logSistem('sync', 'syncSelfiePhotosToGDrive', 'warning', msg) } catch (_) {} })
    return { success: failed === 0, synced, failed, errors }
  } catch (err) {
    try { logSistem('error', 'syncSelfiePhotosToGDrive', 'error', err.message || String(err)) } catch (_) {}
    throw err
  }
}

function backupHarian() {
  try {
    const file = raosCanonicalBackupActiveSpreadsheet_(new Date())
    try { logSistem('backup', 'backupHarian', 'success', `Backup canonical: ${file.getName()} (${file.getId()})`) } catch (_) {}
    return { success: true, file_id: file.getId(), file_name: file.getName(), url: file.getUrl() }
  } catch (err) {
    try { logSistem('backup', 'backupHarian', 'error', err.message || String(err)) } catch (_) {}
    throw err
  }
}

// Compatibility helper untuk caller lama. V4 mengembalikan subfolder di bawah
// canonical root, bukan root legacy yang diberikan caller.
function getOrCreateSubfolder(parent, name) {
  return raosCanonicalGetOrCreateFolder_(parent, name)
}
