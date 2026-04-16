import { canonicalizeUrl, hashText, nowIso, slugify } from '../auto-posts/normalize.mjs'

const GENERIC_TITLE_PATTERNS = [
  /^ai news/i,
  /^today'?s ai/i,
  /^breaking ai/i,
  /^latest ai/i,
]

const BANNED_PATTERNS = [
  /must see/i,
  /guaranteed/i,
  /shocking/i,
  /revolutionary/i,
  /cannot miss/i,
  /무조건/,
  /확정/,
  /충격/,
  /혁명적/,
]

function tokenize(value = '') {
  return String(value ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
}

function uniqueTokens(value = '') {
  return Array.from(new Set(tokenize(value)))
}

function normalizeTitle(value = '') {
  return uniqueTokens(value).slice(0, 16).sort().join(' ')
}

function titleSimilarity(left = '', right = '') {
  return jaccardSimilarity(normalizeTitle(left), normalizeTitle(right))
}

export function jaccardSimilarity(left = '', right = '') {
  const leftTokens = new Set(uniqueTokens(left))
  const rightTokens = new Set(uniqueTokens(right))

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0
  }

  let overlap = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1
    }
  }

  return overlap / (leftTokens.size + rightTokens.size - overlap)
}

export function buildTopicHash(item = {}) {
  const parts = [
    canonicalizeUrl(item.canonicalUrl || item.sourceUrl || ''),
    String(item.doi || '').trim().toLowerCase(),
    String(item.arxivId || '').trim().toLowerCase(),
    normalizeTitle(item.title || item.sourceTitle || ''),
    uniqueTokens(item.abstractOrSnippet || item.sourceSummary || '').slice(0, 18).sort().join(' '),
  ].filter(Boolean)

  return hashText(parts.join('|') || slugify(item.title || 'content'))
}

function hasRecentTopic(items = [], topicHash = '', cooldownHours = 48) {
  const cutoff = Date.now() - cooldownHours * 60 * 60 * 1000
  return items.some((item) => {
    if (item.topicHash !== topicHash) {
      return false
    }

    const relevantAt = Date.parse(item.publishedAt || item.scheduledAt || item.createdAt || 0)
    return Number.isFinite(relevantAt) && relevantAt >= cutoff
  })
}

function extractComparisonFields(item = {}) {
  return {
    canonicalUrl: canonicalizeUrl(item.canonicalUrl || item.sourceUrl || item.sourceMeta?.canonicalUrl || ''),
    doi: String(item.doi || item.sourceMeta?.doi || '').trim().toLowerCase(),
    arxivId: String(item.arxivId || item.sourceMeta?.arxivId || '').trim().toLowerCase(),
    title: String(item.title || item.sourceTitle || '').trim(),
    topicHash: String(item.topicHash || '').trim(),
  }
}

export function calculateNoveltyScore(sourceItem, items = []) {
  const sourceText = `${sourceItem.title || sourceItem.sourceTitle || ''} ${sourceItem.abstractOrSnippet || sourceItem.sourceSummary || ''}`.trim()
  if (!sourceText) {
    return 0
  }

  let maxSimilarity = 0
  for (const item of items) {
    const comparison = `${item.title || item.sourceTitle || ''} ${item.generatedText || item.abstractOrSnippet || item.sourceSummary || ''}`.trim()
    maxSimilarity = Math.max(maxSimilarity, jaccardSimilarity(sourceText, comparison))
  }

  return Number(Math.max(0, 1 - maxSimilarity).toFixed(3))
}

function hasDuplicateIdentity(sourceItem, items = []) {
  const target = extractComparisonFields(sourceItem)

  return items.find((item) => {
    const comparison = extractComparisonFields(item)
    if (target.canonicalUrl && comparison.canonicalUrl && target.canonicalUrl === comparison.canonicalUrl) {
      return true
    }
    if (target.doi && comparison.doi && target.doi === comparison.doi) {
      return true
    }
    if (target.arxivId && comparison.arxivId && target.arxivId === comparison.arxivId) {
      return true
    }
    return false
  })
}

function hasNearTitleDuplicate(sourceItem, items = []) {
  const sourceTitle = String(sourceItem.title || '').trim()
  if (!sourceTitle) {
    return null
  }

  return items.find((item) => titleSimilarity(sourceTitle, item.title || item.sourceTitle || '') >= 0.92) ?? null
}

