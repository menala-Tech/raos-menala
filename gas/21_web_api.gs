// ============================================================
// 21_web_api.gs — RAOS Web App API untuk Rifim OS Portal
// ============================================================
//
// Endpoint POST publik untuk trigger semua fungsi maintenance/sync RAOS
// dari Portal Rifim OS ("Admin Console"). Admin cukup buka Portal, klik
// tombol, RAOS jalan di background.
//
// AUTH: Portal kirim Supabase Auth JWT (access_token) di body.
//       RAOS verify via /auth/v1/user + cek role di user_profiles.
//       Hanya admin/direksi/management yang boleh trigger action.
//
// CORS: pakai Content-Type text/plain di request Portal untuk hindari
//       CORS preflight (GAS Web App tidak set CORS header untuk OPTIONS).
//
// SETELAH EDIT FILE INI: WAJIB redeploy Web App:
//   Terapkan → Kelola deployment → Edit (pensil) → Versi = Versi baru → Terapkan
//   URL /exec tidak berubah, tapi kode baru baru ke-serve setelah redeploy.

var _WEB_API_ALLOWED_ACTIONS = {
  'sync_staff':                { fn: 'syncStaffFromSSOT',              label: 'Sync Staff dari SSOT' },
  'sync_driver_airport':       { fn: 'syncDriverAirportFromSSOT',      label: 'Sync Driver Airport' },
  'sync_driver_external':      { fn: 'syncDriverExternalFromSSOT',     label: 'Sync Driver External' },
  'sync_raos_credentials':     { fn: 'syncRaosCredentials',            label: 'Sync RAOS Credentials (kolom I/J)' },
  'run_backup':                { fn: 'backupHarian',                   label: 'Backup Spreadsheet Harian' },
  'sync_selfie_drive':         { fn: 'syncSelfiePhotosToGDrive',       label: 'Sync Foto Selfie ke Drive' },
  'run_kpi':                   { fn: 'updateAllKpiRAOS',               label: 'Update KPI Bulan Ini' },
  'force_refresh_staff_auth':  { fn: 'forceRefreshStaffAuth',          label: 'Force Refresh Staff Auth Password' },
  'force_refresh_driver_auth': { fn: 'forceRefreshDriverAirportAuth',  label: 'Force Refresh Driver Airport Auth Password' },
};

function doGet(e) {
  return _webJson({
    ok: true,
    service: 'RAOS Web API',
    time: new Date().toISOString(),
    actions: Object.keys(_WEB_API_ALLOWED_ACTIONS),
    note: 'Kirim POST dengan {action, token} untuk trigger',
  });
}

function doPost(e) {
  // OUTER try/catch — pastikan SEMUA path return JSON. Kalau ada throw yg
  // lolos, GAS default handler serve HTML page (bikin client parse gagal).
  try {
    return _doPostImpl_(e);
  } catch (fatal) {
    return _webJson({
      ok: false, error: 'fatal_uncaught',
      detail: (fatal && fatal.message) || String(fatal),
      stack: (fatal && fatal.stack) ? String(fatal.stack).substring(0, 500) : null,
    });
  }
}

function _doPostImpl_(e) {
  var body = {};
  try {
    body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (parseErr) {
    return _webJson({ ok: false, error: 'invalid_json', detail: String(parseErr) });
  }

  var action = String(body.action || '').trim();
  var token = String(body.token || '').trim();

  if (action === 'ping') {
    return _webJson({ ok: true, action: 'ping', time: new Date().toISOString() });
  }

  if (!token) return _webJson({ ok: false, error: 'missing_token' });
  var caller;
  try {
    caller = _webVerifyCaller_(token);
  } catch (verifyErr) {
    return _webJson({ ok: false, error: 'verify_throw', detail: verifyErr.message || String(verifyErr) });
  }
  if (!caller.ok) return _webJson(caller);

  if (action === 'system_log_recent') {
    var limit = Math.min(parseInt(body.limit || 50, 10) || 50, 200);
    var since = body.since || null;
    var qs = 'select=type,process,status,detail,created_at&order=created_at.desc&limit=' + limit;
    if (since) qs += '&created_at=gte.' + encodeURIComponent(since);
    try {
      var rows = callSupabase('system_logs?' + qs);
      return _webJson({ ok: true, action: action, rows: rows || [], by: caller.email, role: caller.role });
    } catch (err) {
      return _webJson({ ok: false, action: action, error: err.message || String(err) });
    }
  }

  var spec = _WEB_API_ALLOWED_ACTIONS[action];
  if (!spec) return _webJson({ ok: false, error: 'unknown_action', action: action });

  var t0 = Date.now();
  try {
    var fn = globalThis[spec.fn] || this[spec.fn];
    if (typeof fn !== 'function') {
      return _webJson({ ok: false, action: action, error: 'function_not_found', fn: spec.fn });
    }
    var result = fn();
    var elapsed = Date.now() - t0;
    logSistem('api', 'web:' + action, 'success',
      'Triggered by ' + caller.email + ' (' + caller.role + ') in ' + elapsed + 'ms');
    return _webJson({
      ok: true, action: action, label: spec.label, elapsed_ms: elapsed,
      result: result, by: caller.email, role: caller.role,
    });
  } catch (err) {
    var msg = err.message || String(err);
    logSistem('api', 'web:' + action, 'error', 'By ' + caller.email + ': ' + msg);
    return _webJson({ ok: false, action: action, error: msg, by: caller.email });
  }
}

function _webVerifyCaller_(token) {
  // Verify Supabase Auth JWT
  var res = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/auth/v1/user', {
    method: 'GET',
    headers: {
      apikey: CONFIG.SUPABASE_KEY,
      Authorization: 'Bearer ' + token,
    },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    return { ok: false, error: 'invalid_token', http: res.getResponseCode() };
  }
  var user = JSON.parse(res.getContentText());
  if (!user || !user.id) return { ok: false, error: 'user_not_found' };

  // Check role via user_profiles
  var profs = callSupabase('user_profiles?id=eq.' + user.id + '&select=role,is_active,full_name');
  if (!profs || !profs[0]) return { ok: false, error: 'profile_not_found' };
  var p = profs[0];
  if (!p.is_active) return { ok: false, error: 'inactive' };
  var ROLE_ADMIN = ['admin', 'direksi', 'management'];
  if (ROLE_ADMIN.indexOf(p.role) < 0) {
    return { ok: false, error: 'role_denied', role: p.role };
  }
  return { ok: true, user_id: user.id, email: user.email, role: p.role, full_name: p.full_name };
}

function _webJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
