---
name: raos-supabase-rules
description: Aturan Supabase untuk RAOS + RIFIM OS (project shared vlievtojpmrbsmzlqswl) — vault secret sb_secret_* wajib (bukan JWT legacy), RLS SECURITY INVOKER default vs DEFINER dengan search_path explicit, RPC role gate hardcheck, Edge Function auth pattern userClient.auth.getUser(), publication realtime WAJIB ADD TABLE, tabel milik RAOS vs milik proyek lain (JANGAN sentuh drivers/employees/attendance/leave_*/payroll/users/saldo_events dari sesi RAOS — buat tabel baru berprefix raos_ alih-alih extend). Gunakan skill ini setiap kali menulis migration Supabase, RLS policy, RPC, Edge Function, vault, atau debug 401 invalid_token / Auth session missing / realtime tidak fire.
---

# Aturan Supabase — RIFIM OS + RAOS

Supabase project shared antara RIFIM OS dan RAOS. URL: `https://vlievtojpmrbsmzlqswl.supabase.co`, Project ID: `vlievtojpmrbsmzlqswl`.

## 1. Vault Secret — WAJIB `sb_secret_*`, JANGAN JWT Legacy

Supabase project sudah migrate ke new API keys system. Vault secret harus **Secret API key baru** format `sb_secret_...`:

- Lokasi UI: Dashboard → Project Settings → API Keys → tab "Publishable and secret API keys" → section Secret keys → `default`
- **JANGAN paste legacy service_role JWT** (format `eyJhbGci...`) — akan gagal 401 `invalid_token: missing sub claim` karena Edge Function `SUPABASE_SERVICE_ROLE_KEY` env sekarang di-rotate ke `sb_secret_*`

**Set via SQL editor** (direct UPDATE ke `vault.secrets` di-blok):
```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'raos_service_role_key'),
  'sb_secret_XXXXXXXXXX',
  'raos_service_role_key',
  'Secret API key untuk RPC raos_dispatch_push'
);
```

Vault dipakai oleh RPC `raos_dispatch_push` untuk trigger push notification dari DB trigger via `pg_net` HTTP.

## 2. RLS Policy — Default INVOKER, DEFINER Wajib search_path Explicit

**SECURITY INVOKER** (default) — untuk 99% policy. RLS enforce user context normal.

**SECURITY DEFINER** — hanya kalau butuh bypass (mis. helper cross-user). WAJIB set search_path explicit:

```sql
CREATE FUNCTION my_helper() RETURNS ... 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault  -- WAJIB
AS $$ ... $$;
```

Kalau tidak set search_path, fungsi rentan pada schema hijack + advisor akan warning `function_search_path_mutable`.

## 3. Helper `is_branch_in_scope(uuid)` — Scope Per Cabang

RAOS multi-cabang pakai helper `is_branch_in_scope(branch_id uuid)`:
- Admin/mgmt/direksi → bypass, lihat semua cabang
- Staff/koord → scoped ke branch sendiri + descendant/parent

Pakai di RLS policy tabel yang punya `branch_id`:
```sql
CREATE POLICY xxx_read ON raos_saldo_requests FOR SELECT
USING (is_branch_in_scope(branch_id));
```

## 4. RPC — SECURITY DEFINER dengan Role Gate Hardcheck

Untuk operasi sensitif (bulk update, destructive), pakai RPC SECURITY DEFINER + role gate **hardcheck di dalam RPC** (jangan hanya andalkan RLS caller):

```sql
CREATE FUNCTION raos_random_assign_drivers(p_branch_id uuid, p_force boolean)
RETURNS ... 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM user_profiles WHERE id = auth.uid();
  IF v_role NOT IN ('management','direksi') THEN
    RAISE EXCEPTION 'role_not_allowed: butuh management/direksi';
  END IF;
  -- ...business logic...
END $$;
```

**GRANT** hanya ke `authenticated`, REVOKE dari `anon` kecuali ada alasan (contoh: `email_is_registered_staff` sengaja bisa `anon` untuk validasi email pre-login).

## 5. Edge Function — Auth Pattern userClient.auth.getUser()

**BENAR:**
```ts
const authHeader = req.headers.get('Authorization') ?? ''
const userClient = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: authHeader } }
})
const { data: { user } } = await userClient.auth.getUser()  // tanpa argumen
```

