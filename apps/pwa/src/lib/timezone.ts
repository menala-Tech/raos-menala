/**
 * Helper zona waktu multi-cabang RIFIM OS.
 *
 * Spec RIFIM OS: "Validasi presisi berdasarkan koordinat GPS bandara
 * cabang dan zona waktu lokal (WIB, WITA, WIT)".
 *
 * Kolom `branches.timezone` sudah berisi TZ identifier IANA
 * ("Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"). Semua timestamp
 * disimpan di Supabase sebagai `timestamp with time zone` (UTC), lalu
 * di-render per cabang dengan helper ini.
 *
 * Tidak menambah dependency — cukup Intl.DateTimeFormat native.
 */

export type IanaTimezone = 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura' | string

/**
 * Label singkat zona waktu Indonesia untuk chip UI.
 * "Asia/Jakarta" → "WIB", "Asia/Makassar" → "WITA", "Asia/Jayapura" → "WIT".
 * Fallback ke offset generic kalau bukan zona Indonesia.
 */
export function tzLabel(tz: IanaTimezone | null | undefined): string {
  if (!tz) return 'WIB'
  switch (tz) {
    case 'Asia/Jakarta':
    case 'Asia/Pontianak':
      return 'WIB'
    case 'Asia/Makassar':
      return 'WITA'
    case 'Asia/Jayapura':
      return 'WIT'
    default:
      return tz.replace('Asia/', '')
  }
}

const DEFAULT_TZ: IanaTimezone = 'Asia/Jakarta'

/**
 * Format timestamp ISO ke string sesuai timezone cabang.
 * Fallback ke Asia/Jakarta kalau tz null/undefined.
 */
export function formatInTimezone(
  iso: string | Date | null | undefined,
  tz: IanaTimezone | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', { ...opts, timeZone: tz ?? DEFAULT_TZ }).format(d)
}

/**
 * Format timestamp + append label zona waktu ("14:30 WIB", "15:30 WITA").
 * Berguna di dashboard cross-branch supaya user tahu waktu lokal cabang.
 */
export function formatWithTzLabel(
  iso: string | Date | null | undefined,
  tz: IanaTimezone | null | undefined,
  opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
  if (!iso) return '—'
  return `${formatInTimezone(iso, tz, opts)} ${tzLabel(tz)}`
}

/**
 * Format tanggal + jam full dengan label WIB/WITA/WIT.
 * Contoh: "28 Jul 2026, 14:30 WITA".
 */
export function formatBranchDateTime(
  iso: string | Date | null | undefined,
  tz: IanaTimezone | null | undefined,
): string {
  if (!iso) return '—'
  return formatInTimezone(iso, tz, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ` ${tzLabel(tz)}`
}
