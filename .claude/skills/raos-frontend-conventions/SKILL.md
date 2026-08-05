---
name: raos-frontend-conventions
description: Konvensi frontend PWA RAOS (Next.js 14 + TypeScript + Tailwind) — header sticky top-0 z-30 semua halaman utama, BottomNav 4-tab (Beranda/Riwayat/Chat/Profil) + center FAB Scan elevated -top-8 w-16 h-16 ring-white, MenalaLogo component (variant header/splash) baca dari public/images/logo-menala.png, DateTimeHeader chip tanggal+jam WIB realtime tick 1s, MiniCalendar grid Sen-Min dashboard, RPC pattern untuk join >2 tabel, ESLint rule react-hooks/set-state-in-effect di-OFF project-level, GPS tiered lib/gps.ts (COARSE 3s + REFINE 8s paralel), BarcodeScanner useEffect [active] only + onDetectedRef, SwipeBackWrapper attach containerRef, modal bottom-sheet padding calc(96px + env(safe-area-inset-bottom)), skipWaiting SW clientsClaim, offline queue via idb (attendance_in/out, scan_order, chat_message). Gunakan skill ini setiap kali menulis komponen React RAOS, halaman baru, form modal, kamera, GPS, atau bug UI.
---

# Frontend Conventions — PWA RAOS

## Header Sticky Wajib

Semua halaman utama pakai `sticky top-0 z-30` di div header supaya header hitam tidak ikut scroll:
- `/dashboard`
- `/chat` (list)
- `/riwayat`
- `/absensi`
- `/settings` (main + section)

**Room chat view** sudah pakai `flex flex-col h-screen` + `flex-shrink-0` di header — jangan diubah.

## BottomNav 4-tab

`components/layout/BottomNav.tsx`:
- 4 tab: Beranda, Riwayat, Chat, Profil
- **Center FAB Scan** elevated (`-top-8 w-16 h-16 ring-white`)
- **Jangan** ganti balik ke 5-tab flat — sudah di-approve user

## MenalaLogo Component

`components/MenalaLogo.tsx` — reusable logo dengan 2 variant:
- `header` — kecil di navbar
- `splash` — besar di login

Baca dari `public/images/logo-menala.png`. Kalau logo diganti, cukup replace file + `node scripts/generate-icons.js` regenerate icons PWA multi-size.

`Logo Menala.png` sumber (`Branding/` folder horizontal 1200×268 mark + wordmark navy + tagline). Split di build-time:
- `public/images/logo-menala.png` = mark cropped 360×268 (dipakai MenalaMark + generate-icons)
- `logo-menala-full.png` = horizontal bundled (untuk surface bg terang)

## Optimistic Append + Realtime Dedup

Pattern chat: saat insert, langsung append ke local state. Realtime handler dedup by `id`. Contoh `chat/page.tsx sendMessage()`.

## RPC Pattern untuk Query Kompleks

Kalau perlu join >2 tabel + agregasi, bikin RPC di Postgres (contoh `get_chat_rooms_for_user`), pakai `supabase.rpc(...)` dari client. Lebih efisien dari fetch berjenjang.

## ESLint Rule OFF

`react-hooks/set-state-in-effect` di-OFF project-level (`eslint.config.mjs`) — rule Next 16 terlalu agresif untuk pola fetch-data. **Jangan** reaktifkan tanpa refactor semua efek fetch-data ke pattern lain.

## GPS Tiered (`lib/gps.ts`)

`requestLocationTiered({ onFix, onUnavailable })`:

**Fase COARSE** (`enableHighAccuracy:false, timeout:3s, maximumAge:15s`) — wifi/cell trilateration, 0.5-2 detik. Cukup untuk validasi geofence.

**Fase REFINE** (`enableHighAccuracy:true, timeout:8s, maximumAge:15s`) — GPS asli, non-blocking. Cuma overwrite kalau accuracy turun ≥30m.

**Dua fase dilempar paralel dari mount** (bukan berurutan).

Dipakai di `/scan` & `/absensi` — waktu ke UI-siap turun 10-30s → 0.5-2s.

## BarcodeScanner — Jangan Restart tiap Parent Re-render

`BarcodeScanner` useEffect **hanya** depend ke `[active]`, BUKAN `[active, onDetected]`. `onDetected` disimpan di ref (`onDetectedRef`) supaya reference berubah (mis. dari `useCallback([location, geofence])` saat GPS refine) **TIDAK** memicu stop/start html5-qrcode. Race stop/start bertumpuk = page crash "This page couldn't load".

**Pola sama** harus dipakai kalau bikin komponen kamera lain.

## SwipeBackWrapper — Attach ke containerRef

**BUKAN** `document`. Cegah wrapper luar (AppShell) + wrapper dalam (room chat) sama-sama fire. Plus `e.stopPropagation()` di `onTouchEnd`.

## Modal Bottom-Sheet di Halaman ber-BottomNav

Container scroll pakai:
```css
padding-bottom: calc(96px + env(safe-area-inset-bottom));
```

**Bukan** `p-6` flat — supaya tombol CTA (Simpan dll) tidak ketutup BottomNav 90px.

Contoh: modal Edit Staff di `/admin`, modal Tambah/Edit Driver di `/drivers`.

## DateTimeHeader Component

`src/components/DateTimeHeader.tsx` — chip tanggal+jam WIB realtime (tick 1s). Dipakai di header dashboard, chat, absensi, scan, riwayat. Variant `compact` untuk kanan atas.

## MiniCalendar Component

`src/components/MiniCalendar.tsx` — grid bulanan Sen-Min di dashboard, highlight hari ini `bg-primary`.

## PWA — SW skipWaiting

`next.config.js`:
```js
workboxOptions: { skipWaiting: true, clientsClaim: true }
```

SW baru langsung take over tanpa nunggu semua tab RAOS ditutup. Update code langsung aktif setelah refresh.

**First-time upgrade:** user perlu clear cache PWA sekali (long-press icon → Info aplikasi → Hapus data) karena SW versi lama belum tahu `skipWaiting`. Update setelah ini otomatis.

## Offline Mode WRITE (Sudah Lengkap)

4 kind action ter-queue via IndexedDB pakai `idb`:
- `attendance_in`
- `attendance_out`
- `scan_order`
- `chat_message`

**Infra:**
- `lib/offlineQueue.ts` — enqueue + read
- `lib/offlineSyncer.ts` — flush ke server
- Banner offline mode di UI

Conflict resolver server-authoritative, idempotency via UNIQUE keys, blob upload chain, driver lookup deferred, app-open flush, polling 30s.

## Offline READ (Belum — Debt)

Kalau user buka dashboard/riwayat/chat offline masih putih. Butuh tune `next-pwa` runtime caching di `next.config.js` (Workbox strategies per route).

## Cache-First Hook `useApiCache`

Ada di `apps/pwa/src/lib/apiCache.ts` — pakai di halaman berat load (dashboard, kpi, laporan, riwayat).

## Slash Command Parser

**Isi Saldo** — `lib/saldoRequest.ts` parse `/isisaldo <nominal>` (support suffix `k`), submit validate `allowedNominals` + insert + post chat message JSON.

**Driver Queue** — `lib/driverQueue.ts` parse 4 command `/antri /panggil /selesai /keluar`. Command hanya jalan di room dengan `branch_id` spesifik (global room tolak).

## Auto-Push Subscribe

Hook `useAutoPushSubscribe()` di AppShell auto-heal `push_subscriptions=0`. Lihat skill `raos-push-notification`.
