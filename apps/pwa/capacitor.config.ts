import type { CapacitorConfig } from '@capacitor/cli'

const productionServerUrl = 'https://raos-menala.vercel.app'
const androidServerUrl = process.env.RAOS_ANDROID_SERVER_URL || productionServerUrl

// RAOS Android native shell — Capacitor wrapper around the existing
// production Next.js PWA. Do NOT bundle/export web assets locally: RAOS has
// server-rendered/dynamic routes (manifest-*, /api/pwa-version) that a
// static `next export` cannot serve. Instead the WebView loads the live
// production URL directly, same as any other browser client — the native
// shell adds ONLY what the web layer cannot do (background location +
// foreground service + persistent notification). Web code remains the
// single source of truth for every UI/business-logic decision.
//
// PACKAGE ID — PENDING ARCHITECT CONFIRMATION. No canonical Android
// package-ID convention exists anywhere in this repo or its history
// (checked package.json, manifest.json, docs — nothing). `com.rifim.raos`
// is a candidate (RIFIM = company, RAOS = product, matches the
// "MENALA Airport Operation System" / RIFIM Group branding already used in
// public/manifest.json), NOT a final decision — do not publish to Play
// Store or treat this as locked until Architect confirms or overrides it.
const config: CapacitorConfig = {
  appId: 'com.rifim.raos', // CANDIDATE — see note above, confirm before release
  appName: 'RAOS',
  webDir: 'public', // required by Capacitor CLI even though we don't ship local web assets
  server: {
    // Load the live, already-deployed production PWA. androidScheme:'https'
    // keeps the WebView origin as a real https:// origin (not the default
    // capacitor:// scheme) so it shares cookies/localStorage/Supabase auth
    // session storage exactly like the browser PWA does — no separate
    // native auth path (see AUTH BRIDGE notes in
    // android/app/src/main/java/.../RaosLocationBridgePlugin.kt).
    url: androidServerUrl,
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  // Note: RaosLocationBridge no longer reads supabaseUrl from plugin config
  // (2026-08-21 backend wiring) — the web layer passes supabaseUrl +
  // publicKey directly on every setSessionToken() call instead, sourced
  // from the same NEXT_PUBLIC_SUPABASE_URL/ANON_KEY the web bundle already
  // uses. See apps/pwa/src/lib/nativeLocationBridge.ts.
}

export default config
