// ============================================================
// 17_driver_external_sync.gs — Sync Driver Eksternal (Batam + Jambi Luar)
// ============================================================
// SSOT: Database Driver External → raos_drivers + auth.users + user_profiles.
// Driver External diprovision login PWA dengan pola yang sama seperti Driver Airport.

const DRIVER_EXTERNAL_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty('DRIVER_EXTERNAL_SHEET_ID')
  || '1suoDC-RsWOgTHiLq4max6iIsWe39Ou-RMddRXl5DVJc'

const DRIVER_EXTERNAL_TABS = [
  'ID Rifim Batam',
  'ID Rifim Jambi Luar',
]

function getDriverExternalSpreadsheet_() {
  return SpreadsheetApp.openById(DRIVER_EXTERNAL_SHEET_ID)
}

function _externalDedupeRows_(rows) {
  const map = {}, warnings = []
  rows.forEach(r => {
    if (!map[r.driver_id]) { map[r.driver_id] = r; return }
    const old = map[r.driver_id]
    // deterministic: first tab/row wins, but fill missing name only.
    if (!old.name && r.name) old.name = r.name
    warnings.push(`Duplicate external driver_id=${r.driver_id}: ${old.tab}#${old.row_num} vs ${r.tab}#${r.row_num}; first canonical row wins`)
  })
  return { rows: Object.keys(map).map(k => map[k]), warnings }
}
function _externalProfileBulkUpsert_(rows) {
  const ids = {}, staff = {}
  rows.forEach(r => {
    if (ids[r.id]) throw new Error('duplicate auth UUID in external profile payload: ' + r.id)
    if (staff[r.staff_id]) throw new Error('duplicate staff_id in external profile payload: ' + r.staff_id)
    ids[r.id] = true; staff[r.staff_id] = true
  })
  return _raosUserProfilesBulkUpsert_(rows)
}
function _externalDriverBulkUpsert_(rows) {
  const ids = {}
  rows.forEach(r => { if (ids[r.driver_id]) throw new Error('duplicate driver_id external payload: ' + r.driver_id); ids[r.driver_id] = true })
  return _raosDriverBulkUpsert_(rows)
}

function syncDriverExternalFromSSOT() {
  let upserted = 0, deactivated = 0, skipped = 0, errors = 0
  let authProvisionedNew = 0, authCached = 0, authFailed = 0
  const warnings = []
  const now = new Date().toISOString()

  try {
    const ss = getDriverExternalSpreadsheet_()
    const branchMap = kpiBranchMap_()
    const availableTabNames = ss.getSheets().map(s => s.getName())

    const existingAll = callSupabase(
      'raos_drivers?select=driver_id,source,branch_id&limit=10000'
    ) || []
    const existingMap = {}
    existingAll.forEach(d => { existingMap[d.driver_id] = d })

    const existingProfiles = callSupabase(
      'user_profiles?role=eq.driver&source=eq.ssot_driver_external&select=id,staff_id&limit=5000'
    ) || []
    const provisionedByDriverId = {}
    existingProfiles.forEach(p => {
      if (p.staff_id) provisionedByDriverId[String(p.staff_id)] = p.id
    })

    const rawPayload = []
    let seenDriverIds = []
    let newForAuthProvision = []

    DRIVER_EXTERNAL_TABS.forEach(tabName => {
      const sh = ss.getSheetByName(tabName)
      if (!sh) {
        warnings.push(`Tab "${tabName}" tidak ditemukan (tersedia: ${availableTabNames.join(', ')})`)
        return
      }
      const branchId = branchMap[tabName] || null
      if (!branchId) warnings.push(`Branch untuk slug "${tabName}" tidak ada di tabel branches`)

      sh.getDataRange().getValues().slice(1).forEach(row => {
        const driverId = String(row[1] || '').trim()
        const namaDriver = String(row[2] || '').trim()
        if (!driverId) return

        const existing = existingMap[driverId]
        if (existing && existing.source !== 'ssot_driver_external') {
          skipped++
          return
        }
        seenDriverIds.push(driverId)
        rawPayload.push({
          driver_id: driverId, name: namaDriver,
          branch_id: (existing && existing.branch_id) ? existing.branch_id : branchId,
          source: 'ssot_driver_external', driver_type: 'external', is_active: true, ssot_synced_at: now,
          tab: tabName, row_num: rawPayload.length + 2
        })

        if (!provisionedByDriverId[driverId] && driverId.length >= 6) {
          newForAuthProvision.push({ driver_id: driverId, name: namaDriver, branch_id: branchId })
        } else if (provisionedByDriverId[driverId]) {
          authCached++
        }
      })
    })

    const ded = _externalDedupeRows_(rawPayload)
    warnings.push.apply(warnings, ded.warnings)
    const payload = ded.rows.map(r => ({driver_id:r.driver_id,name:r.name,branch_id:r.branch_id,source:r.source,driver_type:r.driver_type,is_active:r.is_active,ssot_synced_at:r.ssot_synced_at}))
    seenDriverIds = ded.rows.map(r => r.driver_id)
    const needMap = {}
    newForAuthProvision = newForAuthProvision.filter(d => { if (needMap[d.driver_id]) return false; needMap[d.driver_id]=true; return seenDriverIds.indexOf(d.driver_id)>=0 })

    const CHUNK_SIZE = 500
    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE)
      try {
        _externalDriverBulkUpsert_(chunk)
        upserted += chunk.length
      } catch (e) {
        errors++
        logSistem('error', 'syncDriverExternalFromSSOT', 'error',
          `Bulk chunk ${i}-${i + chunk.length}: ${e.message}`)
      }
    }

    if (newForAuthProvision.length) {
      const provisionResult = _provisionExternalDriverUsers_(newForAuthProvision, now)
      authProvisionedNew += provisionResult.created
      authFailed += provisionResult.failed
      errors += provisionResult.failed
    }

    const staleIds = existingAll
      .filter(d => d.source === 'ssot_driver_external' && seenDriverIds.indexOf(d.driver_id) < 0)
      .map(d => d.driver_id)

    if (staleIds.length) {
      let deactCount = 0
      for (let i = 0; i < staleIds.length; i += 100) {
        const slice = staleIds.slice(i, i + 100)
        try {
          const inList = slice.map(id => encodeURIComponent(id)).join(',')
          callSupabase(
            'raos_drivers?driver_id=in.(' + inList + ')',
            'PATCH',
            { is_active: false, ssot_synced_at: now }
          )

          // Login PWA harus ikut dinonaktifkan ketika driver sudah tidak ada di SSOT.
          // user_profiles.staff_id menyimpan ID Driver untuk source ssot_driver_external.
          callSupabase(
            'user_profiles?source=eq.ssot_driver_external&staff_id=in.(' + inList + ')',
            'PATCH',
            { is_active: false, ssot_synced_at: now }
          )
          deactCount += slice.length
        } catch (e) {
          errors++
          warnings.push('Batch deactivate chunk ' + i + ': ' + e.message)
        }
      }
      deactivated = deactCount
    }

    warnings.forEach(w => logSistem('warning', 'syncDriverExternalFromSSOT', 'warning', w))
    const summary = `${upserted} upsert, ${deactivated} nonaktif, ${skipped} skip, ` +
      `${authProvisionedNew} auth baru, ${authCached} auth cached, ${authFailed} auth failed, ` +
      `${errors} error, ${warnings.length} peringatan`
    logSistem('sync', 'syncDriverExternalFromSSOT', errors ? 'warning' : 'success', summary)

    try { SpreadsheetApp.getUi().alert('✅ Sync Driver Eksternal Selesai\n\n' + summary) }
    catch (e) { /* trigger/webapp context */ }

    return { upserted, deactivated, skipped, authProvisionedNew, authCached, authFailed, errors, warnings }
  } catch (e) {
    logSistem('error', 'syncDriverExternalFromSSOT', 'error', e.message)
    throw e
  }
}

