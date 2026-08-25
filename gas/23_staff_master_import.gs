// ============================================================
// 23_staff_master_import.gs — Import staff master (XLSX → Google Sheet)
//
// Flow:
//   1. User uploads staff master XLSX to Google Drive and converts it to
//      Google Sheets (File → Save as Google Sheets), or replaces a bound sheet
//      named 'DATABASE STAFF'.
//   2. Set Script Property STAFF_MASTER_SHEET_ID, or use the active-bound
//      sheet named 'DATABASE STAFF'.
//   3. Run 🛠️ RAOS System → 👥 Staff → 📥 Import Staff Master.
//   4. Rows are normalized and upserted to public.raos_staff_master via
//      RPC raos_staff_master_upsert_bulk.
//
// Required columns (order flexible):
//   - ID Staff / Employee ID / ID Karyawan
//   - Nama / Full Name / Name
//   - Email (boleh kosong)
//   - No WA / Phone / Telepon
//   - Jabatan / Role (STAFF, KOORDINATOR, ADMIN, etc.)
//   - Airport / Bandara (kode atau nama, contoh: SOETA)
//   - Terminal (T1, T2, T3, atau "Terminal 1" dll)
//   - Status Aktif / Status (Aktif, Nonaktif, Pending)
//
// No fake email is generated. Rows without email become master data only.
// airport_id dan branch_id di-resolve otomatis via Supabase trigger.
// ============================================================

const STAFF_MASTER_SHEET_ID = PropertiesService.getScriptProperties().getProperty('STAFF_MASTER_SHEET_ID');
const STAFF_MASTER_TAB_NAME = 'DATABASE STAFF';

function _normalizeMasterHeader_(v) {
  return String(v || '').trim().toLowerCase().replace(/[\s_]+/g, ' ').replace(/[^a-z0-9 ]/g, '');
}

function _findMasterColumn_(h, names) {
  const a = h.map(_normalizeMasterHeader_);
  for (var i = 0; i < names.length; i++) {
    const x = a.indexOf(_normalizeMasterHeader_(names[i]));
    if (x >= 0) return x;
  }
  return -1;
}

function _getMasterColumns_(h) {
  return {
    staffId:   _findMasterColumn_(h, ['id staff', 'employee id', 'id karyawan', 'id karyawan staff']),
    fullName:  _findMasterColumn_(h, ['nama', 'full name', 'name', 'nama lengkap']),
    email:     _findMasterColumn_(h, ['email', 'e mail', 'surel']),
    phone:     _findMasterColumn_(h, ['no wa', 'phone', 'telepon', 'no telepon', 'no hp', 'handphone', 'wa']),
    role:      _findMasterColumn_(h, ['jabatan', 'role', 'posisi']),
    airport:   _findMasterColumn_(h, ['airport', 'bandara']),
    terminal:  _findMasterColumn_(h, ['terminal', 'term']),
    status:    _findMasterColumn_(h, ['status aktif', 'status', 'aktif'])
  };
}

function _parseMasterTerminal_(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'T1' || s === 'TERMINAL 1' || s === 'T 1') return 'T1';
  if (s === 'T2' || s === 'TERMINAL 2' || s === 'T 2') return 'T2';
  if (s === 'T3' || s === 'TERMINAL 3' || s === 'T 3') return 'T3';
  return s;
}

function _parseMasterAirport_(raw) {
  // Return the raw airport string; Supabase trigger resolves airport_id from branches.
  // No hardcoded default; each airport must be configured as a branch hub.
  const s = String(raw || '').trim();
  return s || null;
}

function _parseMasterStatus_(raw) {
  if (raw === true || raw === 1) return 'Aktif';
  if (raw === false || raw === 0) return 'Nonaktif';
  if (raw === null || raw === undefined || raw === '') return 'Pending';
  const s = String(raw).trim();
  if (/^AKTIF|^ACTIVE|^YES|^YA|^1$/i.test(s)) return 'Aktif';
  if (/^NONAKTIF|^NON|^INACTIVE|^NO|^TIDAK|^0$/i.test(s)) return 'Nonaktif';
  if (/^PENDING|^MENUNGGU/i.test(s)) return 'Pending';
  return 'Aktif';
}

function _mapMasterRole_(raw) {
  const r = mapJabatanToRole_(raw);
  if (r) return r;
  const s = String(raw || '').trim().toLowerCase();
  if (s.indexOf('koord') >= 0) return 'koordinator';
  if (s.indexOf('admin') >= 0) return 'admin';
  if (s.indexOf('direksi') >= 0) return 'direksi';
  if (s.indexOf('management') >= 0) return 'management';
  if (s.indexOf('driver manager') >= 0 || s.indexOf('driver mgr') >= 0) return 'driver_manager';
  if (s.indexOf('driver') >= 0) return 'driver';
  if (s.indexOf('staff') >= 0) return 'staff';
  return 'staff';
}

