import { canonicalizeUrl, hashText, nowIso } from '../auto-posts/normalize.mjs'

const BANNED_PATTERNS = [
  /무조건/gi,
  /확실히/gi,
  /절대 놓치면 안/gi,
  /충격/gi,
  /혁명적/gi,
  /대박/gi,
  /지금 안 보면/gi,
]

const GENERIC_PATTERNS = [
  /^ai 관련 소식/i,
  /^오늘의 ai/i,
  /^방금 올라온 소식/i,
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

function buildTopicSeed(item = {}) {
  const canonicalUrl = canonicalizeUrl(item.sourceUrl || item.url || item.rawMeta?.externalUrl || '')
  const titleTokens = uniqueTokens(item.sourceTitle || item.title || '').slice(0, 12).sort()
  const summaryTokens = uniqueTokens(item.summary || '').slice(0, 12).sort()
  return [canonicalUrl, ...titleTokens, ...summaryTokens].join('|')
}

export function buildTopicHash(item = {}) {
  return hashText(buildTopicSeed(item))
}

function hasRecentTopic(queue = [], topicHash = '', cooldownHours = 48) {
  const cutoff = Date.now() - cooldownHours * 60 * 60 * 1000
  return queue.some((item) => {
    if (item.topicHash !== topicHash) {
      return false
    }

    const relevantAt = Date.parse(item.postedAt || item.scheduledAt || item.createdAt || 0)
    return Number.isFinite(relevantAt) && relevantAt >= cutoff
  })
}

function hasSourceUrl(queue = [], sourceUrl = '') {
  const normalized = canonicalizeUrl(sourceUrl)
  if (!normalized) {
    return false
  }

  return queue.some((item) => canonicalizeUrl(item.sourceUrl) === normalized)
}

export function calculateNoveltyScore(sourceItem, queue = []) {
  const sourceText = `${sourceItem.sourceTitle || sourceItem.title || ''} ${sourceItem.summary || ''}`.trim()
  if (!sourceText) {
    return 0
  }

  let maxSimilarity = 0
  for (const item of queue) {
    const comparison = `${item.sourceTitle || ''} ${item.generatedText || ''}`.trim()
    maxSimilarity = Math.max(maxSimilarity, jaccardSimilarity(sourceText, comparison))
  }

  return Number(Math.max(0, 1 - maxSimilarity).toFixed(3))
}

export function validateDraftCandidate({ sourceItem, queue, settings }) {
  const topicHash = buildTopicHash(sourceItem)
  const sourceUrl = canonicalizeUrl(sourceItem.sourceUrl || sourceItem.url || '')
  const noveltyScore = calculateNoveltyScore(sourceItem, queue)

  if (settings.requireSourceUrl && !sourceUrl) {
    return { ok: false, reason: '출처 URL이 없어 자동 게시 후보에서 제외했습니다.', topicHash, noveltyScore }
  }

  if (sourceUrl && hasSourceUrl(queue, sourceUrl)) {
    return { ok: false, reason: '같은 source url이 이미 큐 또는 게시 이력에 있습니다.', topicHash, noveltyScore: 0 }
  }

  if (settings.requireUniqueTopic && hasRecentTopic(queue, topicHash, settings.topicCooldownHours)) {
    return { ok: false, reason: '같은 topic hash가 최근 쿨다운 안에 이미 처리되었습니다.', topicHash, noveltyScore: 0 }
  }

  if (noveltyScore < settings.minNoveltyScore) {
    return {
      ok: false,
      reason: `novelty score ${noveltyScore.toFixed(2)}가 최소 기준보다 낮습니다.`,
      topicHash,
      noveltyScore,
    }
  }

  return { ok: true, topicHash, noveltyScore, sourceUrl }
}

export function validateGeneratedDraft({ text, draft, queue, settings }) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const similarityAgainstQueue = queue.reduce(
    (best, item) => Math.max(best, jaccardSimilarity(normalized, item.generatedText || '')),
    0,
  )

  if (!normalized) {
    return { ok: false, reason: '생성 결과가 비어 있습니다.', similarityScore: similarityAgainstQueue }
  }

  if (normalized.length < 48) {
    return { ok: false, reason: '게시글이 너무 짧습니다.', similarityScore: similarityAgainstQueue }
  }

  if (uniqueTokens(normalized).length < 8) {
    return { ok: false, reason: '게시글 정보 밀도가 너무 낮습니다.', similarityScore: similarityAgainstQueue }
  }

  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.test(normalized)) {
      return { ok: false, reason: '너무 일반적인 문구 패턴이라 차단했습니다.', similarityScore: similarityAgainstQueue }
    }
  }

  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(normalized)) {
      return { ok: false, reason: '과장되거나 단정적인 금지 표현이 포함되어 있습니다.', similarityScore: similarityAgainstQueue }
    }
  }

  if (settings.requireSourceUrl && draft.sourceUrl && !normalized.includes(draft.sourceUrl)) {
    return { ok: false, reason: '출처 링크가 누락되었습니다.', similarityScore: similarityAgainstQueue }
  }

  if (settings.blockNearDuplicates && similarityAgainstQueue >= 0.82) {
    return {
      ok: false,
      reason: '기존 큐와 너무 유사한 문장 패턴이라 차단했습니다.',
      similarityScore: similarityAgainstQueue,
    }
  }

  return { ok: true, similarityScore: similarityAgainstQueue }
}

export function createQueueLog(level, action, message, draftId = null, meta = null) {
  return {
    id: `x-autopost-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso(),
    level,
    action,
    message,
    draftId,
    meta,
  }
}