function _provisionExternalDriverUsers_(drivers, now) {
  let created = 0, failed = 0
  if (!drivers || !drivers.length) return { created, failed }

  const uuidMap = {}
  for (let i = 0; i < drivers.length; i += 100) {
    const ids = drivers.slice(i, i + 100).map(d => encodeURIComponent(d.driver_id)).join(',')
    const rows = callSupabase(`raos_drivers?driver_id=in.(${ids})&select=id,driver_id`) || []
    rows.forEach(r => { uuidMap[String(r.driver_id)] = r.id })
  }

  const requests = drivers.map(d => ({
    driver: d,
    request: {
      url: CONFIG.SUPABASE_URL + '/auth/v1/admin/users',
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
      },
      payload: JSON.stringify({
        email: d.driver_id + '@driver.rifim.local',
        password: d.driver_id,
        email_confirm: true,
        user_metadata: { full_name: d.name, driver_id_text: d.driver_id, role: 'driver' },
      }),
      muteHttpExceptions: true,
    },
  }))

  const profileBulk = []
  const BATCH = 50
  for (let i = 0; i < requests.length; i += BATCH) {
    const batch = requests.slice(i, i + BATCH)
    const responses = UrlFetchApp.fetchAll(batch.map(x => x.request))
    for (let j = 0; j < responses.length; j++) {
      const d = batch[j].driver
      const res = responses[j]
      const code = res.getResponseCode()
      let authId = null
      if (code >= 200 && code < 300) {
        try { authId = JSON.parse(res.getContentText()).id } catch (_) {}
      } else if (code === 422 || res.getContentText().indexOf('already') >= 0) {
        try {
          authId = callSupabase('rpc/get_auth_user_id_by_email', 'POST', {
            p_email: d.driver_id + '@driver.rifim.local',
          })
          if (Array.isArray(authId)) authId = authId[0]
        } catch (_) {}
      }

      const driverUuid = uuidMap[d.driver_id]
      if (!authId || !driverUuid) {
        failed++
        logSistem('error', 'syncDriverExternalFromSSOT', 'error',
          `Provision auth external ${d.driver_id}: HTTP ${code}`)
        continue
      }

      profileBulk.push({
        id: authId,
        staff_id: d.driver_id,
        full_name: d.name,
        role: 'driver',
        driver_id: driverUuid,
        branch_id: d.branch_id,
        source: 'ssot_driver_external',
        ssot_synced_at: now,
        is_active: true,
      })
      created++
    }
  }

  if (profileBulk.length) {
    for (let i = 0; i < profileBulk.length; i += 500) {
      _externalProfileBulkUpsert_(profileBulk.slice(i, i + 500))
    }
  }
  return { created, failed }
}

// Uses canonical _raosDriverBulkUpsert_ from 12_driver_airport_sync.gs.
