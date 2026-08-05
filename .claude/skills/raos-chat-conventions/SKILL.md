---
name: raos-chat-conventions
description: Konvensi chat RAOS — 5 room per cabang (3 global Umum/Pengumuman/Absensi + 2 per-cabang Pengisian Saldo/Driver), embed FK PostgREST WAJIB eksplisit (user_profiles!chat_messages_sender_id_fkey karena chat_messages punya 2 FK ke user_profiles), read receipt centang 3 state, retensi pesan chip button (Tidak/7/30/90 hari) via RPC set_chat_room_retention, hapus per-pesan (Trash2 red visible untuk sender OR admin/mgmt/koord/direksi), hapus semua pesan LOKAL per-user via RPC clear_chat_room_for_me, mention @nama regex (?:^|\s)@([\w.\-]*)$ + kolom mentions uuid[] + push notif kategori pengumuman title "📣 Anda di-tag", optimistic append + realtime dedup by id, chat_messages.type extend text/image/audio/saldo_request/driver_queue, slash command /isisaldo /antri /panggil /selesai /keluar. Gunakan skill ini setiap kali menyentuh /chat page atau komponen chat, room membership, message rendering, realtime subscribe chat_messages, atau slash command.
---

# Chat Conventions — RAOS

## Room Structure — 5 per Cabang

**Global (branch_id NULL, semua staff.is_active auto-member):**
- Umum
- Pengumuman — trigger `raos_notify_new_chat_message` push kategori `'pengumuman'` title "📢 Pengumuman Baru"
- Absensi — trigger `trg_raos_broadcast_absensi_to_chat` post pesan format WA-style + push ke member room

**Per-cabang (branch_id = cabang UUID):**
- Pengisian Saldo — <Cabang>
- Driver — <Cabang>

Non-admin RLS `rooms_read_member` filter dgn `is_branch_in_scope` → hanya lihat 3 global + 2 cabang sendiri. Admin/mgmt/direksi bypass.

**Stale rooms** (soft-delete sesi 20): Soetta T1/T2/T3 — Ops, Dukungan Driver.

## FK Embed WAJIB Eksplisit

`chat_messages` punya 2 FK ke `user_profiles` (`sender_id_fkey` + `pinned_by_fkey`). **Semua query embed harus eksplisit:**

```ts
supabase.from('chat_messages')
  .select('*, user_profiles!chat_messages_sender_id_fkey(full_name, avatar_url)')
```

Kalau pakai `user_profiles(...)` tanpa FK name → error PGRST201 ambigu.

## Read Receipt Centang (3 state)

- `Check` (grey, 1 abu) — terkirim
- `CheckCheck` (grey) — partial (sebagian member baca)
- `CheckCheck` (sky-300) — dibaca semua

Tap → modal "Dibaca oleh" via RPC `get_message_readers(uuid)`. State: `readSummary` map + `markedReadRef` Set untuk cegah RPC ganda. Realtime `chat_message_reads INSERT` → `+1 read_count`.

## Retensi Pesan — Chip Button

Chip button 4 opsi horizontal (Tidak/7/30/90 hari) — **BUKAN** native `<select>`. Alasan: native picker Android dismiss dengan back gesture bisa unmount komponen parent.

Panggil RPC `set_chat_room_retention(room_id, days)` (SECURITY DEFINER, bypass RLS admin-only, validasi 1-365). Bukan direct table UPDATE.

Tampil untuk **semua role** (tidak lagi gate PIN_ROLES sesi 20).

## Hapus Per-Pesan

Tombol Trash2 red di action menu. Visible untuk **sender OR admin/mgmt/koord/direksi**. RPC `delete_chat_message(uuid)`. Realtime `DELETE chat_messages` listener auto-remove dari state di semua user.

## Hapus Semua Pesan (LOKAL per-user)

Tombol "Hapus Semua Pesan (untuk Saya)" untuk semua user. RPC `clear_chat_room_for_me(room_id)` — tabel `chat_room_local_clears`. Pattern WhatsApp — hanya sembunyi di device pemanggil.

`loadMessages` fetch cutoff dari `chat_room_local_clears` dulu → filter `created_at > cleared_before_at`.

## Mention @nama

Input `onChange` handler deteksi regex `(?:^|\s)@([\w.\-]*)$` sebelum caret → dropdown autocomplete filter `roomMembers` by `full_name`, max 6. Klik pilihan → insert `@<Full Name> ` di posisi caret + push `user_id` ke `mentionsPending`.

`sendMessage` validate mentions yang masih ada di text → include di payload `chat_messages.mentions uuid[]`.

Bubble render: split regex mention → wrap `@Nama` dalam `<span>` primary color + bg tint.

Trigger push khusus untuk mentioned users (kategori `'pengumuman'` bypass filter chat_room, title "📣 Anda di-tag").

## Optimistic Append + Realtime Dedup

Saat insert, langsung append ke local state. Realtime handler dedup by `id`. Cegah duplikasi bubble.

Contoh: `chat/page.tsx sendMessage()`.

## chat_messages.type Enum

- `text` — pesan biasa
- `image` — attachment gambar
- `audio` — voice message (MediaRecorder → bucket `chat_attachments`)
- `saldo_request` — auto-post dari `/isisaldo` command
- `driver_queue` — auto-post dari `/antri /panggil /selesai /keluar`

## client_id — Idempotency

`chat_messages.client_id UUID` untuk idempotency saat offline replay. UNIQUE. Migration `raos_036`.

## Wallet Toggle di Room Pengisian Saldo (Sesi 20 Batch B)

Tombol Wallet + `IsiSaldoBottomSheet` cek `activeRoomBranch` (fetch `branches` by `activeRoom.branch_id`) — **BUKAN** `user.branches` (cabang user login).

Alasan: direksi/admin/user dengan branch T1 atau tanpa branch (`saldo_nominal_options=[]`) tidak boleh hilang tombol saat buka room cabang lain. RLS `raos_saldo_requests_staff_insert` cukup cek `staff_id`, tidak batasi `branch_id` → safe direksi submit ke cabang mana pun.

## Info Room Daftar Anggota

Hapus `.limit(30)` di fetch, hapus `.slice(5)` di render. List scrollable `max-h-[280px]`. Klik nama → RPC `get_or_create_pribadi_room` + `setActiveRoom(pribadiRoom)`.

## Voice Message

MediaRecorder → upload bucket `chat_attachments` (public=true, pakai `getPublicUrl()`) → insert `chat_messages` type='audio'. Lihat `chat/page.tsx:865-960` + `WorkspaceComposer.tsx:235` + `TimelineMessage.tsx:73-77`.

## Migration History (Sesi 20)

- `raos_051` — room cleanup + pengumuman notif + helper `raos_ensure_global_rooms_members()`
- `raos_052` — `chat_message_reads` + 3 RPC (`mark_messages_read`, `get_message_read_summary`, `get_message_readers`)
- `raos_053` — retention & delete RPC (`set_chat_room_retention`, `delete_chat_message`, `clear_chat_room_messages`)
- `raos_054` — chat local clear (`chat_room_local_clears` + `clear_chat_room_for_me`)
- `raos_055` — `chat_messages.mentions uuid[]` + GIN index partial + trigger push khusus mentioned

## Cross-References

- **Push notification full stack:** skill `raos-push-notification`
- **Slash command detail:** skill `raos-multi-cabang` (untuk `/isisaldo` + branch context) & `raos-frontend-conventions` (untuk parser)
