// ============================================================
// 03_order.gs — Modul Order, Scan Barcode & Driver
// ============================================================

// Kolom sheet ORDER (0-based index):
// 0:SCAN ID  1:TANGGAL  2:JAM  3:DRIVER ID  4:NAMA DRIVER
// 5:TIPE  6:JUMLAH  7:GMV  8:INSENTIF  9:STATUS

// Kolom sheet DATABASE DRIVER (0-based index):
// 0:DRIVER ID  1:NAMA DRIVER  2:NO HP  3:TIPE KENDARAAN
// 4:PLAT NOMOR  5:BARCODE  6:CABANG  7:AKTIF

const BRANCH_MAP = {
  'T1': '343a729e-a48d-41d3-835d-d7c6337e209f',
  'T2': 'a32235ba-d444-41da-a3d9-06a8e947b593',
  'T3': 'ec3dcdbc-a398-482f-865a-04adfd22fee9',
}

const MOCK_DRIVERS = [
  ['MAX-T1-001', 'Ahmad Rizki',      '081212340001', 'Motor', 'B 1234 ABC', 'BAR-T1-001', 'T1', 'Ya'],
  ['MAX-T1-002', 'Budi Santoso',     '081212340002', 'Motor', 'B 5678 DEF', 'BAR-T1-002', 'T1', 'Ya'],
  ['MAX-T1-003', 'Cahyo Pratama',    '081212340003', 'Mobil', 'B 9012 GHI', 'BAR-T1-003', 'T1', 'Ya'],
  ['MAX-T1-004', 'Joko Purnomo',     '081212340004', 'Motor', 'B 8901 BCD', 'BAR-T1-004', 'T1', 'Ya'],
  ['MAX-T2-001', 'Dedi Kurniawan',   '081212340005', 'Motor', 'B 3456 JKL', 'BAR-T2-001', 'T2', 'Ya'],
  ['MAX-T2-002', 'Eko Widodo',       '081212340006', 'Motor', 'B 7890 MNO', 'BAR-T2-002', 'T2', 'Ya'],
  ['MAX-T2-003', 'Fajar Nugroho',    '081212340007', 'Mobil', 'B 2345 PQR', 'BAR-T2-003', 'T2', 'Ya'],
  ['MAX-T3-001', 'Gunawan Hadi',     '081212340008', 'Motor', 'B 6789 STU', 'BAR-T3-001', 'T3', 'Ya'],
  ['MAX-T3-002', 'Hendra Wijaya',    '081212340009', 'Motor', 'B 0123 VWX', 'BAR-T3-002', 'T3', 'Ya'],
  ['MAX-T3-003', 'Irwan Susanto',    '081212340010', 'Mobil', 'B 4567 YZA', 'BAR-T3-003', 'T3', 'Ya'],
]

function initMockDriverData() {
  const sh = getSheet(CONFIG.SHEETS.DB_DRIVER)
  sh.clearContents()

  const headers = ['DRIVER ID', 'NAMA DRIVER', 'NO HP', 'TIPE KENDARAAN', 'PLAT NOMOR', 'BARCODE', 'CABANG', 'AKTIF']
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#1a3a5c').setFontColor('#ffffff').setFontWeight('bold')
  sh.getRange(2, 1, MOCK_DRIVERS.length, headers.length).setValues(MOCK_DRIVERS)
  sh.autoResizeColumns(1, headers.length)

  SpreadsheetApp.getUi().alert(`✅ ${MOCK_DRIVERS.length} data driver mock berhasil diisi ke sheet DATABASE DRIVER.\n\nSelanjutnya: RAOS System → 🚗 Driver → Import Driver ke Supabase`)
}

