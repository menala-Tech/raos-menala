/**
 * Moderasi konten chat client-side — peringatan otomatis untuk kata
 * kasar (Bahasa Indonesia + Inggris umum) dan link mencurigakan.
 *
 * Design:
 *   - Warn, jangan block. User bisa tap "Kirim Tetap" — audit log
 *     dicatat ke `activity_logs` untuk review Koordinator/Admin.
 *   - Regex sederhana, deterministic — cepat, tidak butuh LLM/edge.
 *   - Whitelist domain trusted (menala, rifim, supabase, vercel) supaya
 *     link internal tidak trigger warning.
 *
 * Tidak menambah tabel/API baru. Reuse activity_logs untuk audit.
 */

// Daftar kata kasar — Indonesia umum + slang. Case-insensitive.
// Word boundary supaya "ass" tidak match "class".
const PROFANITY = [
  // Bahasa Indonesia
  'anjing', 'anjir', 'anjrit', 'anying', 'bangsat', 'babi', 'bego', 'bodoh',
  'goblok', 'tolol', 'idiot', 'kampret', 'kontol', 'memek', 'ngentot',
  'setan', 'sialan', 'tai', 'taik', 'brengsek', 'sinting', 'gila lo',
  'bacot', 'jancok', 'jancuk', 'asu',
  // English general
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'motherfucker',
]

const PROFANITY_REGEX = new RegExp(
  `\\b(${PROFANITY.map(w => w.replace(/ /g, '\\s+')).join('|')})\\b`,
  'iu',
)

const TRUSTED_DOMAINS = [
  'menala.co.id', 'rifim.co.id', 'supabase.co', 'supabase.com',
  'vercel.app', 'vercel.com', 'google.com', 'gstatic.com', 'googleusercontent.com',
  'github.com', 'githubusercontent.com', 'apple.com', 'microsoft.com',
  'whatsapp.com', 'wa.me',
]

// Match http(s):// atau bare domain seperti "example.com"
const URL_REGEX = /(https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi

// Indikator link mencurigakan (URL shortener, IP raw, phishing-style)
const SUSPICIOUS_HINTS = [
  /bit\.ly/i, /tinyurl\.com/i, /t\.co\//i, /goo\.gl/i, /ow\.ly/i, /is\.gd/i,
  /shorturl/i, /rebrand\.ly/i, /cutt\.ly/i,
  /^https?:\/\/\d+\.\d+\.\d+\.\d+/i,  // raw IP
  /@\w+/,                              // URL with @-embedded credentials
  /paypa1|goog1e|arnazon|micros0ft|facebok|whatsap|instagrram/i, // typosquat
]

export interface ModerationHit {
  kind: 'profanity' | 'suspicious_link'
  match: string
}

export function scanContent(content: string): ModerationHit[] {
  if (!content || content.trim().length === 0) return []
  const hits: ModerationHit[] = []

  // Profanity
  const profanityMatch = content.match(PROFANITY_REGEX)
  if (profanityMatch) {
    hits.push({ kind: 'profanity', match: profanityMatch[0] })
  }

  // Links
  const urls = content.match(URL_REGEX) ?? []
  for (const raw of urls) {
    const lower = raw.toLowerCase()
    const isTrusted = TRUSTED_DOMAINS.some(d => lower.includes(d))
    if (isTrusted) continue
    const isSuspicious = SUSPICIOUS_HINTS.some(rx => rx.test(raw))
    if (isSuspicious) {
      hits.push({ kind: 'suspicious_link', match: raw })
      break // 1 warning per message is enough
    }
    // Link asing tetap warn (bukan trusted, bukan definitively suspicious)
    hits.push({ kind: 'suspicious_link', match: raw })
    break
  }

  return hits
}

export function formatModerationWarning(hits: ModerationHit[]): string {
  const lines: string[] = ['Peringatan konten:']
  for (const h of hits) {
    if (h.kind === 'profanity') {
      lines.push(`• Terdeteksi kata kasar: "${h.match}"`)
    } else {
      lines.push(`• Link tidak dikenal: ${h.match}`)
    }
  }
  lines.push('', 'Tetap kirim pesan ini? (klik OK untuk lanjut)')
  return lines.join('\n')
}