**SALAH (bug "Auth session missing!"):**
```ts
const admin = createClient(SUPABASE_URL, SERVICE_KEY)
await admin.auth.getUser(token)  // BUG — jangan lakukan
```

Kalau butuh bypass role check di Edge Function (dipanggil dari system trigger), cek kalau caller pakai service_role → skip role guard.

## 6. Publication Realtime — WAJIB ADD TABLE

Publication `supabase_realtime` **awalnya kosong**. Tabel yang di-subscribe pakai `.on('postgres_changes', ...)` di client WAJIB di-add ke publication, atau event tidak akan fire.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.<nama_tabel>;
```

**Tabel yang sudah enabled (RAOS):**
- `chat_messages` (migration `raos_014`)
- `chat_message_reads` (raos_052)
- `raos_driver_queue` (raos_043)
- `raos_saldo_requests` (Fase 2)

Kalau tambah tabel baru yang perlu realtime, jangan lupa ADD TABLE.

## 7. Trigger prevent_ssot_staff_column_edit

Trigger `prevent_ssot_staff_column_edit` di `user_profiles` blok manual edit kolom `full_name/role/phone/staff_id` dari client kalau `source='ssot_master_staff'`. Service_role GAS di-bypass (untuk sync SSoT).

## 8. RPC Naming & Security Convention

| Prefix | Security | Contoh |
|---|---|---|
| `get_*` | INVOKER | `get_chat_rooms_for_user`, `get_my_role`, `get_my_branch` |
| `mark_*` | INVOKER | `mark_chat_room_read` |
| `set_*` | DEFINER (biasanya) | `set_chat_room_retention` — validasi member/scope internal |
| `raos_*` bulk | DEFINER + role gate | `raos_random_assign_drivers`, `raos_compute_payroll_month`, `raos_dispatch_push` |
| `email_is_registered_staff` | INVOKER, callable `anon` | pengecualian — untuk pre-login |

`get_my_role()` & `get_my_branch()` sudah `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO authenticated` (migration `raos_019`).

## 9. Tabel Ownership — RAOS vs Milik Proyek Lain

**Tabel milik RAOS (aman diextend):** `user_profiles`, `raos_drivers`, `raos_attendance`, `raos_chat_room_reads`, `raos_saldo_requests`, `raos_driver_queue`, `scan_orders`, `branches`, `pickup_points`, `shifts`, `kpi_targets`, `chat_rooms`, `chat_messages`, `chat_room_members`, `chat_message_attachments`, `chat_message_reactions`, `chat_polls`, `chat_poll_votes`, `activity_logs`, `system_logs`, `notifications`, `system_config`, `push_subscriptions`.

**Tabel MILIK PROYEK LAIN (JANGAN sentuh dari sesi RAOS/Rifim-OS):** `drivers`, `employees`, `employee_contracts`, `attendance` (bukan `raos_attendance`), `leave_requests`, `leave_balances`, `payroll`, `users` (bukan `user_profiles`), `saldo_events`.

**Rule:** kalau ragu, cek skema kolom dulu — kalau ada kolom gaya lain (mis. `employee_id` text bukan `staff_id` UUID), itu tanda tabel milik proyek lain. Buat tabel baru berprefix `raos_` alih-alih extend.

## 10. Migration Naming

Format: `raos_<3digit>_<snake_case_desc>.sql` (sequential per repo, bukan timestamp). Sequential berikutnya lihat `list_migrations`.

Rifim-OS pakai migration untuk shared table (`branches`, dll) tapi mostly konsumsi via endpoint GAS + RLS existing.

## 11. Migration Sensitif — Enable Leaked Password Protection

Pending: 1-klik di Auth Dashboard → Policies → Enable "Leaked Password Protection". Bukan migration, tapi hardening yang belum done.

---

## Referensi Silang

- **GAS side** dispatch push via RPC: lihat skill `rifim-os-gas-rules`
- **Push notification full stack:** lihat CLAUDE.md RAOS seksi "Push Notification (Web Push VAPID)"
- **Chat FK embed WAJIB eksplisit:** `user_profiles!chat_messages_sender_id_fkey(...)` — lihat CLAUDE.md RAOS seksi "PostgREST embed ambigu FK"