export function validateNormalizedCandidate({ sourceItem, existingItems, settings }) {
  const topicHash = buildTopicHash(sourceItem)
  const noveltyScore = calculateNoveltyScore(sourceItem, existingItems)
  const candidate = {
    ...sourceItem,
    topicHash,
    noveltyScore,
  }

  if (settings.requireSourceUrl && !canonicalizeUrl(sourceItem.canonicalUrl || sourceItem.sourceUrl || '')) {
    return { ok: false, reason: '출처 URL이 없어 큐에 넣지 않습니다.', topicHash, noveltyScore }
  }

  const duplicateIdentity = hasDuplicateIdentity(candidate, existingItems)
  if (duplicateIdentity) {
    return {
      ok: false,
      reason: '같은 원문 식별자(URL/DOI/arXiv ID)가 이미 큐 또는 게시 이력에 있습니다.',
      topicHash,
      noveltyScore: 0,
    }
  }

  const duplicateTitle = hasNearTitleDuplicate(candidate, existingItems)
  if (duplicateTitle) {
    return {
      ok: false,
      reason: '제목이 매우 유사한 항목이 이미 존재합니다.',
      topicHash,
      noveltyScore: Math.min(noveltyScore, 0.15),
    }
  }

  if (settings.requireUniqueTopic && hasRecentTopic(existingItems, topicHash, settings.topicCooldownHours)) {
    return {
      ok: false,
      reason: '같은 topic hash가 최근 게시 또는 예약 이력에 존재합니다.',
      topicHash,
      noveltyScore: 0,
    }
  }

  if (noveltyScore < settings.minNoveltyScore) {
    return {
      ok: false,
      reason: `novelty score ${noveltyScore.toFixed(2)}가 기준보다 낮습니다.`,
      topicHash,
      noveltyScore,
    }
  }

  const title = String(sourceItem.title || '').trim()
  const summary = String(sourceItem.abstractOrSnippet || '').trim()
  if (title.length < 12) {
    return { ok: false, reason: '제목 정보가 너무 짧아 초안 생성을 건너뜁니다.', topicHash, noveltyScore }
  }

  if (uniqueTokens(`${title} ${summary}`).length < 8) {
    return { ok: false, reason: '메타데이터 정보량이 부족해 초안 생성을 건너뜁니다.', topicHash, noveltyScore }
  }

  return { ok: true, topicHash, noveltyScore }
}

export function validateGeneratedDraft({ text, draft, existingItems, settings }) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const similarityAgainstQueue = existingItems.reduce(
    (best, item) => Math.max(best, jaccardSimilarity(normalized, item.generatedText || '')),
    0,
  )

  if (!normalized) {
    return { ok: false, reason: '생성 결과가 비어 있습니다.', similarityScore: similarityAgainstQueue }
  }

  if (normalized.length < 80) {
    return { ok: false, reason: '게시글 초안이 너무 짧습니다.', similarityScore: similarityAgainstQueue }
  }

  if (uniqueTokens(normalized).length < 12) {
    return { ok: false, reason: '게시글 초안의 정보량이 부족합니다.', similarityScore: similarityAgainstQueue }
  }

  for (const pattern of GENERIC_TITLE_PATTERNS) {
    if (pattern.test(normalized)) {
      return { ok: false, reason: '너무 일반적인 문장 패턴이라 차단합니다.', similarityScore: similarityAgainstQueue }
    }
  }

  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(normalized)) {
      return { ok: false, reason: '과장되거나 단정적인 표현이 포함되어 있습니다.', similarityScore: similarityAgainstQueue }
    }
  }

  if (settings.requireSourceUrl && draft.sourceUrl && !normalized.includes(draft.sourceUrl)) {
    return { ok: false, reason: '출처 링크가 본문에 포함되지 않았습니다.', similarityScore: similarityAgainstQueue }
  }

  if (settings.blockNearDuplicates && similarityAgainstQueue >= 0.82) {
    return {
      ok: false,
      reason: '기존 게시글과 문장 패턴이 지나치게 유사합니다.',
      similarityScore: similarityAgainstQueue,
    }
  }

  return { ok: true, similarityScore: similarityAgainstQueue }
}

export function rankNormalizedItems(items = []) {
  return [...items]
    .map((item) => {
      const publishedTime = Date.parse(item.publishedAt || 0)
      const ageHours = Number.isFinite(publishedTime) ? Math.max(0, (Date.now() - publishedTime) / 3_600_000) : 48
      const recency = Math.max(0, 42 - ageHours * 0.8)
      const metadataRichness = Math.min(20, (item.abstractOrSnippet?.length || 0) / 18 + (item.authors?.length || 0) * 2)
      const providerWeight =
        item.provider === 'arxiv'
          ? 18
          : item.provider === 'semanticScholar'
            ? 17
            : item.provider === 'crossref'
              ? 15
              : item.provider === 'newsApi'
                ? 14
                : item.provider === 'rss'
                  ? 12
                  : item.provider === 'legacySignals'
                    ? 11
                    : 10
      const sourceTypeWeight = item.sourceType === 'paper' ? 16 : item.sourceType === 'news' ? 14 : 12
      const titleSignal = Math.min(10, uniqueTokens(item.title || '').length)
      const total = Math.max(0, Math.min(100, providerWeight + sourceTypeWeight + recency + metadataRichness + titleSignal))
      return {
        ...item,
        score: Number(total.toFixed(2)),
      }
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0)
    })
}

export function createPublisherLog(level, action, message, draftId = null, meta = null) {
  return {
    id: `publisher-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso(),
    level,
    action,
    message,
    draftId,
    meta,
  }
}
