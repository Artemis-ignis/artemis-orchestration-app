import { canonicalizeUrl, hashText, slugify } from '../auto-posts/normalize.mjs'

const DOSSIER_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
  'about',
  'using',
  'based',
  'through',
  'latest',
  'update',
  'news',
  'paper',
  'model',
  'system',
  'ai',
  'ml',
  'llm',
  '및',
  '관련',
  '소개',
  '기반',
  '대한',
  '에서',
  '으로',
  '하는',
  '위한',
  '대한',
  '최신',
  '업데이트',
  '소식',
  '논문',
  '뉴스',
  '연구',
  '기술',
])

function normalizeText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function tokenize(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !DOSSIER_STOPWORDS.has(item))
}

function uniqueTokens(value = '') {
  return Array.from(new Set(tokenize(value)))
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) {
      return normalized
    }
  }

  return ''
}

function compactText(value = '', maxLength = 220) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return ''
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}…` : normalized
}

function extractSource(item = {}) {
  return item.sourceMeta && typeof item.sourceMeta === 'object' ? item.sourceMeta : item
}

function sourceIdentity(item = {}) {
  const source = extractSource(item)
  const canonicalUrl = canonicalizeUrl(source.canonicalUrl || source.sourceUrl || item.canonicalUrl || item.sourceUrl || '')
  const doi = String(source.doi || item.doi || '').trim().toLowerCase()
  const arxivId = String(source.arxivId || item.arxivId || '').trim().toLowerCase()
  return canonicalUrl || doi || arxivId || source.id || item.id || slugify(source.title || item.sourceTitle || item.title || 'source')
}

function itemTimestamp(item = {}) {
  return (
    Date.parse(item.publishedAt || item.updatedAt || item.scheduledAt || item.approvedAt || item.createdAt || 0) || 0
  )
}

function extractParagraphs(value = '') {
  return String(value ?? '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function extractKeyPoints(value = '', limit = 4) {
  const lines = String(value ?? '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const points = []
  for (const line of lines) {
    const normalized = line
      .replace(/^[-*•]\s*/, '')
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[0-9]+[.)]\s*/, '')
      .trim()

    if (!normalized || normalized.includes('http://') || normalized.includes('https://')) {
      continue
    }

    if (normalized.length < 18) {
      continue
    }

    points.push(compactText(normalized, 120))
    if (points.length >= limit) {
      return points
    }
  }

  const fallbackSentences = normalizeText(value)
    .split(/[.!?。！？]\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 18)

  for (const sentence of fallbackSentences) {
    const normalized = compactText(sentence, 120)
    if (!points.includes(normalized)) {
      points.push(normalized)
    }
    if (points.length >= limit) {
      break
    }
  }

  return points
}

function buildLead(preferredItem, dossier) {
  const source = extractSource(preferredItem)
  const parts = [
    source.subtitle || preferredItem.subtitle,
    source.authors?.length ? source.authors.slice(0, 3).join(', ') : '',
    source.publishedAt ? new Date(source.publishedAt).toLocaleString('ko-KR') : '',
  ].filter(Boolean)

  const prefix = parts.join(' / ')
  const body = compactText(
    source.abstractOrSnippet ||
      preferredItem.sourceSummary ||
      preferredItem.excerpt ||
      preferredItem.generatedText ||
      preferredItem.body,
    220,
  )

  if (prefix && body) {
    return `${prefix} / ${body}`
  }

  return prefix || body || `${dossier.providerLabels.slice(0, 3).join(', ')} 기반 업데이트 묶음`
}

function createTimelineEntry(kind, item, detail = '') {
  const source = extractSource(item)
  return {
    id: `${kind}-${item.id || slugify(source.title || item.sourceTitle || 'item')}`,
    kind,
    createdAt:
      item.publishedAt ||
      item.updatedAt ||
      item.scheduledAt ||
      item.approvedAt ||
      item.createdAt ||
      source.publishedAt ||
      null,
    title: firstNonEmpty(item.sourceTitle, item.title, source.title, '제목 없음'),
    provider: firstNonEmpty(item.provider, source.provider, 'source'),
    detail,
    sourceUrl: canonicalizeUrl(item.sourceUrl || item.canonicalUrl || source.sourceUrl || source.canonicalUrl || ''),
    linkedId: item.id || null,
  }
}

export function buildDossierKey(item = {}) {
  const source = extractSource(item)
  const titleTokens = uniqueTokens(source.title || item.sourceTitle || item.title || '')
  const snippetTokens = uniqueTokens(source.abstractOrSnippet || item.sourceSummary || item.excerpt || '')
  const tagTokens = uniqueTokens(Array.isArray(source.tags || item.tags) ? (source.tags || item.tags).join(' ') : '')
  const seed = [
    source.sourceType || item.sourceType || 'feed',
    ...titleTokens.slice(0, 5),
    ...(titleTokens.length < 5 ? snippetTokens.slice(0, 5 - titleTokens.length) : []),
    ...tagTokens.slice(0, 2),
  ].filter(Boolean)

  return hashText(seed.join('|') || sourceIdentity(item))
}

export function buildDossierId(dossierKey = '') {
  return `dossier-${String(dossierKey).slice(0, 16)}`
}

function createEmptyDossier(item, dossierKey) {
  const source = extractSource(item)
  return {
    id: buildDossierId(dossierKey),
    dossierKey,
    slug: slugify(source.title || item.sourceTitle || item.title || dossierKey, 'dossier'),
    title: '',
    summary: '',
    lead: '',
    status: 'emerging',
    sourceType: source.sourceType || item.sourceType || 'feed',
    providerLabels: [],
    tags: [],
    sourceCount: 0,
    draftCount: 0,
    publishedCount: 0,
    lastUpdatedAt: null,
    lastPublishedAt: null,
    keyPoints: [],
    sourceItems: [],
    linkedDraftIds: [],
    linkedPublishedIds: [],
    timeline: [],
  }
}

function mergeSourceItems(currentItems = [], item) {
  const source = extractSource(item)
  const nextIdentity = sourceIdentity(item)
  if (currentItems.some((entry) => sourceIdentity(entry) === nextIdentity)) {
    return currentItems
  }

  return [
    ...currentItems,
    {
      id: source.id || item.id || nextIdentity,
      sourceType: source.sourceType || item.sourceType || 'feed',
      provider: source.provider || item.provider || '',
      canonicalUrl: canonicalizeUrl(source.canonicalUrl || item.canonicalUrl || source.sourceUrl || item.sourceUrl || ''),
      sourceUrl: canonicalizeUrl(source.sourceUrl || item.sourceUrl || source.canonicalUrl || item.canonicalUrl || ''),
      title: firstNonEmpty(source.title, item.sourceTitle, item.title),
      subtitle: firstNonEmpty(source.subtitle, item.subtitle),
      authors: Array.isArray(source.authors || item.authors) ? (source.authors || item.authors) : [],
      publishedAt: source.publishedAt || item.sourcePublishedAt || item.publishedAt || '',
      abstractOrSnippet: firstNonEmpty(source.abstractOrSnippet, item.sourceSummary, item.excerpt),
      language: firstNonEmpty(source.language, item.language),
      doi: firstNonEmpty(source.doi, item.doi),
      arxivId: firstNonEmpty(source.arxivId, item.arxivId),
      tags: Array.isArray(source.tags || item.tags) ? (source.tags || item.tags) : [],
      score: Number(source.score || item.score || item.noveltyScore || 0),
      topicHash: firstNonEmpty(source.topicHash, item.topicHash),
      rawMeta: source.rawMeta ?? {},
    },
  ]
}

function mergeTimeline(dossier, entry) {
  if (!entry.createdAt) {
    return dossier.timeline
  }

  if (dossier.timeline.some((item) => item.id === entry.id)) {
    return dossier.timeline
  }

  return [...dossier.timeline, entry]
}

function countOverlap(left = [], right = []) {
  if (!left.length || !right.length) {
    return 0
  }

  const lookup = new Set(right)
  return left.reduce((count, token) => count + (lookup.has(token) ? 1 : 0), 0)
}

function itemTitleTokens(item = {}) {
  const source = extractSource(item)
  return uniqueTokens(
    [
      source.title,
      item.sourceTitle,
      item.title,
      source.subtitle,
      item.subtitle,
      source.abstractOrSnippet,
      item.sourceSummary,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function itemTagTokens(item = {}) {
  const source = extractSource(item)
  const tags = Array.isArray(source.tags || item.tags) ? source.tags || item.tags : []
  return uniqueTokens(tags.join(' '))
}

function dossierTopicHashes(dossier = {}) {
  return new Set(
    (dossier.sourceItems || [])
      .map((entry) => firstNonEmpty(entry.topicHash))
      .filter(Boolean),
  )
}

function dossierComparisonTokens(dossier = {}) {
  return {
    titleTokens: uniqueTokens(
      [
        dossier.title,
        ...(dossier.sourceItems || []).flatMap((entry) => [entry.title, entry.subtitle, entry.abstractOrSnippet]),
      ]
        .filter(Boolean)
        .join(' '),
    ),
    tagTokens: uniqueTokens((dossier.tags || []).join(' ')),
  }
}

function findMatchingDossierKey(item, map, fallbackKey) {
  if (map.has(fallbackKey)) {
    return fallbackKey
  }

  const itemIdentity = sourceIdentity(item)
  const source = extractSource(item)
  const topicHash = firstNonEmpty(item.topicHash, source.topicHash)
  const titleTokens = itemTitleTokens(item)
  const tagTokens = itemTagTokens(item)
  let bestKey = fallbackKey
  let bestScore = 0

  for (const [dossierKey, dossier] of map.entries()) {
    if (item.dossierId && dossier.id === item.dossierId) {
      return dossierKey
    }

    if (item.dossierKey && dossier.dossierKey === item.dossierKey) {
      return dossierKey
    }

    if ((dossier.sourceItems || []).some((entry) => sourceIdentity(entry) === itemIdentity)) {
      return dossierKey
    }

    if (topicHash && dossierTopicHashes(dossier).has(topicHash)) {
      return dossierKey
    }

    const comparison = dossierComparisonTokens(dossier)
    const titleOverlap = countOverlap(titleTokens, comparison.titleTokens)
    const tagOverlap = countOverlap(tagTokens, comparison.tagTokens)
    const score = titleOverlap * 2 + tagOverlap * 3

    if ((tagOverlap >= 1 && titleOverlap >= 2) || titleOverlap >= 3) {
      return dossierKey
    }

    if (score > bestScore) {
      bestScore = score
      bestKey = dossierKey
    }
  }

  return bestScore >= 5 ? bestKey : fallbackKey
}

export function buildDossiers({ queue = [], published = [], logs = [] } = {}) {
  const map = new Map()

  const upsert = (item, kind) => {
    const source = extractSource(item)
    const rawDossierKey = item.dossierKey || buildDossierKey(item)
    const dossierKey = findMatchingDossierKey(item, map, rawDossierKey)
    const existing = map.get(dossierKey) || createEmptyDossier(item, dossierKey)
    const providerLabel = firstNonEmpty(item.sourceLabel, item.provider, source.provider)
    const next = {
      ...existing,
      sourceType: existing.sourceType || source.sourceType || item.sourceType || 'feed',
      providerLabels: providerLabel
        ? Array.from(new Set([...existing.providerLabels, providerLabel]))
        : existing.providerLabels,
      tags: Array.from(new Set([...(existing.tags || []), ...((source.tags || item.tags || []).filter(Boolean))])),
      sourceItems: mergeSourceItems(existing.sourceItems, item),
      lastUpdatedAt:
        !existing.lastUpdatedAt || itemTimestamp(item) > Date.parse(existing.lastUpdatedAt || 0)
          ? new Date(itemTimestamp(item) || Date.now()).toISOString()
          : existing.lastUpdatedAt,
    }

    if (kind === 'published') {
      next.publishedCount += 1
      next.linkedPublishedIds = Array.from(new Set([...next.linkedPublishedIds, item.id]))
      next.lastPublishedAt =
        !next.lastPublishedAt || itemTimestamp(item) > Date.parse(next.lastPublishedAt || 0)
          ? new Date(itemTimestamp(item) || Date.now()).toISOString()
          : next.lastPublishedAt
      next.timeline = mergeTimeline(
        next,
        createTimelineEntry('published', item, item.publishResult?.internal?.detail || '내부 게시됨'),
      )
    } else {
      if (item.status !== 'skipped' && item.status !== 'disabled') {
        next.draftCount += 1
      }
      if (item.id) {
        next.linkedDraftIds = Array.from(new Set([...next.linkedDraftIds, item.id]))
      }
      next.timeline = mergeTimeline(
        next,
        createTimelineEntry(
          item.status === 'skipped' ? 'skipped' : item.status === 'scheduled' ? 'scheduled' : 'draft',
          item,
          item.skipReason || item.errorReason || item.status,
        ),
      )
    }

    const preferredCandidates = [item, existing.preferredItem].filter(Boolean)
    next.preferredItem = preferredCandidates.sort((left, right) => itemTimestamp(right) - itemTimestamp(left))[0]

    map.set(dossierKey, next)
  }

  for (const item of published) {
    upsert(item, 'published')
  }

  for (const item of queue) {
    upsert(item, 'draft')
  }

  for (const log of logs) {
    if (!log.draftId) {
      continue
    }

    const dossier = Array.from(map.values()).find((item) => item.linkedDraftIds.includes(log.draftId))
    if (!dossier) {
      continue
    }

    dossier.timeline = mergeTimeline(dossier, {
      id: `log-${log.id}`,
      kind: 'log',
      createdAt: log.createdAt,
      title: log.action,
      provider: '',
      detail: log.message,
      sourceUrl: '',
      linkedId: log.draftId,
    })
  }

  return Array.from(map.values())
    .map((dossier) => {
      const preferred = dossier.preferredItem || dossier.sourceItems[0] || {}
      const source = extractSource(preferred)
      const rawBody = firstNonEmpty(
        preferred.body,
        preferred.generatedText,
        preferred.excerpt,
        source.abstractOrSnippet,
        preferred.sourceSummary,
      )
      const paragraphs = extractParagraphs(rawBody)
      const firstParagraph = paragraphs[0] || rawBody

      const status = dossier.publishedCount > 0 ? 'published' : dossier.draftCount > 0 ? 'tracking' : 'emerging'

      return {
        id: dossier.id,
        dossierKey: dossier.dossierKey,
        slug: dossier.slug,
        title: firstNonEmpty(preferred.title, preferred.sourceTitle, source.title, '새로운 이슈 묶음'),
        summary: compactText(firstParagraph, 280),
        lead: buildLead(preferred, dossier),
        status,
        sourceType: dossier.sourceType,
        providerLabels: dossier.providerLabels,
        tags: dossier.tags.slice(0, 8),
        sourceCount: dossier.sourceItems.length,
        draftCount: dossier.draftCount,
        publishedCount: dossier.publishedCount,
        lastUpdatedAt: dossier.lastUpdatedAt,
        lastPublishedAt: dossier.lastPublishedAt,
        keyPoints: extractKeyPoints(rawBody, 4),
        sourceItems: dossier.sourceItems
          .sort((left, right) => Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0))
          .slice(0, 8),
        linkedDraftIds: dossier.linkedDraftIds,
        linkedPublishedIds: dossier.linkedPublishedIds,
        timeline: dossier.timeline
          .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0))
          .slice(0, 14),
      }
    })
    .sort((left, right) => Date.parse(right.lastUpdatedAt || 0) - Date.parse(left.lastUpdatedAt || 0))
}
