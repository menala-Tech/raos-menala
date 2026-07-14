// ============================================================
// 03_order.gs — Modul Order & Scan Barcode
// ============================================================

function importOrderFromSupabase() {
  const data = callSupabase(
    'scan_orders?select=*,drivers(*),user_profiles(full_name)&order=scanned_at.desc&limit=500'
  )
  if (!data || !data.length) {
    logSistem('import', 'importOrderFromSupabase', 'warning', 'Tidak ada data order baru')
    return
  }

  const sh = getSheet(CONFIG.SHEETS.ORDER)
  const existing = new Set(
    sh.getDataRange().getValues().slice(1).map(r => r[0]).filter(Boolean)
  )

  const newRows = data
    .filter(o => !existing.has(o.scan_id))
    .map(o => [
      o.scan_id,
      formatDate(new Date(o.scanned_at)),
      new Date(o.scanned_at).toLocaleTimeString('id-ID'),
      o.drivers?.driver_id ?? '',
      o.drivers?.name ?? '',
      '',  // cabang
      1,   // jumlah order
      o.gmv ?? 0,
      o.incentive ?? 0,
      o.status,
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
