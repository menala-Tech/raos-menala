// ============================================================
// 24_soeta_staff_ssot_sync.gs
// Canonical SOETA staff source: Google Sheet "Database Staff Soeta"
// Sheet ID: 13aVdbdeS0UOZ1pnfu3J-bJ99oLn4ugdYwFPd9tbg_dQ
// Tabs: Soeta (master), T1/T2/T3 (terminal assignment)
//
// IMPORTANT:
// - exact identity = ID Staff
// - no Auth creation
// - no auto activation/deactivation
// - no operational delete
// - terminal assignment is derived only from T1/T2/T3 membership
// ============================================================

const SOETA_STAFF_SSOT_SHEET_ID = PropertiesService.getScriptProperties().getProperty('SOETA_STAFF_SSOT_SHEET_ID') || '13aVdbdeS0UOZ1pnfu3J-bJ99oLn4ugdYwFPd9tbg_dQ';
const SOETA_STAFF_SSOT_MASTER_TAB = 'Soeta';
const SOETA_STAFF_SSOT_TERMINALS = ['T1', 'T2', 'T3'];

function _soetaSsotNormHeader_(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function _soetaSsotFindCol_(headers, names) {
  const h = headers.map(_soetaSsotNormHeader_);
  for (let i = 0; i < names.length; i++) {
    const idx = h.indexOf(_soetaSsotNormHeader_(names[i]));
    if (idx >= 0) return idx;
  }
  return -1;
}

function _soetaSsotOpen_() {
  const ss = SpreadsheetApp.openById(SOETA_STAFF_SSOT_SHEET_ID);
  const master = ss.getSheetByName(SOETA_STAFF_SSOT_MASTER_TAB);
  if (!master) throw new Error('Tab Soeta tidak ditemukan pada SSOT Database Staff Soeta');
  SOETA_STAFF_SSOT_TERMINALS.forEach(function (t) {
    if (!ss.getSheetByName(t)) throw new Error('Tab ' + t + ' tidak ditemukan pada SSOT Database Staff Soeta');
  });
  return ss;
}

function _soetaSsotRole_(jabatan) {
  const mapped = typeof mapJabatanToRole_ === 'function' ? mapJabatanToRole_(jabatan) : null;
  if (mapped) return mapped;
  const s = String(jabatan || '').trim().toUpperCase();
  if (s.indexOf('KOORD') >= 0) return 'koordinator';
  if (s.indexOf('ADMIN') >= 0) return 'admin';
  if (s.indexOf('DIREKSI') >= 0) return 'direksi';
  if (s.indexOf('MANAGEMENT') >= 0) return 'management';
  if (s.indexOf('DRIVER MANAGER') >= 0 || s.indexOf('DRIVER MGR') >= 0) return 'driver_manager';
  if (s.indexOf('DRIVER') >= 0) return 'driver';
  if (s.indexOf('STAFF') >= 0 || s.indexOf('PICKUP') >= 0) return 'staff';
  return null;
}

function _soetaSsotMoney_(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return isFinite(raw) && raw >= 0 ? raw : null;
  const n = Number(String(raw).replace(/rp/ig, '').replace(/[.\s]/g, '').replace(',', '.'));
  return isFinite(n) && n >= 0 ? n : null;
}

function _soetaSsotTerminalMap_(ss) {
  const map = {};
  SOETA_STAFF_SSOT_TERMINALS.forEach(function (terminal) {
    const sh = ss.getSheetByName(terminal);
    const values = sh.getDataRange().getValues();
    if (!values.length) return;
    const idCol = _soetaSsotFindCol_(values[0], ['ID Staff', 'Staff ID']);
    if (idCol < 0) throw new Error('Kolom ID Staff tidak ditemukan pada tab ' + terminal);

    for (let i = 1; i < values.length; i++) {
      const id = String(values[i][idCol] || '').trim().toUpperCase();
      if (!id) continue;
      if (map[id] && map[id] !== terminal) {
        throw new Error('ID Staff ' + id + ' terdaftar di dua terminal: ' + map[id] + ' dan ' + terminal);
      }
      map[id] = terminal;
    }
  });
  return map;
}

function _soetaSsotBuildPayload_(ss) {
  const sh = ss.getSheetByName(SOETA_STAFF_SSOT_MASTER_TAB);
  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) throw new Error('Tab Soeta kosong');

  const h = values[0];
  const c = {
    email: _soetaSsotFindCol_(h, ['Email']),
    nama: _soetaSsotFindCol_(h, ['Nama', 'Nama Lengkap']),
    gaji: _soetaSsotFindCol_(h, ['Gaji Staff', 'Gaji']),
    staffId: _soetaSsotFindCol_(h, ['ID Staff', 'Staff ID']),
    jabatan: _soetaSsotFindCol_(h, ['Jabatan', 'Role']),
    phone: _soetaSsotFindCol_(h, ['No WA Staff', 'No  WA Staff', 'No WA', 'Phone'])
  };

  if (c.nama < 0 || c.staffId < 0 || c.jabatan < 0) {
    throw new Error('Header wajib Nama, ID Staff, dan Jabatan tidak lengkap pada tab Soeta');
  }

  const terminalMap = _soetaSsotTerminalMap_(ss);
  const seen = {};
  const records = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowNum = i + 1;
    const staffId = String(row[c.staffId] || '').trim().toUpperCase();
    const fullName = String(row[c.nama] || '').trim();

    // Blank template rows are ignored safely.
    if (!staffId && !fullName) continue;
    if (!staffId || !fullName) throw new Error('Baris ' + rowNum + ': Nama dan ID Staff wajib terisi bersamaan');
    if (seen[staffId]) throw new Error('Duplicate ID Staff ' + staffId + ' pada baris ' + seen[staffId] + ' dan ' + rowNum);
    seen[staffId] = rowNum;

    const jabatan = String(row[c.jabatan] || '').trim();
    const role = _soetaSsotRole_(jabatan);
    if (!role) throw new Error('Baris ' + rowNum + ' (' + staffId + '): Jabatan tidak dapat dipetakan ke role');

    let email = null;
    if (c.email >= 0) {
      const raw = String(row[c.email] || '').trim().toLowerCase();
      if (raw) {
        if (typeof isValidEmail === 'function' && !isValidEmail(raw)) throw new Error('Baris ' + rowNum + ' (' + staffId + '): email tidak valid');
        email = raw;
      }
    }

    const phoneRaw = c.phone >= 0 ? String(row[c.phone] || '').trim() : '';
    records.push({
      staff_id: staffId,
      full_name: fullName,
      email: email,
      phone: phoneRaw ? phoneRaw.replace(/\D/g, '') : null,
      role: role,
      jabatan: jabatan || null,
      gaji_staff: c.gaji >= 0 ? _soetaSsotMoney_(row[c.gaji]) : null,
      terminal: terminalMap[staffId] || null,
      source_row: rowNum
    });
  }

  Object.keys(terminalMap).forEach(function (id) {
    if (!seen[id]) throw new Error('ID Staff ' + id + ' ada di tab ' + terminalMap[id] + ' tetapi tidak ada pada tab Soeta');
  });

  return records;
}

