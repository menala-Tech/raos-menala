/**
 * Generate PWA icons dari logo-menala.png sumber asli.
 * - "any" icons: resize langsung, dipakai umum (app switcher, shortcut)
 * - "maskable" icons: logo diperkecil ke safe-zone 66% + background navy solid,
 *   supaya tidak terpotong saat OS terapkan mask (circle/squircle/rounded-square)
 * Jalankan: node scripts/generate-icons.js
 */
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const SRC = path.join(__dirname, '../public/images/logo-menala.png')
const OUT_DIR = path.join(__dirname, '../public/icons')
const NAVY = '#1A1A2E'

const ANY_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
const MASKABLE_SIZES = [192, 512]

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // Icon "any" — resize langsung dari logo (sudah punya background putih solid)
  for (const size of ANY_SIZES) {
    await sharp(SRC)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(path.join(OUT_DIR, `icon-${size}x${size}.png`))
    console.log(`✓ icon-${size}x${size}.png`)
  }

  // Icon "maskable" — logo di tengah safe-zone 66%, background navy solid
  for (const size of MASKABLE_SIZES) {
    const logoSize = Math.round(size * 0.66)
    const offset = Math.round((size - logoSize) / 2)

    const logoBuffer = await sharp(SRC)
      .resize(logoSize, logoSize, { fit: 'cover' })
      .png()
      .toBuffer()

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: NAVY,
      },
    })
      .composite([{ input: logoBuffer, left: offset, top: offset }])
      .png()
      .toFile(path.join(OUT_DIR, `maskable-${size}x${size}.png`))
    console.log(`✓ maskable-${size}x${size}.png`)
  }

  // Apple touch icon — 180x180, iOS otomatis bulatkan sudut & tambah bg sendiri
  await sharp(SRC)
    .resize(180, 180, { fit: 'cover' })
    .png()
    .toFile(path.join(OUT_DIR, 'apple-touch-icon.png'))
  console.log('✓ apple-touch-icon.png')

  // Favicon kecil untuk tab browser
  await sharp(SRC)
    .resize(32, 32, { fit: 'cover' })
    .png()
    .toFile(path.join(OUT_DIR, 'favicon-32x32.png'))
  console.log('✓ favicon-32x32.png')

  console.log('\nSelesai — semua icon PWA di public/icons/')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
