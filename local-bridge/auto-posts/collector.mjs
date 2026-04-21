import { buildMediaAttachments, fetchPageMetadata } from './media.mjs'
import {
  buildCandidateDedupeKey,
  canonicalizeUrl,
  detectLanguage,
  detectSourceType,
  extractArxivId,
  nowIso,
  slugify,
} from './normalize.mjs'
import { rankSignalCandidates } from './scoring.mjs'

function stripHtml(value = '') {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sourceLabelForType(sourceType, fallback = '') {
  switch (sourceType) {
    case 'hackerNews':
      return '해커 뉴스'
    case 'github':
      return '깃허브'
    case 'arxiv':
      return 'arXiv'
    case 'rss':
      return 'RSS'
    default:
      return fallback || '웹'
  }
}

function categoryLabel(category) {
  switch (String(category ?? '').trim().toLowerCase()) {
    case 'ai':
      return 'AI 및 기술'
    case 'research':
      return '연구'
    case 'opensource':
      return '오픈소스'
    case 'business':
      return '비즈니스'
    default:
      return String(category ?? 'AI 및 기술')
  }
}

function preferLocalizedValue(currentValue, nextValue) {
  const current = stripHtml(currentValue)
  const next = stripHtml(nextValue)

  if (!next) {
    return current
  }
  if (!current) {
    return next
  }
  if (/[가-힣]/.test(current) && !/[가-힣]/.test(next)) {
    return current
  }

  return next
}

export function toSignalCandidate(item) {
  const sourceType = detectSourceType(item)
  const discoveredAt = item.discoveredAt || nowIso()
  const title = stripHtml(item.title || item.originalTitle || '')
  const summary = stripHtml(item.summary || item.originalSummary || '')
  const canonicalUrl = canonicalizeUrl(item.url)

  return {
    id: item.id,
    sourceType,
    category: item.category,
    categoryLabel: categoryLabel(item.category),
    title,
    summary,
    url: canonicalUrl,
    sourceLabel: item.sourceLabel || sourceLabelForType(sourceType, item.source),
    publishedAt: item.publishedAt || discoveredAt,
    discoveredAt,
    score: Number(item.score || 0),
    language: item.language || detectLanguage(`${title} ${summary}`),
    authorOrChannel: item.authorOrChannel || '',
    rawMeta: {
      ...(item.rawMeta ?? {}),
      originalSource: item.source,
      originalTitle: item.originalTitle || '',
      originalSummary: item.originalSummary || '',
    },
    slug: slugify(title || item.id),
  }
}

async function enrichHackerNewsCandidate(candidate, { fetchWithTimeout }) {
  const hnId = String(candidate.id || '').replace(/^hn-/, '')
  const discussionUrl = candidate.rawMeta?.discussionUrl || `https://news.ycombinator.com/item?id=${hnId}`

  if (hnId) {
    try {
      const response = await fetchWithTimeout(
        `https://hn.algolia.com/api/v1/items/${encodeURIComponent(hnId)}`,
        undefined,
        10_000,
      )
      if (response.ok) {
        const payload = await response.json()
        candidate.rawMeta = {
          ...candidate.rawMeta,
          points: payload.points ?? candidate.rawMeta?.points ?? 0,
          comments: payload.children?.length ?? candidate.rawMeta?.comments ?? 0,
          author: payload.author ?? candidate.rawMeta?.author ?? '',
          discussionUrl,
        }
        candidate.authorOrChannel = candidate.authorOrChannel || payload.author || ''
      }
    } catch {
      // HN item expansion is optional.
    }
  }

  const pageMeta = await fetchPageMetadata(candidate.url, { fetchWithTimeout })
  candidate.rawMeta = {
    ...candidate.rawMeta,
    discussionUrl,
    pageMeta,
  }

  if (pageMeta?.description) {
    candidate.summary = preferLocalizedValue(candidate.summary, pageMeta.description)
  }
  if (pageMeta?.author) {
    candidate.authorOrChannel = candidate.authorOrChannel || pageMeta.author
  }

  return candidate
}

async function enrichGitHubCandidate(candidate, { fetchWithTimeout }) {
  const match = candidate.url.match(/github\.com\/([^/]+)\/([^/?#]+)/i)
  if (!match) {
    candidate.rawMeta = {
      ...candidate.rawMeta,
      pageMeta: await fetchPageMetadata(candidate.url, { fetchWithTimeout }),
    }
    return candidate
  }

  const owner = match[1]
  const repo = match[2].replace(/\.git$/i, '')
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`
  const commonHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Artemis Auto Posts',
  }

  try {
    const repoResponse = await fetchWithTimeout(apiBase, { headers: commonHeaders }, 12_000)
    if (repoResponse.ok) {
      const repoPayload = await repoResponse.json()
      candidate.rawMeta = {
        ...candidate.rawMeta,
        fullName: repoPayload.full_name,
        stars: repoPayload.stargazers_count ?? 0,
        forks: repoPayload.forks_count ?? 0,
        watchers: repoPayload.subscribers_count ?? repoPayload.watchers_count ?? 0,
        language: repoPayload.language ?? '',
        updatedAt: repoPayload.updated_at ?? '',
        description: repoPayload.description ?? '',
        socialPreviewUrl: repoPayload.owner?.avatar_url ?? '',
        homepage: repoPayload.homepage ?? '',
      }
      candidate.authorOrChannel = candidate.authorOrChannel || repoPayload.owner?.login || ''
      candidate.summary = preferLocalizedValue(candidate.summary, repoPayload.description)
    }
  } catch {
    // GitHub API expansion is optional.
  }

  try {
    const releaseResponse = await fetchWithTimeout(`${apiBase}/releases/latest`, { headers: commonHeaders }, 12_000)
    if (releaseResponse.ok) {
      const releasePayload = await releaseResponse.json()
      candidate.rawMeta = {
        ...candidate.rawMeta,
        latestRelease: {
          tagName: releasePayload.tag_name ?? '',
          publishedAt: releasePayload.published_at ?? '',
          body: stripHtml(releasePayload.body || '').slice(0, 900),
          htmlUrl: releasePayload.html_url ?? '',
        },
      }
    }
  } catch {
    // Latest release is optional.
  }

  const pageMeta = await fetchPageMetadata(candidate.url, { fetchWithTimeout })
  candidate.rawMeta = {
    ...candidate.rawMeta,
    pageMeta,
  }
  return candidate
}

async function enrichArxivCandidate(candidate, { fetchWithTimeout }) {
  const arxivId = extractArxivId(candidate.url)
  if (!arxivId) {
    candidate.rawMeta = {
      ...candidate.rawMeta,
      pageMeta: await fetchPageMetadata(candidate.url, { fetchWithTimeout }),
    }
    return candidate
  }

  try {
    const response = await fetchWithTimeout(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`,
      undefined,
      12_000,
    )
    if (response.ok) {
      const xml = await response.text()
      const authors = [...xml.matchAll(/<name>([^<]+)<\/name>/g)].map((match) => stripHtml(match[1]))
      const summary = stripHtml(xml.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1] ?? '')
      const title = stripHtml(xml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
      const primaryCategory = xml.match(/<arxiv:primary_category[^>]+term="([^"]+)"/i)?.[1] ?? ''

      candidate.rawMeta = {
        ...candidate.rawMeta,
        arxivId,
        authors,
        primaryCategory,
        pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
      }
      candidate.title = preferLocalizedValue(candidate.title, title)
      candidate.summary = preferLocalizedValue(candidate.summary, summary)
      candidate.authorOrChannel = candidate.authorOrChannel || authors.slice(0, 3).join(', ')
    }
  } catch {
    // arXiv expansion is optional.
  }

  candidate.rawMeta = {
    ...candidate.rawMeta,
    pageMeta: await fetchPageMetadata(candidate.url, { fetchWithTimeout }),
  }
  return candidate
}

async function enrichWebCandidate(candidate, { fetchWithTimeout }) {
  const pageMeta = await fetchPageMetadata(candidate.url, { fetchWithTimeout })
  candidate.rawMeta = {
    ...candidate.rawMeta,
    pageMeta,
  }

  if (pageMeta?.title) {
    candidate.title = preferLocalizedValue(candidate.title, pageMeta.title)
  }
  if (pageMeta?.description) {
    candidate.summary = preferLocalizedValue(candidate.summary, pageMeta.description)
  }
  if (pageMeta?.author) {
    candidate.authorOrChannel = candidate.authorOrChannel || pageMeta.author
  }

  return candidate
}

export async function enrichSignalCandidate(
  candidate,
  {
    fetchWithTimeout,
    mediaCacheDir,
    screenshotFallback = true,
  } = {},
) {
  const next = {
    ...candidate,
    rawMeta: { ...(candidate.rawMeta ?? {}) },
  }
  const sourceType = detectSourceType(next)

  if (sourceType === 'hackerNews') {
    await enrichHackerNewsCandidate(next, { fetchWithTimeout })
  } else if (sourceType === 'github') {
    await enrichGitHubCandidate(next, { fetchWithTimeout })
  } else if (sourceType === 'arxiv') {
    await enrichArxivCandidate(next, { fetchWithTimeout })
  } else {
    await enrichWebCandidate(next, { fetchWithTimeout })
  }

  next.dedupeKey = buildCandidateDedupeKey(next)
  next.mediaAttachments = await buildMediaAttachments(next, {
    fetchWithTimeout,
    cacheDir: mediaCacheDir,
    screenshotFallback,
  })

  return next
}

export async function enrichSignalCandidates(candidates, options) {
  const settled = await Promise.allSettled(
    candidates.map((candidate) => enrichSignalCandidate(candidate, options)),
  )

  return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}

export function selectTopCandidates(
  candidates,
  {
    topK = 2,
    categoryWeights,
    processedUrlHashes = [],
  } = {},
) {
  const seenDedupeKeys = new Set(processedUrlHashes)
  return rankSignalCandidates(candidates, {
    categoryWeights,
    seenDedupeKeys,
  }).slice(0, topK)
}