function _soetaSsotRevision_(ss) {
  try {
    return DriveApp.getFileById(ss.getId()).getLastUpdated().toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

function syncSoetaStaffDatabaseSsot_(apply) {
  const ss = _soetaSsotOpen_();
  const records = _soetaSsotBuildPayload_(ss);
  const revision = _soetaSsotRevision_(ss);
  return callSupabase('rpc/raos_soeta_staff_sheet_sync', 'POST', {
    p_records: records,
    p_sheet_id: ss.getId(),
    p_revision: revision,
    p_source_updated_at: revision,
    p_apply: !!apply
  });
}

function syncSoetaStaffDatabaseSsot_MENU() {
  const ui = SpreadsheetApp.getUi();
  try {
    const dry = syncSoetaStaffDatabaseSsot_(false);
    const msg = [
      'Database Staff Soeta -> Supabase',
      '',
      'Rows SSOT           : ' + (dry.incomingCount || 0),
      'Assigned T1/T2/T3   : ' + (dry.terminalAssignedCount || 0),
      'Master baru         : ' + (dry.masterInsertableCount || 0),
      'HRIS di luar SSOT   : ' + (dry.hrisNotInSheetCount || 0),
      'Master di luar SSOT : ' + (dry.masterNotInSheetCount || 0),
      'Aktif belum terminal: ' + (dry.activatedUnassignedCount || 0),
      '',
      'Sync ini TIDAK membuat Auth, TIDAK mengaktifkan staff, dan TIDAK menghapus data operasional.',
      '',
      'Lanjutkan apply mirror?'
    ].join('\n');

    const choice = ui.alert('Preview Sync Staff SOETA SSOT', msg, ui.ButtonSet.YES_NO);
    if (choice !== ui.Button.YES) return;

    const applied = syncSoetaStaffDatabaseSsot_(true);
    ui.alert('✅ Sync Staff SOETA selesai\n\n' +
      'Mirror rows     : ' + (applied.incomingCount || 0) + '\n' +
      'Master upsert   : ' + (applied.masterUpsertedCount || 0) + '\n' +
      'Profile updated : ' + (applied.profilesUpdatedCount || 0) + '\n' +
      'HRIS di luar SSOT: ' + (applied.hrisNotInSheetCount || 0) + '\n\n' +
      'Auth/activation tetap harus dilakukan terpisah oleh Admin.');
  } catch (e) {
    ui.alert('❌ Sync Staff SOETA gagal:\n' + e.message);
    throw e;
  }
}
