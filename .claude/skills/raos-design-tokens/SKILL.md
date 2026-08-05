---
name: raos-design-tokens
description: Design tokens & konvensi UI untuk RAOS — global color tokens (--primary, --secondary, --success, --warning, --error, --info, --dark-*, --light-*), RIFIM Chat Dark theme (--chat-bg, --chat-accent kuning Maxim, --chat-bubble-user, --chat-online, --chat-danger, --chat-surface), Poppins font hierarchy, queue format A-023 (BUKAN A001), kode cabang UPPERCASE 3 huruf, work mode enum UPPERCASE. Wajib gunakan skill ini setiap kali menulis CSS/Tailwind class di apps/pwa/src/components/ atau app/, form/tabel/badge/status, chat UI, styling komponen — bahkan kalau user hanya sebut "warna tombol", "styling card", "badge status", "chip".
---

# Design Tokens & Konvensi UI — RIFIM OS + RAOS

## 🚫 Aturan Emas: JANGAN Hardcode Hex

Semua warna, font, dan ukuran HARUS pakai **CSS variable** dari design system. Jangan pernah hardcode hex color langsung di HTML/CSS/JSX.

**Salah:** `style="background: #1E88E5"` atau `className="bg-[#1E88E5]"`
**Benar:** `style="background: var(--primary)"` atau `className="bg-[var(--primary)]"`

Kalau code review temukan hardcode hex → STOP, ganti ke token.

---

## 1. Global Color Tokens (Semua Modul KECUALI Chat)

| Token | Hex | Penggunaan |
|-------|-----|-----------|
| `--primary` | `#1E88E5` | Tombol utama, link, header modul, active tab |
| `--secondary` | `#FFC107` | Aksen, badge, highlight |
| `--success` | `#43A047` | Status sukses, saldo positif, tercapai |
| `--warning` | `#FB8C00` | Peringatan, threshold, pending |
| `--error` | `#E53935` | Error, saldo negatif, delete, ditolak |
| `--info` | `#00ACC1` | Informasi, tips, hint |
| `--dark-900` | `#111827` | Background gelap (navbar, splash) |
| `--dark-700` | `#374151` | Card dark, header cell tabel |
| `--dark-500` | `#6B7280` | Teks sekunder, caption |
| `--light-200` | `#D1D5DB` | Border, divider |
| `--light-100` | `#F3F4F6` | Background card light, alternating row |

## 2. RIFIM Chat Dark Theme (BERBEDA — Khusus Modul Chat RAOS)

| Token | Hex | Penggunaan |
|-------|-----|-----------|
| `--chat-bg` | `#111111` atau `#121212` | Background chat list & room |
| `--chat-accent` | `#FFC700` | Kuning Maxim, tab aktif, admin bubble, mention |
| `--chat-bubble-user` | `#2B2B2B` | Bubble pesan user sendiri (kanan) |
| `--chat-online` | `#00C853` | Indikator online, read-receipt check |
| `--chat-danger` | `#FF5252` | Delete, kick, warning |
| `--chat-surface` | `#1E1E1E` | Room chat background surface, header |

**Read receipt centang:**
- `Check` grey → terkirim (1 abu)
- `CheckCheck` grey → partial read
- `CheckCheck` sky-300 → dibaca semua

## 3. Font — Poppins (Fallback: Inter)

Seluruh aplikasi pakai **Poppins**. Kalau tidak ter-load, fallback ke Inter.

| Element | Size | Weight |
|---|---|---|
| H1 | 32px | Bold |
| H2 | 24px | Bold |
| H3 | 20px | SemiBold |
| Body | 14px | Regular |
| Caption | 11px | Medium |
| Button | 14px | SemiBold |

## 4. Queue Number Format — `A-023`

**Format wajib:** `A-023` (huruf prefix + tanda hubung + 3 digit zero-padded)

- **BUKAN** `A001` (format lama — harus diupdate di RAOS UI kalau masih ketemu)
- Reset per hari, per cabang
- Prefix bisa `A`, `B`, dst sesuai gate/counter

**Contoh:** `A-001`, `A-023`, `B-115`, `C-007`.

## 5. Kode Cabang — UPPERCASE 3 Huruf

| Kode | Nama | Bandara |
|------|------|---------|
| `BTH` | Batam | Hang Nadim |
| `JBI` | Jambi | Sultan Thaha |
| `PKU` | Pekanbaru | Sultan Syarif Kasim II |
| `BPN` | Balikpapan | Sultan Aji Muhammad Sulaiman |
| `MDC` | Manado | Sam Ratulangi |
| `MKS` | Makassar | Sultan Hasanuddin |
| `CGK` | Jakarta / Soeta | Soekarno-Hatta (T1/T2/T3) |

**Jangan hardcode nama panjang** di UI query/filter — pakai kode. Nama panjang hanya untuk display header.

