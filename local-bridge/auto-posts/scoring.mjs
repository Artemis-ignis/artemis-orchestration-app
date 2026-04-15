import { detectSourceType, normalizeCategoryKey } from './normalize.mjs'

export const DEFAULT_CATEGORY_WEIGHTS = {
  ai: 1,
  research: 1.05,
  opensource: 0.98,
  business: 0.9,
}

const SOURCE_QUALITY_SCORES = {
  hackerNews: 14,
  github: 16,
  arxiv: 17,
  rss: 10,
  webpage: 8,
}

const RELEVANCE_KEYWORDS = [
  'ai',
  'artificial intelligence',
  'llm',
  'agent',
  'model',
  'open source',
  'inference',
  'reasoning',
  'multimodal',
  'transformer',
  'gpu',
  'machine learning',
  'deep learning',
  '연구',
  '모델',
  '에이전트',
  '생성형',
  '추론',
]

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function scoreRecency(publishedAt) {
  const publishedTime = Date.parse(publishedAt || '')
  if (!Number.isFinite(publishedTime)) {
    return 0
  }

  const ageHours = Math.max(0, (Date.now() - publishedTime) / 3_600_000)
  return clamp(36 - ageHours * 0.55, 0, 36)
}

function scoreAiRelevance(candidate) {
  const text = `${candidate.title ?? ''} ${candidate.summary ?? ''}`.toLowerCase()
  let score = 0

  for (const keyword of RELEVANCE_KEYWORDS) {
    if (text.includes(keyword)) {
      score += keyword.length > 6 ? 3 : 2
    }
  }

  return clamp(score, 0, 18)
}

function scoreCommunitySignals(candidate) {
  const sourceType = detectSourceType(candidate)
  const meta = candidate.rawMeta ?? {}

  if (sourceType === 'github') {
    const stars = Number(meta.stars ?? 0)
    const forks = Number(meta.forks ?? 0)
    const watchers = Number(meta.watchers ?? 0)
    return clamp(Math.log10(stars + 1) * 4 + Math.log10(forks + 1) * 3 + Math.log10(watchers + 1), 0, 18)
  }

  if (sourceType === 'hackerNews') {
    const points = Number(meta.points ?? 0)
    const comments = Number(meta.comments ?? 0)
    return clamp(Math.log10(points + 1) * 5 + Math.log10(comments + 1) * 4, 0, 16)
  }

  if (sourceType === 'arxiv') {
    const authors = Array.isArray(meta.authors) ? meta.authors.length : 0
    const primaryCategory = String(meta.primaryCategory ?? '')
    return clamp((authors > 0 ? 4 : 0) + (primaryCategory.startsWith('cs.') ? 6 : 3), 0, 12)
  }

  return 0
}

function scoreMediaReadiness(candidate) {
  const mediaCount = Array.isArray(candidate.mediaAttachments) ? candidate.mediaAttachments.length : 0
  if (mediaCount === 0) {
    return 0
  }

  const highestPriority = candidate.mediaAttachments.reduce(
    (best, item) => Math.max(best, Number(item.priority ?? 0)),
    0,
  )

  return clamp(mediaCount * 1.2 + highestPriority * 0.9, 0, 8)
}

function scoreCategoryBoost(candidate, categoryWeights) {
  const key = normalizeCategoryKey(candidate.category)
  const weight = Number(categoryWeights?.[key] ?? DEFAULT_CATEGORY_WEIGHTS[key] ?? 1)
  return clamp(weight * 8, 4, 12)
}

export function scoreSignalCandidate(candidate, options = {}) {
  const sourceType = detectSourceType(candidate)
  const sourceScore = SOURCE_QUALITY_SCORES[sourceType] ?? 8
  const recency = scoreRecency(candidate.publishedAt)
  const relevance = scoreAiRelevance(candidate)
  const community = scoreCommunitySignals(candidate)
  const categoryBoost = scoreCategoryBoost(candidate, options.categoryWeights)
  const mediaReadiness = scoreMediaReadiness(candidate)
  const freshnessPenalty = options.seenDedupeKeys?.has(candidate.dedupeKey) ? -18 : 0

  const total = clamp(
    sourceScore + recency + relevance + community + categoryBoost + mediaReadiness + freshnessPenalty,
    0,
    100,
  )

  return {
    total,
    breakdown: {
      sourceScore,
      recency,
      relevance,
      community,
      categoryBoost,
      mediaReadiness,
      freshnessPenalty,
    },
  }
}

export function rankSignalCandidates(candidates, options = {}) {
  return [...candidates]
    .map((candidate) => {
      const scored = scoreSignalCandidate(candidate, options)
      return {
        ...candidate,
        score: scored.total,
        scoreBreakdown: scored.breakdown,
      }
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0)
    })
}
