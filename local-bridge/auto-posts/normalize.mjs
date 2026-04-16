import { createHash } from 'node:crypto'
import path from 'node:path'

const MIME_EXTENSION_MAP = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/svg+xml', '.svg'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['text/html', '.html'],
])

export function nowIso() {
  return new Date().toISOString()
}

export function hashText(value = '') {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex')
}

export function slugify(value = '', fallback = 'post') {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-가-힣]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

  return normalized || fallback
}

export function sanitizeFileSegment(value = '', fallback = 'asset') {
  const normalized = String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || fallback
}

export function toPortablePath(value = '') {
  return String(value ?? '').split(path.sep).join('/')
}

export function fromPortablePath(value = '') {
  return String(value ?? '').replace(/[\\/]+/g, path.sep)
}

export function parseBooleanFlag(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false
  }

  return fallback
}

export function canonicalizeUrl(value = '') {
  if (!value) {
    return ''
  }

  try {
    const next = new URL(value)
    next.hash = ''
    next.protocol = next.protocol.toLowerCase()
    next.hostname = next.hostname.toLowerCase()

    if (
      (next.protocol === 'https:' && next.port === '443') ||
      (next.protocol === 'http:' && next.port === '80')
    ) {
      next.port = ''
    }

    if (next.hostname === 'm.youtube.com' || next.hostname === 'youtube.com') {
      next.hostname = 'www.youtube.com'
    }

    if (next.hostname === 'youtu.be') {
      const videoId = extractYouTubeVideoId(next.toString())
      return videoId ? `https://www.youtube.com/watch?v=${videoId}` : next.toString()
    }

    if (/arxiv\.org$/i.test(next.hostname)) {
      const arxivId = extractArxivId(next.toString())
      return arxivId ? `https://arxiv.org/abs/${arxivId}` : next.toString()
    }

    const removableParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'ref_src',
      'ref_url',
      'source',
      'si',
      'feature',
    ]

    for (const key of removableParams) {
      next.searchParams.delete(key)
    }

    const queryEntries = [...next.searchParams.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )
    next.search = ''
    for (const [key, entryValue] of queryEntries) {
      next.searchParams.append(key, entryValue)
    }

    return next.toString()
  } catch {
    return String(value ?? '').trim()
  }
}

export function extractArxivId(value = '') {
  const input = String(value ?? '')
  const match =
    input.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i) ||
    input.match(/\barxiv:([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i)

  return match?.[1] ?? ''
}

export function extractYouTubeVideoId(value = '') {
  const input = String(value ?? '')

  try {
    const target = new URL(input)
    const hostname = target.hostname.toLowerCase()

    if (hostname === 'youtu.be') {
      return target.pathname.replace(/^\/+/, '').slice(0, 32)
    }

    if (hostname.endsWith('youtube.com')) {
      if (target.pathname === '/watch') {
        return target.searchParams.get('v')?.slice(0, 32) ?? ''
      }

      const pathMatch = target.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/i)
      return pathMatch?.[1]?.slice(0, 32) ?? ''
    }
  } catch {
    return ''
  }

  return ''
}

export function detectSourceType(item = {}) {
  if (item.sourceType) {
    return item.sourceType
  }

  if (item.source === 'Hacker News') {
    return 'hackerNews'
  }
  if (item.source === 'GitHub') {
    return 'github'
  }
  if (item.source === 'arXiv') {
    return 'arxiv'
  }
  if (item.source === 'RSS') {
    return 'rss'
  }

  return 'webpage'
}

export function normalizeCategoryKey(value = '') {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (normalized === 'ai' || normalized === 'ai 및 기술') {
    return 'ai'
  }
  if (normalized === 'research' || normalized === '연구') {
    return 'research'
  }
  if (normalized === 'opensource' || normalized === '오픈소스') {
    return 'opensource'
  }
  if (normalized === 'business' || normalized === '비즈니스') {
    return 'business'
  }

  return normalized || 'ai'
}

export function detectLanguage(value = '') {
  const input = String(value ?? '')
  if (!input.trim()) {
    return 'unknown'
  }
  if (/[가-힣]/.test(input)) {
    return 'ko'
  }
  if (/[a-z]/i.test(input)) {
    return 'en'
  }
  return 'unknown'
}

export function buildCandidateCanonicalId(candidate = {}) {
  const sourceType = detectSourceType(candidate)
  const canonicalUrl = canonicalizeUrl(candidate.url)
  const arxivId = extractArxivId(candidate.url || candidate.rawMeta?.pdfUrl || '')
  const youtubeId = extractYouTubeVideoId(candidate.url || '')

  if (sourceType === 'arxiv' && arxivId) {
    return `arxiv:${arxivId.toLowerCase()}`
  }

  if (youtubeId) {
    return `youtube:${youtubeId.toLowerCase()}`
  }

  if (sourceType === 'github') {
    const repoFullName = String(candidate.rawMeta?.fullName ?? '').trim().toLowerCase()
    if (repoFullName) {
      return `github:${repoFullName}`
    }
  }

  return `${sourceType}:${canonicalUrl || slugify(candidate.title || candidate.id || 'candidate')}`
}

export function buildCandidateDedupeKey(candidate = {}) {
  return hashText(buildCandidateCanonicalId(candidate))
}

export function guessFileExtension(url = '', mimeType = '') {
  const normalizedMimeType = String(mimeType ?? '').split(';')[0].trim().toLowerCase()
  if (MIME_EXTENSION_MAP.has(normalizedMimeType)) {
    return MIME_EXTENSION_MAP.get(normalizedMimeType)
  }

  try {
    const target = new URL(url)
    const extension = path.extname(target.pathname)
    if (extension && extension.length <= 8) {
      return extension.toLowerCase()
    }
  } catch {
    // Ignore invalid URL and fall back to the default extension.
  }

  if (normalizedMimeType.startsWith('image/')) {
    return '.jpg'
  }
  if (normalizedMimeType.startsWith('video/')) {
    return '.mp4'
  }
  return '.bin'
}

export function buildMediaCacheFileName({
  url = '',
  mimeType = '',
  fallbackBase = 'asset',
} = {}) {
  const safeBase = sanitizeFileSegment(fallbackBase, 'asset')
  return `${safeBase}-${hashText(url || safeBase).slice(0, 12)}${guessFileExtension(url, mimeType)}`
}

export function hostnameFromUrl(value = '') {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}
