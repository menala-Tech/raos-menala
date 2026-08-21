# Android Background Location — Prep Plan (Design Only)

> Status: **DESIGN ONLY** — no Android project exists yet, no implementation in this session.
> Architect decision (2026-08-21, EXPANDED FINAL CLOSURE): H = design-only, implementation later.
> Do NOT scaffold a native/Capacitor project from this doc without a separate explicit go-ahead.

## Context

RAOS PWA currently does GPS capture only at point-of-action (attendance in/out, scan) via
tiered GPS in `apps/pwa/src/lib/gps.ts` (COARSE 3s + REFINE 8s parallel). There is no
background/continuous location tracking today. This doc scopes what a future native Android
wrapper would need if RAOS ever needs background location (e.g. continuous driver tracking,
geofence-triggered reminders while the app is backgrounded).

## 1. Wrapper Strategy — Capacitor

- Wrap the existing Next.js PWA with **Capacitor** (not a rewrite) — reuse 100% of
  `apps/pwa/src` as the WebView content, add native plugins only for what the web layer
  cannot do (background location, foreground service, persistent notification).
- Candidate plugins: `@capacitor/geolocation` (foreground only) is insufficient for
  background tracking — would need `@capacitor-community/background-geolocation` or a
  custom native plugin wrapping Android's `FusedLocationProviderClient` + a foreground
  `Service`.
- Web code stays the single source of truth for UI/business logic; native layer only
  bridges location data back into the same Supabase write paths already used by
  `lib/gps.ts` / `lib/offlineSyncer.ts` — no parallel data path.

## 2. Required Android Permissions

- `ACCESS_FINE_LOCATION` (foreground)
- `ACCESS_BACKGROUND_LOCATION` (Android 10+, separate runtime prompt, requires
  "Allow all the time" — Play Store requires a prominent disclosure + policy justification
  for this permission)
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` (Android 14+ split foreground
  service types)
- `POST_NOTIFICATIONS` (Android 13+, required for the persistent tracking notification)
- `ACTIVITY_RECOGNITION` (optional — only if driver movement/idle detection is desired)

## 3. Foreground Service Lifecycle

- A persistent Android foreground `Service` must run while tracking is active — Android
  kills background-only location collection aggressively otherwise.
- Lifecycle: **start** only after explicit driver opt-in (never auto-start on app open) →
  runs while driver shift is "on duty" (tie to existing shift/absensi state in Supabase,
  not a separate native flag) → **stop** immediately on:
  - explicit driver "end shift" / logout action
  - `raos_attendance` pulang recorded for that driver
  - app force-stop (OS-level, cannot be prevented — service must restart cleanly on next
    app open if shift is still "on duty" server-side)

## 4. Persistent Notification

- Required by Android while a foreground location service runs — cannot be dismissed by
  the user (or dismissing it should stop tracking, since a hidden background service is a
  Play Store policy violation).
- Content: low-key, e.g. "RAOS — tracking aktif untuk shift Anda" with a tap-through deep
  link back into the app (same-origin rule as the existing push notification click handler
  in `public/sw-push.js` should apply here too).

## 5. Supabase Auth Bridge

- Native layer does not get its own auth — it must reuse the same Supabase session the
  WebView already holds (Capacitor WebView shares cookies/localStorage with the native
  shell if configured correctly via `capacitor.config` `server.androidScheme`).
- Location writes from the native background service must carry the same JWT the PWA uses
  — no separate service-role or anonymous write path. If the JWT expires while the app is
  backgrounded, the service must pause writes and queue locally (reuse the offline queue
  pattern from `lib/offlineSyncer.ts`) rather than fail silently or write unauthenticated.

## 6. Logout Stop

- Logout (from any surface — web UI, forced session expiry, admin-triggered) MUST stop the
  foreground service and clear any queued unsent location points tied to that user's
  session. A background service continuing to collect location after logout is both a
  privacy and Play Store policy violation.

## 7. Location Payload

- Reuse the existing GPS tiered capture shape from `lib/gps.ts` (lat/lng/accuracy/timestamp)
  rather than inventing a new schema.
- Payload should carry: `driver_id` (or `user_id`), `lat`, `lng`, `accuracy_m`, `captured_at`
  (ISO UTC per repo convention — no local-time storage), `branch_id`, `source: 'android_bg'`
  (so it's distinguishable from web-captured points at query time).
- Batch writes (e.g. every N seconds/meters) rather than one write per fix — avoid hammering
  Supabase and battery.

## 8. Retry / Battery Strategy

- Use Android's `WorkManager` (or the location plugin's built-in batching) for retry —
  never a naive infinite-loop timer that ignores Doze/App Standby.
- Adaptive interval: tighter interval while actively moving (e.g. 30-60s), longer interval
  or pause while stationary — significant battery cost of continuous FusedLocationProvider
  polling must be justified against the tracking need.
- On write failure (offline), queue locally with a cap (e.g. last N points or last N
  minutes) — do not let an unbounded queue grow if the device is offline for hours.

## 9. Rollout Stages

1. Internal test build (Architect + 1-2 volunteer koordinator/driver, non-production
   Supabase branch) — validate permission flow, battery impact, service resilience to
   OS kill.
2. Closed pilot at **one** airport branch, opt-in drivers only, with a manual kill-switch
   (Script Property or admin toggle) to disable background tracking fleet-wide if something
   goes wrong.
3. Staged rollout branch-by-branch, monitoring battery complaints and location data quality
   (gaps, drift) before adding the next branch.
4. Full rollout only after at least one full multi-day cycle at each branch with no P0/P1
   issues.

## 10. Physical Airport Acceptance Checklist

- [ ] Location fixes continue while phone screen is off and app is backgrounded for 30+ min
- [ ] Foreground notification stays visible and cannot be silently swiped away without
      stopping tracking
- [ ] Service survives a phone reboot mid-shift (re-prompts driver to resume, does not
      silently restart tracking without the driver's shift still being "on duty")
- [ ] Airport terminal Wi-Fi / weak cellular signal areas — verify offline queue + retry
      does not lose points or double-write on reconnect
- [ ] Battery drain over a full 8-12h shift is acceptable to drivers (needs field
      measurement, not just estimate)
- [ ] Logout on a shared/handed-down device immediately stops tracking (test explicitly —
      this is a privacy requirement, not just a nice-to-have)
- [ ] Play Store background location policy disclosure flow tested (the mandatory in-app
      explanation screen before the OS permission prompt)
- [ ] Geofence radius (reuse `GEOFENCE_TOLERANCE_METERS` convention from
      `apps/pwa/src/lib/geo.ts`) behaves consistently between web GPS capture and native
      background capture — no divergent radius logic between the two paths

## Non-Goals For This Doc

- No Capacitor project is created in this repo as part of this plan.
- No native plugin code, Gradle config, or `capacitor.config` is written yet.
- No decision here commits to a specific background-geolocation plugin — that is an
  implementation-time choice once Architect greenlights building it.
