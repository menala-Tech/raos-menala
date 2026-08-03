// ============================================================
// 14_raos_credentials_sync.gs — Sync PIN + ID Staff KHUSUS RAOS/Rifim-OS
// ============================================================
//
// TUJUAN: RAOS PWA + Rifim-OS Portal punya kredensial login TERPISAH dari
// PIN + ID Staff existing di sheet SSOT (kolom H, E) — supaya rotasi/reset
// PIN untuk RAOS/Rifim-OS TIDAK mengganggu PWA lain (rifim-isi-saldo,
// radms-driver, dll) yang masih pakai kolom H, E existing via Supabase Auth
// password langsung.
//
// SUMBER: sheet SSOT "MASTER DATA STAFF" — kolom baru:
//   Kolom I (index 8) = "RAOS PIN"      — PIN yg user ketik di RAOS/Portal
//   Kolom J (index 9) = "RAOS ID Staff" — ID alternatif untuk login (opsional)
//
// TARGET: tabel `public.raos_credentials` di Supabase (migration raos_068).
//
// TRIGGER:
//   - Manual: menu 🛠️ RAOS System → 👥 Staff → 🔄 Sync RAOS Credentials (kolom I/J)
//   - Otomatis: cron tiap 1 jam (installTriggersRAOS akan install kalau belum)
//
// KETENTUAN:
//   - Kalau kolom I (RAOS PIN) kosong → SKIP baris (staff tsb TIDAK BISA login
//     RAOS/Portal sampai admin isi kolom I). Ini by design supaya opt-in.
//   - Kalau kolom J (RAOS ID) kosong → raos_staff_code = NULL, user cuma bisa
//     login pakai email (bukan ID pendek).
//   - Kolom H (SSOT PIN) di-mirror ke raos_credentials.ssot_pin — dipakai RPC
//     bridge saat sign-in ke Supabase Auth.

const RAOS_CRED_COL_PIN = 8   // Kolom I (0-based)
const RAOS_CRED_COL_ID  = 9   // Kolom J (0-based)

function syncRaosCredentials() {
  let inserted = 0, updated = 0, skipped = 0, errors = 0
  const warnings = []

  try {
    const sh = getMasterStaffSheet_()
    const rows = sh.getDataRange().getValues().slice(1) // skip header
    const now = new Date().toISOString()

    rows.forEach((row, i) => {
      const rowNum = i + 2
      const email     = String(row[0] || '').trim().toLowerCase()
      const ssotPin   = String(row[7] || '').trim() // kolom H
      const raosPin   = String(row[RAOS_CRED_COL_PIN] || '').trim()
      const raosCode  = String(row[RAOS_CRED_COL_ID]  || '').trim() || null

      if (!email) { skipped++; return }

      // Opt-in: kolom I kosong = staff tidak enable RAOS/Portal
      if (!raosPin) { skipped++; return }
      if (raosPin.length < 4) {
        warnings.push(`Baris ${rowNum} (${email}): RAOS PIN <4 karakter, dilewati`)
        skipped++
        return
      }

      try {
        // Lookup user_id via email → auth.users
        const authResult = callSupabase(
          'rpc/get_auth_user_id_by_email',
          'POST',
          { p_email: email }
        )
        const userId = Array.isArray(authResult) ? authResult[0] : authResult
        if (!userId) {
          warnings.push(`Baris ${rowNum} (${email}): auth user belum ada — jalankan syncStaffFromSSOT dulu`)
          skipped++
          return
        }

        // Upsert ke raos_credentials (on_conflict = user_id primary key)
        const upsertRes = callSupabase(
          'raos_credentials?on_conflict=user_id',
          'POST',
          {
            user_id: userId,
            raos_staff_code: raosCode,
            raos_pin: raosPin,
            ssot_pin: ssotPin || null,
            updated_at: now,
          },
          { Prefer: 'resolution=merge-duplicates,return=minimal' }
        )
        updated++
      } catch (e) {
        errors++
        warnings.push(`Baris ${rowNum} (${email}): ${e.message || e}`)
      }
    })

    const summary = `${updated} upsert, ${skipped} skip, ${errors} error, ${warnings.length} peringatan`
    logToSystem_('syncRaosCredentials', errors ? 'warning' : 'success', summary)
    warnings.slice(0, 30).forEach(w => logToSystem_('syncRaosCredentials', 'warning', w))

    return { updated, skipped, errors, warnings }
  } catch (e) {
    logToSystem_('syncRaosCredentials', 'error', e.message || String(e))
    throw e
  }
}

/**
 * Menu handler — tambah header kolom I & J di sheet SSOT kalau belum ada,
 * lalu jalankan sync.
 */
function menuSyncRaosCredentials() {
  const ui = SpreadsheetApp.getUi()
  try {
    const sh = getMasterStaffSheet_()
    // Pastikan header kolom I & J ada
    const headerRange = sh.getRange(1, RAOS_CRED_COL_PIN + 1, 1, 2)
    const [[h1, h2]] = headerRange.getValues()
    if (!h1 || !h2) {
      headerRange.setValues([['RAOS PIN', 'RAOS ID Staff']])
      headerRange.setFontWeight('bold').setBackground('#fff2cc')
    }
    const r = syncRaosCredentials()
    ui.alert(
      '✅ Sync RAOS Credentials Selesai',
      `• Upsert: ${r.updated}\n` +
      `• Dilewati: ${r.skipped}\n` +
      `• Error: ${r.errors}\n` +
      `• Peringatan: ${r.warnings.length}\n\n` +
      `Isi kolom I (RAOS PIN) untuk staff yg diperbolehkan login RAOS/Rifim-OS.\n` +
      `Kolom J (RAOS ID Staff) opsional — kalau diisi, user bisa login pakai ID pendek.\n\n` +
      `Cek sheet SYSTEM_LOG untuk detail.`,
      ui.ButtonSet.OK
    )
  } catch (e) {
    ui.alert('❌ Sync Gagal', String(e.message || e), ui.ButtonSet.OK)
  }
}
