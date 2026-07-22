/**
 * Generate PWA icons dari logo-menala.png (mark M emas 360×268).
 * - "any" icons: mark di-fit ke canvas transparan (kotak persegi, bg tembus).
 *   Home screen HP tampil mark M saja tanpa kotak putih.
 * - "maskable" icons: mark di safe-zone 66% + background navy solid, supaya
 *   tidak terpotong saat OS terapkan mask (circle/squircle/rounded-square).
 *   Bg tetap navy karena OS bisa force mask + butuh bg solid.
 * Jalankan: node scripts/generate-icons.js
 */
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const SRC = path.join(__dirname, '../public/images/logo-menala.png')
const OUT_DIR = path.join(__dirname, '../public/icons')
const NAVY = '#1A1A2E'
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

const ANY_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
const MASKABLE_SIZES = [192, 512]

async function makeTransparentIcon(size, outPath) {
  // fit: 'contain' + background transparent → mark utuh + sisi kanan/kiri
  // (atau atas/bawah) transparan, tidak crop, tidak ada bg putih.
  await sharp(SRC)
    .resize(size, size, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toFile(outPath)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // Icon "any" — mark M dengan bg TRANSPARAN (permintaan user: tanpa bg
  // supaya di home screen HP kelihatan mark saja, bukan kotak putih).
  for (const size of ANY_SIZES) {
    await makeTransparentIcon(size, path.join(OUT_DIR, `icon-${size}x${size}.png`))
    console.log(`✓ icon-${size}x${size}.png (transparan)`)
  }

  // Icon "maskable" — mark di safe-zone 66%, background navy solid.
  // Bg navy dipertahankan karena mask WAJIB butuh bg solid (kalau transparan
  // OS render bg default putih yang jelek dengan mark emas).
  for (const size of MASKABLE_SIZES) {
    const logoSize = Math.round(size * 0.66)
    const offset = Math.round((size - logoSize) / 2)

    const logoBuffer = await sharp(SRC)
      .resize(logoSize, logoSize, { fit: 'contain', background: TRANSPARENT })
      .png()
      .toBuffer()

    await sharp({
      create: { width: size, height: size, channels: 4, background: NAVY },
    })
      .composite([{ input: logoBuffer, left: offset, top: offset }])
      .png()
      .toFile(path.join(OUT_DIR, `maskable-${size}x${size}.png`))
    console.log(`✓ maskable-${size}x${size}.png (navy bg)`)
  }

  // Apple touch icon — 180x180 transparan. iOS Safari akan tambah bg PUTIH
  // sendiri kalau icon transparan (default iOS behavior). Ini konsekuensi
  // permintaan tanpa bg; kalau nanti user mau bg hitam/navy di iOS,
  // ganti fit:contain jadi flatten dengan background NAVY.
  await makeTransparentIcon(180, path.join(OUT_DIR, 'apple-touch-icon.png'))
  console.log('✓ apple-touch-icon.png (transparan — iOS mungkin auto-add bg putih)')

  // Favicon 32x32 transparan (browser tab)
  await makeTransparentIcon(32, path.join(OUT_DIR, 'favicon-32x32.png'))
  console.log('✓ favicon-32x32.png (transparan)')

  console.log('\nSelesai — semua icon PWA di public/icons/')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
