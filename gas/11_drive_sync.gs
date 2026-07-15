// ============================================================
// 11_drive_sync.gs — Sync Foto Absensi Selfie ke Google Drive
// ============================================================
// Foto selfie absensi diupload staff ke Supabase Storage (bucket 'selfies')
// dari aplikasi PWA. Script ini memindahkan salinannya ke folder Google
// Drive resmi RAOS, terorganisir per Pickup Point & Bulan, supaya mudah
// diaudit/diarsipkan manual tanpa perlu buka dashboard Supabase.
//
// Kenapa lewat GAS (bukan langsung dari PWA)? Karena GAS berjalan di akun
// Google yang sama pemilik folder Drive ini — tidak perlu simpan credential
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

  const rows = callSupabase(
    'raos_attendance?select=id,date,selfie_in_url,selfie_out_url,selfie_in_drive_synced,selfie_out_drive_synced,pickup_points(code)' +
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
      const folder = getMonthlyPickupPointFolder(row.pickup_points?.code, row.date)

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

  logSistem('sync', 'syncSelfiePhotosToGDrive', 'success', `${synced} foto disync, ${errors} error`)
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

/** Cari (atau buat kalau belum ada) folder [Pickup Point]/[Tahun-Bulan]. */
function getMonthlyPickupPointFolder(pickupPointCode, dateStr) {
  const root = DriveApp.getFolderById(CONFIG.DRIVE.ABSENSI_PHOTOS_ROOT_ID)
  const ppFolderName = mapPickupPointCodeToFolderName(pickupPointCode)
  const ppFolder = getOrCreateSubfolder(root, ppFolderName)

  const d = new Date(dateStr)
  const monthFolderName = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} ${MONTH_NAMES_ID[d.getMonth()]}`
  return getOrCreateSubfolder(ppFolder, monthFolderName)
}

/** "T1.PP2" → "T1 - Pickup Point 2". Fallback ke "Lainnya" kalau kode kosong/tak dikenal. */
function mapPickupPointCodeToFolderName(code) {
  if (!code) return 'Lainnya'
  const match = code.match(/^(T\d)\.PP(\d)$/)
  if (!match) return 'Lainnya'
  return `${match[1]} - Pickup Point ${match[2]}`
}

function getOrCreateSubfolder(parentFolder, name) {
  const existing = parentFolder.getFoldersByName(name)
  if (existing.hasNext()) return existing.next()
  return parentFolder.createFolder(name)
}
