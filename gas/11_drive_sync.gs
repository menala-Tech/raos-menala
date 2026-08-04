// ============================================================
// 11_drive_sync.gs - Sync Foto Absensi Selfie ke Google Drive
// ============================================================
// Struktur folder BARU (sesi 2026-08-05):
//   {root ABSENSI_PHOTOS_ROOT_ID}/{Bulan YYYY-MM Nama}/{Cabang}/{Nama Staff (RIF****)}/foto.jpg
//
// Contoh:
//   1Aq-tMtVm89.../2026-08 Agustus/ID Rifim Airport Batam/Audra Agung pratama (RIF0120)/2026-08-05_<id>_masuk.jpg
//
// Struktur LAMA (Pickup Point/Bulan) — foto historical tetap di lokasi lama,
// tidak di-migrate. Sync baru langsung ke struktur baru.
//
// Foto selfie absensi diupload staff ke Supabase Storage (bucket 'selfies')
// dari aplikasi PWA. Script ini memindahkan salinannya ke folder Google Drive
// resmi RAOS, terorganisir per Bulan-Cabang-Staff sesuai request HRIS
// (Rifim-OS modul Absensi baca link foto dari raos_attendance).
//
// Kenapa lewat GAS (bukan langsung dari PWA)? Karena GAS berjalan di akun
// Google yang sama pemilik folder Drive ini - tidak perlu simpan credential
// Google tambahan di aplikasi web (yang berisiko bocor di sisi client).
// ============================================================

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

function syncSelfiePhotosToGDrive() {
  if (!CONFIG.DRIVE.ABSENSI_PHOTOS_ROOT_ID) {
    logSistem('error', 'syncSelfiePhotosToGDrive', 'error', 'ABSENSI_PHOTOS_ROOT_ID belum diset')
    return
  }

  // Query embed: user_profiles(full_name, staff_id) + branches(name, slug)
  // Backward: pickup_points(code) tetap di-fetch supaya kalau branch/staff kosong bisa fallback
  const rows = callSupabase(
    'raos_attendance?select=id,date,staff_id,branch_id,selfie_in_url,selfie_out_url,selfie_in_drive_synced,selfie_out_drive_synced,' +
      'user_profiles!raos_attendance_staff_id_fkey(full_name,staff_id),' +
      'branches!raos_attendance_branch_id_fkey(name,slug),' +
      'pickup_points(code)' +
    '&or=(and(selfie_in_url.not.is.null,selfie_in_drive_synced.eq.false),and(selfie_out_url.not.is.null,selfie_out_drive_synced.eq.false))' +
    '&limit=50'
  )

  if (!rows || !rows.length) {
    logSistem('sync', 'syncSelfiePhotosToGDrive', 'success', 'Tidak ada foto baru untuk disync')
    return
  }

  let synced = 0, errors = 0

  rows.forEach(row => {
    try {
      const folder = getStructuredAttendanceFolder(row)

      if (row.selfie_in_url && !row.selfie_in_drive_synced) {
        copySelfieToDrive(row.selfie_in_url, folder, `${row.date}_${row.id}_masuk.jpg`)
        callSupabase(`raos_attendance?id=eq.${row.id}`, 'PATCH', { selfie_in_drive_synced: true })
        synced++
      }
      if (row.selfie_out_url && !row.selfie_out_drive_synced) {
        copySelfieToDrive(row.selfie_out_url, folder, `${row.date}_${row.id}_pulang.jpg`)
        callSupabase(`raos_attendance?id=eq.${row.id}`, 'PATCH', { selfie_out_drive_synced: true })
        synced++
      }
    } catch (e) {
      errors++
      logSistem('error', 'syncSelfiePhotosToGDrive', 'error', `attendance.id=${row.id}: ${e.message}`)
    }
  })

  logSistem('sync', 'syncSelfiePhotosToGDrive', 'success', `${synced} foto disync (struktur baru Bulan/Cabang/Nama), ${errors} error`)
}

/** Unduh file dari Supabase Storage lalu simpan ke folder Drive tujuan. */
function copySelfieToDrive(storagePath, folder, fileName) {
  const url = `${CONFIG.SUPABASE_URL}/storage/v1/object/selfies/${storagePath}`
  const res = UrlFetchApp.fetch(url, {
    headers: {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
    },
    muteHttpExceptions: true,
  })
  if (res.getResponseCode() >= 400) {
    throw new Error(`Gagal unduh foto dari storage (${res.getResponseCode()}): ${storagePath}`)
  }
  folder.createFile(res.getBlob().setName(fileName))
}

/**
 * Struktur BARU: root/[Bulan YYYY-MM Nama]/[Cabang]/[Nama Staff (RIF****)]/
 * Fallback per level kalau data hilang:
 *   - Bulan wajib (dari date)
 *   - Cabang: branches.name -> fallback pickup_points.code -> 'Lainnya'
 *   - Staff:  user_profiles.full_name + (staff_id) -> fallback 'staff-unknown-<id>'
 */
function getStructuredAttendanceFolder(row) {
  const root = DriveApp.getFolderById(CONFIG.DRIVE.ABSENSI_PHOTOS_ROOT_ID)

  const d = new Date(row.date)
  const monthFolderName = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} ${MONTH_NAMES_ID[d.getMonth()]}`
  const monthFolder = getOrCreateSubfolder(root, monthFolderName)

  let cabangName = null
  if (row.branches && row.branches.name) cabangName = String(row.branches.name).trim()
  else if (row.pickup_points && row.pickup_points.code) cabangName = mapPickupPointCodeToFolderName(row.pickup_points.code)
  if (!cabangName) cabangName = 'Lainnya'
  cabangName = sanitizeFolderName(cabangName)
  const cabangFolder = getOrCreateSubfolder(monthFolder, cabangName)

  let staffName = null
  if (row.user_profiles && row.user_profiles.full_name) {
    const fn = String(row.user_profiles.full_name).trim()
    const code = row.user_profiles.staff_id ? String(row.user_profiles.staff_id).trim().toUpperCase() : ''
    staffName = code ? `${fn} (${code})` : fn
  }
  if (!staffName) staffName = `staff-unknown-${(row.staff_id || 'no-id').substring(0, 8)}`
  staffName = sanitizeFolderName(staffName)
  return getOrCreateSubfolder(cabangFolder, staffName)
}

function sanitizeFolderName(name) {
  return String(name).replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim() || 'Lainnya'
}

/** "T1.PP2" -> "T1 - Pickup Point 2". Fallback ke null kalau kode tidak dikenal. */
function mapPickupPointCodeToFolderName(code) {
  if (!code) return null
  const match = code.match(/^(T\d)\.PP(\d)$/)
  if (!match) return null
  return `${match[1]} - Pickup Point ${match[2]}`
}

function getOrCreateSubfolder(parentFolder, name) {
  const existing = parentFolder.getFoldersByName(name)
  if (existing.hasNext()) return existing.next()
  return parentFolder.createFolder(name)
}
