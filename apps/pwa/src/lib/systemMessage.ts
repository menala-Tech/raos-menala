export interface SystemMessageEnvelope {
  category: string | null
  meta: Record<string, unknown>
  ts: number | null
}

export interface ParsedSystemMessage {
  content: string
  envelope: SystemMessageEnvelope | null
  deepLink: string | null
}

const SYSTEM_META_RE = /^<!--SYSMETA:(\{[^\r\n]*\})-->\s*/

export function parseSystemMessage(raw: string): ParsedSystemMessage {
  const match = raw.match(SYSTEM_META_RE)
  if (!match) return { content: raw.trim(), envelope: null, deepLink: null }

  let envelope: SystemMessageEnvelope | null = null
  try {
    const parsed = JSON.parse(match[1]) as Partial<SystemMessageEnvelope>
    envelope = {
      category: typeof parsed.category === 'string' ? parsed.category : null,
      meta: parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta)
        ? parsed.meta as Record<string, unknown>
        : {},
      ts: typeof parsed.ts === 'number' ? parsed.ts : null,
    }
  } catch {
    // Metadata malformed tidak boleh menghalangi isi notifikasi tampil.
  }

  const candidate = envelope?.meta.deep_link
  const deepLink = typeof candidate === 'string' &&
    (candidate.startsWith('/') || candidate.startsWith('https://'))
    ? candidate
    : null

  return {
    content: raw.slice(match[0].length).trim(),
    envelope,
    deepLink,
  }
}

export function systemCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'Sistem'
  return category.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}
