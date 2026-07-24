/**
 * Generate 5 variant icon PWA per role (staff/koord/mgmt/direksi/driver).
 * Setiap variant = mark M logo-menala + text label overlay di bagian bawah.
 * Output: public/icons/<variant>/icon-<size>x<size>.png dan maskable-<size>x<size>.png
 *
 * Jalankan: node scripts/generate-icons-variants.js
 */
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const SRC = path.join(__dirname, '../public/images/logo-menala.png')
const OUT_ROOT = path.join(__dirname, '../public/icons')
const NAVY = '#1A1A2E'
const GOLD = '#F5A623'
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

const VARIANTS = [
  { key: 'staff',   label: 'STAFF' },
  { key: 'koord',   label: 'KOORD' },
  { key: 'mgmt',    label: 'MGMT' },
  { key: 'direksi', label: 'DIREKSI' },
  { key: 'driver',  label: 'DRIVER' },
]

const ANY_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
const MASKABLE_SIZES = [192, 512]

function svgLabelBadge(text, size) {
  const fontSize = Math.max(10, Math.round(size * 0.14))
  const barHeight = Math.round(fontSize * 1.8)
  const y = size - barHeight
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${y}" width="${size}" height="${barHeight}" fill="${GOLD}"/>
    <text x="${size / 2}" y="${size - barHeight / 3}"
      font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900"
      fill="${NAVY}" text-anchor="middle" dominant-baseline="middle">${text}</text>
  </svg>`
}

async function makeAnyVariant(size, outPath, label) {
  const markSize = Math.round(size * 0.72)
  const markBuffer = await sharp(SRC)
    .resize(markSize, markSize, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer()

  const badgeSvg = Buffer.from(svgLabelBadge(label, size))

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

async function makeMaskableVariant(size, outPath, label) {
  const markSize = Math.round(size * 0.56)
  const markBuffer = await sharp(SRC)
    .resize(markSize, markSize, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer()

  const badgeSvg = Buffer.from(svgLabelBadge(label, size))

  await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([
      { input: markBuffer, left: Math.round((size - markSize) / 2), top: Math.round(size * 0.15) },
      { input: badgeSvg, top: 0, left: 0 },
    ])
    .png()
    .toFile(outPath)
}

async function main() {
  for (const v of VARIANTS) {
    const outDir = path.join(OUT_ROOT, v.key)
    fs.mkdirSync(outDir, { recursive: true })
    console.log(`\n[${v.key.toUpperCase()}] ${v.label}`)
    for (const size of ANY_SIZES) {
      await makeAnyVariant(size, path.join(outDir, `icon-${size}x${size}.png`), v.label)
      console.log(`  icon-${size}x${size}.png OK`)
    }
    for (const size of MASKABLE_SIZES) {
      await makeMaskableVariant(size, path.join(outDir, `maskable-${size}x${size}.png`), v.label)
      console.log(`  maskable-${size}x${size}.png OK`)
    }
  }
  console.log('\nSelesai — 5 variant icon di public/icons/{staff,koord,mgmt,direksi,driver}/')
}

main().catch(err => { console.error(err); process.exit(1) })