function importDriverFromSheet() {
  const sh = getSheet(CONFIG.SHEETS.DB_DRIVER)
  const rows = sh.getDataRange().getValues().slice(1)
  if (!rows.length || !rows[0][0]) {
    SpreadsheetApp.getUi().alert('Sheet DATABASE DRIVER kosong. Jalankan "Isi Data Mock Driver" terlebih dahulu.')
    return
  }

  let inserted = 0, updated = 0, errors = 0

  rows.forEach((row, i) => {
    const [driverId, nama, phone, vehicleType, vehiclePlate, barcode, cabang, aktif] = row
    if (!driverId) return

    const branchId = BRANCH_MAP[cabang]
    if (!branchId) {
      logSistem('error', 'importDriverFromSheet', 'error', `Baris ${i + 2}: cabang "${cabang}" tidak dikenal`)
      errors++
      return
    }

    try {
      const existing = callSupabase(`raos_drivers?driver_id=eq.${encodeURIComponent(driverId)}&select=id`)
      const payload = {
        driver_id:     String(driverId),
        name:          nama,
        phone:         String(phone),
        vehicle_type:  vehicleType,
        vehicle_plate: vehiclePlate,
        barcode:       String(barcode),
        branch_id:     branchId,
        is_active:     aktif === 'Ya',
      }

      if (existing && existing.length > 0) {
        callSupabase(`raos_drivers?driver_id=eq.${encodeURIComponent(driverId)}`, 'PATCH', payload)
        updated++
      } else {
        callSupabase('raos_drivers', 'POST', payload)
        inserted++
      }
    } catch (e) {
      errors++
      logSistem('error', 'importDriverFromSheet', 'error', `Baris ${i + 2} (${driverId}): ${e.message}`)
    }
  })

  logSistem('import', 'importDriverFromSheet', 'success', `${inserted} baru, ${updated} update, ${errors} error`)
  SpreadsheetApp.getUi().alert(
    `✅ Import Driver Selesai\n\n• Baru: ${inserted}\n• Update: ${updated}\n• Error: ${errors}\n\nCek sheet LOG SISTEM untuk detail error.`
  )
}

function importOrderFromSupabase() {
  const data = callSupabase(
    'scan_orders?select=scan_id,scanned_at,status,gmv,incentive,' +
    'raos_drivers(driver_id,name,vehicle_type),user_profiles(full_name)' +
    '&order=scanned_at.desc&limit=500'
  )
  if (!data || !data.length) {
    logSistem('import', 'importOrderFromSupabase', 'warning', 'Tidak ada data order')
    return
  }

  const sh = getSheet(CONFIG.SHEETS.ORDER)

  // Buat header kalau belum ada
  if (sh.getLastRow() === 0) {
    const headers = ['SCAN ID', 'TANGGAL', 'JAM', 'DRIVER ID', 'NAMA DRIVER', 'TIPE', 'JUMLAH', 'GMV', 'INSENTIF', 'STATUS']
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#1a3a5c').setFontColor('#ffffff').setFontWeight('bold')
  }

  const existing = new Set(
    sh.getDataRange().getValues().slice(1).map(r => r[0]).filter(Boolean)
  )

  const newRows = data
    .filter(o => o.scan_id && !existing.has(o.scan_id))
    .map(o => [
      o.scan_id,
      formatDate(new Date(o.scanned_at)),
      new Date(o.scanned_at).toLocaleTimeString('id-ID'),
      o.raos_drivers?.driver_id ?? '',
      o.raos_drivers?.name ?? '',
      o.raos_drivers?.vehicle_type ?? '',
      1,
      o.gmv ?? 0,
      o.incentive ?? 0,
      o.status ?? 'pending',
    ])

  if (newRows.length) {
    const lastRow = sh.getLastRow() + 1
    sh.getRange(lastRow, 1, newRows.length, newRows[0].length).setValues(newRows)
    logSistem('import', 'importOrderFromSupabase', 'success', `${newRows.length} order baru diimport`)
  }
}

function hitungInsentif(jumlahOrder, gmv) {
  const cfg = getSistemConfig()
  const bonusPct = parseFloat(cfg['BONUS ORDER (%)'] ?? '2') / 100
  return gmv * bonusPct
}

function rekapOrderBulanan(staffId, bulan, tahun) {
  const sh = getSheet(CONFIG.SHEETS.ORDER)
  const rows = sh.getDataRange().getValues().slice(1)
  let totalOrder = 0, totalGmv = 0, totalInsentif = 0

  rows.forEach(row => {
    const tgl = new Date(row[1])
    if (row[3] !== staffId) return
    if (tgl.getMonth() + 1 !== bulan || tgl.getFullYear() !== tahun) return
    totalOrder += parseInt(row[6]) || 0
    totalGmv += parseFloat(row[7]) || 0
    totalInsentif += parseFloat(row[8]) || 0
  })

  return { staffId, bulan, tahun, totalOrder, totalGmv, totalInsentif }
}

function validasiOrder(scanId, koordinatorId, status) {
  try {
    callSupabase(
      `scan_orders?scan_id=eq.${encodeURIComponent(scanId)}`,
      'PATCH',
      {
        status,
        koordinator_id: koordinatorId,
        validated_at: new Date().toISOString(),
      }
    )
    logActivity(koordinatorId, 'validasi_order', `${scanId} → ${status}`)
    return true
  } catch (e) {
    return false
  }
}