function _getMasterSheet_() {
  if (STAFF_MASTER_SHEET_ID) {
    try {
      return SpreadsheetApp.openById(STAFF_MASTER_SHEET_ID).getSheetByName(STAFF_MASTER_TAB_NAME);
    } catch (e) {
      throw new Error('STAFF_MASTER_SHEET_ID tidak valid atau tidak punya tab ' + STAFF_MASTER_TAB_NAME + ': ' + e.message);
    }
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss ? ss.getSheetByName(STAFF_MASTER_TAB_NAME) : null;
  if (!sh) {
    throw new Error('Set Script Property STAFF_MASTER_SHEET_ID atau buka spreadsheet yang berisi tab "DATABASE STAFF"');
  }
  return sh;
}

/**
 * Import staff master from XLSX-backed Google Sheet.
 * Returns summary { imported, skipped, warnings }.
 */
function importStaffMasterFromXlsx() {
  const t0 = Date.now();
  const warnings = [];
  let imported = 0;
  let skipped = 0;

  try {
    const sh = _getMasterSheet_();
    const values = sh.getDataRange().getValues();
    if (!values || values.length < 2) {
      throw new Error('Sheet DATABASE STAFF kosong atau tidak ada header');
    }

    const cols = _getMasterColumns_(values[0]);
    if (cols.staffId < 0 || cols.fullName < 0) {
      throw new Error('Kolom wajib ID Staff dan Nama tidak ditemukan di header');
    }

    const payload = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rowNum = i + 1;
      const staffId = String(row[cols.staffId] || '').trim().toUpperCase();
      const fullName = String(row[cols.fullName] || '').trim();

      if (!staffId || !fullName) {
        warnings.push('Baris ' + rowNum + ': ID Staff / Nama kosong — skip');
        skipped++;
        continue;
      }

      let email = null;
      if (cols.email >= 0) {
        const rawEmail = String(row[cols.email] || '').trim().toLowerCase();
        email = isValidEmail(rawEmail) ? rawEmail : null;
        if (rawEmail && !email) {
          warnings.push('Baris ' + rowNum + ' (' + staffId + '): email tidak valid (' + rawEmail + ') — diset null');
        }
      }

      const phone = cols.phone >= 0 ? String(row[cols.phone] || '').trim() || null : null;
      const role = cols.role >= 0 ? _mapMasterRole_(row[cols.role]) : 'staff';
      const airport = cols.airport >= 0 ? _parseMasterAirport_(row[cols.airport]) : null;
      const terminal = cols.terminal >= 0 ? _parseMasterTerminal_(row[cols.terminal]) : null;
      const status = cols.status >= 0 ? _parseMasterStatus_(row[cols.status]) : 'Aktif';

      payload.push({
        staff_id: staffId,
        full_name: fullName,
        email: email,
        phone: phone ? phone.replace(/\D/g, '') : null,
        role: role,
        airport: airport,
        terminal: terminal,
        status: status,
        source: 'xlsx_import'
      });
    }

    if (payload.length) {
      const chunkSize = 400;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const ch = payload.slice(i, i + chunkSize);
        try {
          const res = callSupabase('rpc/raos_staff_master_upsert_bulk', 'POST', { p_records: ch });
          imported += Number(res) || ch.length;
        } catch (e) {
          warnings.push('Chunk ' + i + ' gagal: ' + e.message);
          skipped += ch.length;
        }
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const summary = 'imported=' + imported + ' skipped=' + skipped + ' warnings=' + warnings.length + ' elapsed=' + elapsed + 's';
    logSistem('import', 'importStaffMasterFromXlsx', warnings.length ? 'warning' : 'success', summary);

    return {
      imported: imported,
      skipped: skipped,
      warnings: warnings.slice(0, 20),
      warningCount: warnings.length,
      elapsed_s: Number(elapsed)
    };
  } catch (e) {
    logSistem('error', 'importStaffMasterFromXlsx', 'error', e.message);
    throw e;
  }
}

/**
 * Wrapper menu dengan alert.
 */
function importStaffMasterFromXlsx_MENU() {
  try {
    const r = importStaffMasterFromXlsx();
    const w = r.warnings.length ? '\n\nPeringatan:\n' + r.warnings.slice(0, 5).join('\n') + (r.warnings.length > 5 ? '\n...' : '') : '';
    SpreadsheetApp.getUi().alert('✅ Import Staff Master selesai\n\n' +
      'Imported : ' + r.imported + '\n' +
      'Skipped  : ' + r.skipped + '\n' +
      'Warnings : ' + r.warningCount + '\n' +
      'Elapsed  : ' + r.elapsed_s + 's' + w);
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Import Staff Master gagal:\n' + e.message);
    throw e;
  }
}

/**
 * Set / update email for a pre-activation master record.
 * Called manually from script editor or a future UI.
 */
function setStaffMasterEmail_MENU() {
  const ui = SpreadsheetApp.getUi();
  const staffId = ui.prompt('ID Staff').getResponseText().trim().toUpperCase();
  if (!staffId) throw new Error('ID Staff wajib diisi');
  const email = ui.prompt('Email baru (kosongkan bila belum ada)').getResponseText().trim().toLowerCase();

  try {
    const payload = isValidEmail(email) ? { p_staff_id: staffId, p_email: email } : { p_staff_id: staffId, p_email: null };
    callSupabase('rpc/raos_staff_master_set_email', 'POST', payload);
    ui.alert('✅ Email untuk ' + staffId + ' berhasil disimpan. Selanjutnya admin buat Auth user di Supabase, lalu link dengan raos_staff_master_link_auth.');
  } catch (e) {
    ui.alert('❌ Gagal: ' + e.message);
    throw e;
  }
}

/**
 * Link an existing Supabase auth user to a master record and create user_profiles.
 */
function linkStaffMasterAuth_MENU() {
  const ui = SpreadsheetApp.getUi();
  const staffId = ui.prompt('ID Staff').getResponseText().trim().toUpperCase();
  if (!staffId) throw new Error('ID Staff wajib diisi');
  const authId = ui.prompt('Auth User ID (UUID dari Supabase Auth)').getResponseText().trim();
  if (!UUID_REGEX.test(authId)) throw new Error('Auth User ID harus UUID');

  try {
    callSupabase('rpc/raos_staff_master_link_auth', 'POST', { p_staff_id: staffId, p_auth_user_id: authId });
    ui.alert('✅ Staff ' + staffId + ' berhasil diaktivasi dan user_profiles dibuat.');
  } catch (e) {
    ui.alert('❌ Gagal link auth: ' + e.message);
    throw e;
  }
}
