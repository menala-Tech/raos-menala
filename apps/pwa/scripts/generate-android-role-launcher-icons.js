/**
 * Generate native Android launcher icons (per product flavor) for all six
 * RAOS roles: admin, koordinator, staff, driver, direksi, management.
 *
 * Reuses the exact same visual language as the existing PWA web-manifest
 * role icons (public/icons/{staff,koord,mgmt,direksi,driver}/, produced by
 * scripts/generate-icons-variants.js): Menala M mark + gold banner with the
 * role label in navy, bold, centered. Two differences from that script:
 *   1. Adds the previously-missing ADMIN role.
 *   2. Uses the FULL role word (KOORDINATOR, MANAGEMENT) instead of the
 *      abbreviated web-manifest labels (KOORD, MGMT), per the native
 *      launcher-icon spec (role name must be clearly readable at launcher
 *      scale, not abbreviated).
 *
 * Output: apps/pwa/android/app/src/<flavor>/res/mipmap-<density>/
 *         ic_launcher.png + ic_launcher_round.png
 * (flavor-specific res dirs override app/src/main/res/mipmap-* per the
 * standard Gradle Android source-set merge rules -- no shared resource is
 * duplicated or modified.)
 *
 * Run: node scripts/generate-android-role-launcher-icons.js
 */
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const SRC = path.join(__dirname, '../public/images/logo-menala.png')
const ANDROID_RES_ROOT = path.join(__dirname, '../android/app/src')
const NAVY = '#1A1A2E'
const GOLD = '#F5A623'
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

// flavor key must match android/app/build.gradle productFlavors exactly.
const ROLES = [
  { flavor: 'admin',       label: 'ADMIN' },
  { flavor: 'koordinator', label: 'KOORDINATOR' },
  { flavor: 'staff',       label: 'STAFF' },
  { flavor: 'driver',      label: 'DRIVER' },
  { flavor: 'direksi',     label: 'DIREKSI' },
  { flavor: 'management',  label: 'MANAGEMENT' },
]

// Standard Android launcher mipmap densities (matches existing main/res sizes).
const DENSITIES = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
]

function svgLabelBadge(text, size, fontSize) {
  const fs_ = fontSize || Math.max(9, Math.round(size * 0.155))
  const barHeight = Math.round(fs_ * 1.9)
  const y = size - barHeight
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${y}" width="${size}" height="${barHeight}" fill="${GOLD}"/>
    <text x="${size / 2}" y="${size - barHeight / 3}"
      font-family="Arial, sans-serif" font-size="${fs_}" font-weight="900"
      fill="${NAVY}" text-anchor="middle" dominant-baseline="middle">${text}</text>
  </svg>`
}

// Long labels (KOORDINATOR, MANAGEMENT) need a smaller font so they don't
// overflow the badge width at small mipmap sizes -- scale font down by
// label length relative to the shortest label (ADMIN/STAFF/DRIVER/DIREKSI).
function fontSizeFor(label, size) {
  const base = Math.max(9, Math.round(size * 0.155))
  const scale = Math.min(1, 6.5 / label.length)
  return Math.max(7, Math.round(base * scale))
}

async function makeIcon(size, outPath, label) {
  const markSize = Math.round(size * 0.72)
  const markBuffer = await sharp(SRC)
    .resize(markSize, markSize, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer()

  const badgeSvg = Buffer.from(svgLabelBadge(label, size, fontSizeFor(label, size)))

  await sharp({
    create: { width: size, height: size, channels: 4, background: TRANSPARENT },
  })
    .composite([
      { input: markBuffer, left: Math.round((size - markSize) / 2), top: Math.round((size - markSize) / 2 - size * 0.09) },
      { input: badgeSvg, top: 0, left: 0 },
    ])
    .png()
    .toFile(outPath)
}

async function main() {
  if (!fs.existsSync(SRC)) throw new Error('Source logo not found: ' + SRC)
  for (const role of ROLES) {
    console.log(`\n[${role.flavor.toUpperCase()}] label="${role.label}"`)
    for (const d of DENSITIES) {
      const outDir = path.join(ANDROID_RES_ROOT, role.flavor, 'res', d.dir)
      fs.mkdirSync(outDir, { recursive: true })
      const launcherPath = path.join(outDir, 'ic_launcher.png')
      const roundPath = path.join(outDir, 'ic_launcher_round.png')
      await makeIcon(d.size, launcherPath, role.label)
      // Reuse the same square artwork for the round variant -- Android
      // launchers that request ic_launcher_round apply their own circular
      // mask on top; this matches how the existing shared main/res assets
      // are structured (separate file, same visual source).
      fs.copyFileSync(launcherPath, roundPath)
      console.log(`  ${d.dir}/ic_launcher.png + ic_launcher_round.png OK (${d.size}x${d.size})`)
    }
  }
  console.log('\nDone -- 6 role launcher icon sets written under android/app/src/<flavor>/res/mipmap-*/')
}

main().catch(err => { console.error(err); process.exit(1) })