**RAOS 9 cabang aktif:**
1. ID Rifim Airport Soeta (T1/T2/T3 sub-terminal) — mode Order
2. ID Rifim Airport Batam
3. ID Rifim Airport Jambi
4. ID Rifim Airport Balikpapan
5. ID Rifim Airport Manado
6. ID Rifim Airport Pekanbaru
7. ID Rifim Airport Makassar
8. ID Rifim Batam (non-airport)
9. ID Rifim Jambi Luar

Cabang non-Soeta khusus **Saldo** (Rp nominal).

## 6. Work Mode Enum — UPPERCASE

Setiap driver & staff punya status kerja aktif. Enum WAJIB uppercase:

```
BERTUGAS | ISTIRAHAT | SIAP_ORDER | OFF_DUTY | CUTI | SAKIT
```

Impact: Smart Queue, HRIS, Dashboard, AI Insight, Notifikasi.

Field `work_status` wajib ada di tabel Supabase `drivers` dan `employees`.

**Rule:** Driver dengan status `OFF_DUTY`, `CUTI`, atau `SAKIT` tidak boleh masuk antrian.

## 7. Auth RCP 4-Level (Rifim-OS)

Setiap session login HARUS return 4 level: **Role → Cabang → Permission[] → DataScope**.

| Level | Contoh | Ket |
|---|---|---|
| Role | `KOORDINATOR` | 8 roles: DIREKTUR, ADMIN_PUSAT, KOORDINATOR, STAFF, FINANCE, DRIVER, IT_SUPPORT, AUDITOR |
| Cabang | `BTH` | 7 kode + `ALL` untuk Direktur/Admin Pusat |
| Permission[] | `["read_finance","approve_invoice"]` | Array hak akses spesifik |
| DataScope | `{cabang:"BTH"}` | Filter data yang boleh dilihat |

**RAOS pakai model lebih sederhana** — hanya `role` di `user_profiles` (staff/koordinator/admin/direksi/management), scope by `branch_id` via `is_branch_in_scope()`.

## 8. Business Rules BR-01..BR-10 (Ringkas)

- **BR-01** — Koordinator HANYA boleh lihat data cabangnya sendiri
- **BR-06** — Saldo tidak boleh negatif
- Detail lengkap di `PROJECT_RULES.md`

## 9. Enum Status yang Wajib Diikuti

| Domain | Enum | Case |
|---|---|---|
| `raos_saldo_requests.status` | `pending/approved/rejected` | lowercase |
| Antrian Bandara (`raos_driver_queue.status`) | `WAITING/CALLED/PICKED/DONE/CANCEL` | UPPERCASE |
| `chat_messages.type` | `text/image/audio/saldo_request/driver_queue` | lowercase |
| Payroll `status_target` | `belum/tercapai/na` | lowercase |
| KPI `mode` | `saldo/order` | lowercase |
| `user_profiles.source` | `manual/ssot_master_staff` | lowercase |
| Cabang `branch_type` | `airport/non_airport` | lowercase snake_case |

## 10. Komponen UI Kunci

### RAOS (Next.js)

- **`MenalaLogo`** — variant `header` (kecil navbar) / `splash` (besar login). Baca dari `public/images/logo-menala.png`
- **`DateTimeHeader`** — chip tanggal+jam WIB realtime (tick 1s). Dipakai di dashboard, chat, absensi, scan, riwayat
- **`MiniCalendar`** — grid bulanan Sen-Min di dashboard, highlight hari ini `bg-primary`
- **`BottomNav`** — 4 tab (Beranda, Riwayat, Chat, Profil) + **center FAB Scan** elevated (`-top-8 w-16 h-16 ring-white`)

### RIFIM OS (HTML)

- **`openEditModal({title, subtitle, fields, onSave, onDelete})`** — helper reusable CRUD (Finance/HRIS). **Jangan** pakai native `prompt()`/`confirm()`
- Field types: `text/number/select` dengan `options[]`. Support `required/hint/placeholder/nullable`

## 11. Aturan Modal Bottom-Sheet di Halaman ber-BottomNav

Modal bottom-sheet di halaman yang punya BottomNav 90px HARUS pakai:

```css
padding-bottom: calc(96px + env(safe-area-inset-bottom));
```

Kalau pakai `p-6` flat, tombol CTA (Simpan, dll) akan ketutup BottomNav.

## 12. Chip Button vs Native `<select>` (Konvensi Chat Retention)

Untuk pilihan pendek (2-5 opsi), pakai **chip button horizontal** — bukan native `<select>`. Alasan: native picker di Android dismiss dengan back gesture bisa unmount komponen parent.

Contoh: Retensi Pesan chat (Tidak / 7 / 30 / 90 hari) = 4 chip button.
