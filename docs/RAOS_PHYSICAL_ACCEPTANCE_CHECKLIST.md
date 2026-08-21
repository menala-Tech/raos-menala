# RAOS Physical Airport Acceptance Checklist

> One real Android phone, inside an active airport branch geofence. No GPS
> simulation/mocking anywhere in this checklist — a faked location makes
> every result here meaningless. Run once, in order, on a device that has
> the Android debug APK installed (see `ANDROID DEBUG BUILD` note below —
> this checklist cannot start until that APK exists, which requires a
> machine with JDK 17+ and the Android SDK; this repo's sandboxed dev
> environment has neither).

**Tester:** ___________  **Date:** ___________  **Branch/airport:** ___________
**Device:** ___________  **Android version:** ___________  **APK build:** ___________

Mark each line PASS / FAIL / N-A with a one-line note. Any FAIL blocks
acceptance — do not average around it.

## B1 — Login
- [ ] Login as a real, authorized Staff account (not a test/dummy profile)
- [ ] Active profile recognized (name, role, photo if applicable render correctly)
- [ ] Correct branch recognized (matches the physical airport branch, not a default/fallback)

## B2 — Background location
- [ ] Enable tracking from Settings → Tracking Lokasi (Android)
- [ ] Android persistent notification appears immediately ("RAOS — tracking aktif untuk shift Anda")
- [ ] Minimize the app (home button, not force-close)
- [ ] Lock the screen
- [ ] Wait at least 3 full capture intervals (~2-3 minutes at the 45s default)
- [ ] Backend confirms location points were received while the app was not foregrounded
      — open the Supabase SQL Editor (or any authenticated SQL client) and run:
        ```sql
        SELECT id, lat, lng, accuracy_m, captured_at
          FROM public.raos_background_location_points
         WHERE user_id = '<TESTER_USER_ID>'
         ORDER BY captured_at DESC
         LIMIT 10;
        ```
        while the phone screen is still locked. At least one returned row must have
        `captured_at` falling inside the locked-screen interval (2026-08-21 default
        capture interval ~45s), with `lat`, `lng`, and `accuracy_m` populated. Do not
        rely on the in-app "Titik Tertunda" counter as proof of backend delivery.

## B3 — Scan barcode
- [ ] Scan a valid operational barcode while physically inside the branch geofence
- [ ] Server-side geofence check PASSes (not just a client-side green checkmark)
- [ ] Repeat outside the geofence (or with location services off) — confirm it
      still fails closed (blocked), not silently allowed

## B4 — Absensi Masuk
- [ ] Real GPS fix (not cached/stale)
- [ ] Server-side geofence check PASSes
- [ ] Recorded timestamp and branch are correct (branch-local time, not UTC or
      wrong-branch timezone — see the 2026-08-21 timezone display fix)

## B5 — Absensi Pulang
- [ ] Real GPS fix
- [ ] Server-side geofence check PASSes
- [ ] No duplicate attendance row created for the same shift (check `/riwayat`
      after, not just the immediate success toast)

## B6 — Driver Queue via Barcode/GPS
- [ ] Use a valid driver record
- [ ] Join queue via barcode + GPS (not the removed chat slash-command path)
- [ ] Queue position assigned is correct/sequential
- [ ] No duplicate active queue entry created for the same driver

## B7 — Lock/minimize behavior
- [ ] Push notification (chat/scan/saldo, unrelated to tracking) still received
      while app is minimized/locked
- [ ] Background location tracking (B2) still active throughout
- [ ] Reopening the app restores the session correctly (no forced re-login,
      no stale role/branch shown)

## B8 — Logout
- [ ] Logout from Settings
- [ ] Background location service stops (confirm via Android's own
      notification shade / running-services view, not just the in-app toggle)
- [ ] Persistent tracking notification disappears
- [ ] No further location writes occur for that user after logout — retest by
      waiting one more capture interval post-logout and confirming the
      "Titik Tertunda" counter does not grow

## Sign-off

- [ ] All PASS (or explicit N/A with reason) before marking RAOS Android
      background location "physically accepted"
- Outstanding items at sign-off time: ___________________________________
- Signed: ___________  Role: ___________  Date: ___________

## Non-Goals For This Checklist

- Does not cover Play Store submission/review — internal acceptance only.
- Does not cover multi-device/multi-OEM battery variance — track separately
  per the rollout stages in `docs/ANDROID_BACKGROUND_LOCATION_PLAN.md` section 9.
- Backend location contract is now live in production. B2's backend-delivery
  sub-item must be physically verified by querying actual rows in
  `public.raos_background_location_points` while the device screen is locked.
