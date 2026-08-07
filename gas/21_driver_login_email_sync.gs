// ============================================================
// 21_driver_login_email_sync.gs — SSoT email login Driver
// ============================================================
//
// Login PWA Driver = ID Driver + Email Driver.
// Email tetap SSoT-managed: admin menambah kolom "Email Driver" pada
// tab driver airport/external, lalu fungsi ini sync 1-arah ke
// public.raos_drivers.login_email.
//
// Fungsi sengaja TIDAK auto-claim email dari form login.

const DRIVER_LOGIN_EMAIL_HEADERS = [
  'Email Driver', 'Email', 'Email HP Driver', 'Email HP',
]

function _driverLoginNormalizeHeader_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function _driverLoginFindColumn_(headers, candidates, fallback) {
  const normalized = headers.map(_driverLoginNormalizeHeader_)
  for (let i = 0; i < candidates.length; i++) {
    const idx = normalized.indexOf(_driverLoginNormalizeHeader_(candidates[i]))
    if (idx >= 0) return idx
  }
  return fallback
}

function _driverLoginCollectFromSheet_(ss, tabNames, sourceLabel) {
  const rows = []
  const warnings = []

  tabNames.forEach(tabName => {
    const sh = ss.getSheetByName(tabName)
    if (!sh) {
      warnings.push(`${sourceLabel}: tab "${tabName}" tidak ditemukan`)
      return
    }

    const values = sh.getDataRange().getValues()
    if (values.length < 2) return

    const headers = values[0] || []
    const driverIdCol = _driverLoginFindColumn_(headers, ['ID Driver', 'Driver ID', 'ID Login Driver'], 1)
    const emailCol = _driverLoginFindColumn_(headers, DRIVER_LOGIN_EMAIL_HEADERS, -1)

    if (emailCol < 0) {
      warnings.push(`${sourceLabel}/${tabName}: kolom "Email Driver" belum ada`)
      return
    }

    values.slice(1).forEach((row, index) => {
      const driverId = String(row[driverIdCol] || '').trim()
      const email = String(row[emailCol] || '').trim().toLowerCase()
      if (!driverId || !email) return

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        warnings.push(`${sourceLabel}/${tabName} baris ${index + 2}: email invalid untuk ID ${driverId}`)
        return
      }

      rows.push({ driverId, email, tabName, rowNum: index + 2 })
    })
  })

  return { rows, warnings }
}

/**
 * Sync manual Email Driver dari kedua Spreadsheet SSoT ke raos_drivers.
 * Aman dijalankan ulang; hanya row yang memiliki Email Driver yang di-update.
 */
function syncDriverLoginEmailsFromSSOT() {
  const now = new Date().toISOString()
  const airport = _driverLoginCollectFromSheet_(
    getDriverAirportSpreadsheet_(),
    DRIVER_AIRPORT_TABS,
    'airport'
  )
  const external = _driverLoginCollectFromSheet_(
    getDriverExternalSpreadsheet_(),
    DRIVER_EXTERNAL_TABS,
    'external'
  )

  const warnings = airport.warnings.concat(external.warnings)
  const combined = airport.rows.concat(external.rows)
  const byDriver = {}
  const emailOwner = {}

  combined.forEach(item => {
    const emailKey = item.email.toLowerCase()
    if (byDriver[item.driverId] && byDriver[item.driverId].email !== item.email) {
      warnings.push(`ID ${item.driverId}: email berbeda di lebih dari satu row — pakai row terakhir`)
    }
    if (emailOwner[emailKey] && emailOwner[emailKey] !== item.driverId) {
      warnings.push(`Email ${item.email}: dipakai ID ${emailOwner[emailKey]} dan ${item.driverId} — skip ID ${item.driverId}`)
      return
    }
    emailOwner[emailKey] = item.driverId
    byDriver[item.driverId] = item
  })

  const items = Object.keys(byDriver).map(id => byDriver[id])
  let updated = 0
  let errors = 0
  const BATCH = 50

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)
    const requests = batch.map(item => ({
      url: CONFIG.SUPABASE_URL + '/rest/v1/raos_drivers?driver_id=eq.' + encodeURIComponent(item.driverId),
      method: 'patch',
      contentType: 'application/json',
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
        Prefer: 'return=minimal',
      },
      payload: JSON.stringify({
        login_email: item.email,
        ssot_synced_at: now,
        updated_at: now,
      }),
      muteHttpExceptions: true,
    }))

    const responses = UrlFetchApp.fetchAll(requests)
    responses.forEach((res, idx) => {
      const code = res.getResponseCode()
      if (code >= 200 && code < 300) {
        updated++
      } else {
        errors++
        const item = batch[idx]
        warnings.push(`ID ${item.driverId}: HTTP ${code} ${res.getContentText().substring(0, 160)}`)
      }
    })
  }

  warnings.forEach(w => logSistem('warning', 'syncDriverLoginEmailsFromSSOT', 'warning', w))
  const summary = `${updated} email driver sync, ${errors} error, ${warnings.length} warning`
  logSistem('sync', 'syncDriverLoginEmailsFromSSOT', errors ? 'warning' : 'success', summary)

  try {
    SpreadsheetApp.getUi().alert(
      '✅ Sync Email Login Driver Selesai\n\n' + summary +
      '\n\nKolom yang dibaca: Email Driver (atau Email/Email HP Driver).'
    )
  } catch (_) { /* trigger/webapp context */ }

  return { updated, errors, warnings }
}
