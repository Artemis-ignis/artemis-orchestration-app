import { nowIso, parseBooleanFlag } from '../auto-posts/normalize.mjs'

function parseInteger(value, fallback, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.max(minimum, Math.min(maximum, Math.round(numeric)))
}

function parseFloatValue(value, fallback, { minimum = 0, maximum = 1 } = {}) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.max(minimum, Math.min(maximum, numeric))
}

function normalizeMode(value, fallback = 'approval') {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (normalized === 'dry' || normalized === 'dryrun') {
    return 'dry-run'
  }

  if (normalized === 'dry-run' || normalized === 'approval' || normalized === 'auto') {
    return normalized
  }

  return fallback
}

function parseFeeds(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
  }

  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return []
  }

  try {
    const parsed = JSON.parse(normalized)
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    }
  } catch {
    // Fall through to string splitting.
  }

  return normalized
    .split(/[\r\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseString(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

export function createDefaultPublisherSettings() {
  const rssFeeds = parseFeeds(process.env.INGEST_RSS_FEEDS)
  const newsApiKey = parseString(process.env.NEWSAPI_KEY)

  return {
    mode: normalizeMode(process.env.AUTOPOST_MODE, 'approval'),
    publishInternalEnabled: parseBooleanFlag(process.env.PUBLISH_INTERNAL_ENABLED, true),
    publishXEnabled: parseBooleanFlag(process.env.PUBLISH_X_ENABLED, false),
    maxPerHour: parseInteger(process.env.PUBLISH_MAX_PER_HOUR, 10, { minimum: 1, maximum: 24 }),
    minIntervalMinutes: parseInteger(process.env.PUBLISH_MIN_INTERVAL_MINUTES, 6, {
      minimum: 1,
      maximum: 240,
    }),
    maxPerDay: parseInteger(process.env.PUBLISH_MAX_PER_DAY, 120, { minimum: 1, maximum: 500 }),
    requireSourceUrl: parseBooleanFlag(process.env.AUTOPOST_REQUIRE_SOURCE_URL, true),
    requireUniqueTopic: parseBooleanFlag(process.env.AUTOPOST_REQUIRE_UNIQUE_TOPIC, true),
    minNoveltyScore: parseFloatValue(process.env.AUTOPOST_MIN_NOVELTY_SCORE, 0.72, {
      minimum: 0,
      maximum: 1,
    }),
    blockNearDuplicates: parseBooleanFlag(process.env.AUTOPOST_BLOCK_NEAR_DUPLICATES, true),
    outputDir: parseString(process.env.PUBLISH_OUTPUT_DIR, 'publisher'),
    generationModel: parseString(process.env.PUBLISH_GENERATION_MODEL || process.env.AUTOPOST_GENERATION_MODEL, 'gpt-5.4-mini'),
    startupDelayMs: parseInteger(process.env.PUBLISH_STARTUP_DELAY_MS, 15_000, {
      minimum: 5_000,
      maximum: 60_000,
    }),
    schedulerPollMs: parseInteger(process.env.PUBLISH_SCHEDULER_POLL_MS, 60_000, {
      minimum: 15_000,
      maximum: 10 * 60_000,
    }),
    topicCooldownHours: parseInteger(process.env.PUBLISH_TOPIC_COOLDOWN_HOURS, 48, {
      minimum: 1,
      maximum: 24 * 30,
    }),
    retryLimit: parseInteger(process.env.PUBLISH_RETRY_LIMIT, 3, { minimum: 0, maximum: 8 }),
    retryBackoffMinutes: parseInteger(process.env.PUBLISH_RETRY_BACKOFF_MINUTES, 12, {
      minimum: 1,
      maximum: 240,
    }),
    maxQueueItems: parseInteger(process.env.PUBLISH_MAX_QUEUE_ITEMS, 500, {
      minimum: 50,
      maximum: 3_000,
    }),
    ingestArxivEnabled: parseBooleanFlag(process.env.INGEST_ARXIV_ENABLED, true),
    ingestCrossrefEnabled: parseBooleanFlag(process.env.INGEST_CROSSREF_ENABLED, true),
    ingestSemanticScholarEnabled: parseBooleanFlag(process.env.INGEST_SEMANTIC_SCHOLAR_ENABLED, true),
    ingestNewsApiEnabled: parseBooleanFlag(process.env.INGEST_NEWSAPI_ENABLED, Boolean(newsApiKey)),
    newsApiKey,
    ingestRssEnabled: parseBooleanFlag(process.env.INGEST_RSS_ENABLED, rssFeeds.length > 0),
    rssFeeds,
    ingestLegacySignalsEnabled: parseBooleanFlag(process.env.INGEST_LEGACY_SIGNALS_ENABLED, true),
    ingestQuery: parseString(
      process.env.INGEST_QUERY,
      'artificial intelligence large language model agent multimodal open source research',
    ),
    defaultQueueLimit: parseInteger(process.env.PUBLISH_DEFAULT_QUEUE_LIMIT, 3, {
      minimum: 1,
      maximum: 20,
    }),
  }
}

export function mergePublisherSettings(current, patch = {}) {
  return {
    ...current,
    mode: patch.mode === undefined ? current.mode : normalizeMode(patch.mode, current.mode),
    publishInternalEnabled:
      patch.publishInternalEnabled === undefined
        ? current.publishInternalEnabled
        : parseBooleanFlag(patch.publishInternalEnabled, current.publishInternalEnabled),
    publishXEnabled:
      patch.publishXEnabled === undefined
        ? current.publishXEnabled
        : parseBooleanFlag(patch.publishXEnabled, current.publishXEnabled),
    maxPerHour:
      patch.maxPerHour === undefined
        ? current.maxPerHour
        : parseInteger(patch.maxPerHour, current.maxPerHour, { minimum: 1, maximum: 24 }),
    minIntervalMinutes:
      patch.minIntervalMinutes === undefined
        ? current.minIntervalMinutes
        : parseInteger(patch.minIntervalMinutes, current.minIntervalMinutes, { minimum: 1, maximum: 240 }),
    maxPerDay:
      patch.maxPerDay === undefined
        ? current.maxPerDay
        : parseInteger(patch.maxPerDay, current.maxPerDay, { minimum: 1, maximum: 500 }),
    requireSourceUrl:
      patch.requireSourceUrl === undefined
        ? current.requireSourceUrl
        : parseBooleanFlag(patch.requireSourceUrl, current.requireSourceUrl),
    requireUniqueTopic:
      patch.requireUniqueTopic === undefined
        ? current.requireUniqueTopic
        : parseBooleanFlag(patch.requireUniqueTopic, current.requireUniqueTopic),
    minNoveltyScore:
      patch.minNoveltyScore === undefined
        ? current.minNoveltyScore
        : parseFloatValue(patch.minNoveltyScore, current.minNoveltyScore, { minimum: 0, maximum: 1 }),
    blockNearDuplicates:
      patch.blockNearDuplicates === undefined
        ? current.blockNearDuplicates
        : parseBooleanFlag(patch.blockNearDuplicates, current.blockNearDuplicates),
    outputDir:
      typeof patch.outputDir === 'string' && patch.outputDir.trim() ? patch.outputDir.trim() : current.outputDir,
    generationModel:
      typeof patch.generationModel === 'string' && patch.generationModel.trim()
        ? patch.generationModel.trim()
        : current.generationModel,
    startupDelayMs:
      patch.startupDelayMs === undefined
        ? current.startupDelayMs
        : parseInteger(patch.startupDelayMs, current.startupDelayMs, { minimum: 5_000, maximum: 60_000 }),
    schedulerPollMs:
      patch.schedulerPollMs === undefined
        ? current.schedulerPollMs
        : parseInteger(patch.schedulerPollMs, current.schedulerPollMs, {
            minimum: 15_000,
            maximum: 10 * 60_000,
          }),
    topicCooldownHours:
      patch.topicCooldownHours === undefined
        ? current.topicCooldownHours
        : parseInteger(patch.topicCooldownHours, current.topicCooldownHours, {
            minimum: 1,
            maximum: 24 * 30,
          }),
    retryLimit:
      patch.retryLimit === undefined
        ? current.retryLimit
        : parseInteger(patch.retryLimit, current.retryLimit, { minimum: 0, maximum: 8 }),
    retryBackoffMinutes:
      patch.retryBackoffMinutes === undefined
        ? current.retryBackoffMinutes
        : parseInteger(patch.retryBackoffMinutes, current.retryBackoffMinutes, { minimum: 1, maximum: 240 }),
    maxQueueItems:
      patch.maxQueueItems === undefined
        ? current.maxQueueItems
        : parseInteger(patch.maxQueueItems, current.maxQueueItems, { minimum: 50, maximum: 3_000 }),
    ingestArxivEnabled:
      patch.ingestArxivEnabled === undefined
        ? current.ingestArxivEnabled
        : parseBooleanFlag(patch.ingestArxivEnabled, current.ingestArxivEnabled),
    ingestCrossrefEnabled:
      patch.ingestCrossrefEnabled === undefined
        ? current.ingestCrossrefEnabled
        : parseBooleanFlag(patch.ingestCrossrefEnabled, current.ingestCrossrefEnabled),
    ingestSemanticScholarEnabled:
      patch.ingestSemanticScholarEnabled === undefined
        ? current.ingestSemanticScholarEnabled
        : parseBooleanFlag(patch.ingestSemanticScholarEnabled, current.ingestSemanticScholarEnabled),
    ingestNewsApiEnabled:
      patch.ingestNewsApiEnabled === undefined
        ? current.ingestNewsApiEnabled
        : parseBooleanFlag(patch.ingestNewsApiEnabled, current.ingestNewsApiEnabled),
    newsApiKey:
      typeof patch.newsApiKey === 'string' ? patch.newsApiKey.trim() : current.newsApiKey,
    ingestRssEnabled:
      patch.ingestRssEnabled === undefined
        ? current.ingestRssEnabled
        : parseBooleanFlag(patch.ingestRssEnabled, current.ingestRssEnabled),
    rssFeeds:
      patch.rssFeeds === undefined ? current.rssFeeds : parseFeeds(patch.rssFeeds),
    ingestLegacySignalsEnabled:
      patch.ingestLegacySignalsEnabled === undefined
        ? current.ingestLegacySignalsEnabled
        : parseBooleanFlag(patch.ingestLegacySignalsEnabled, current.ingestLegacySignalsEnabled),
    ingestQuery:
      typeof patch.ingestQuery === 'string' && patch.ingestQuery.trim()
        ? patch.ingestQuery.trim()
        : current.ingestQuery,
    defaultQueueLimit:
      patch.defaultQueueLimit === undefined
        ? current.defaultQueueLimit
        : parseInteger(patch.defaultQueueLimit, current.defaultQueueLimit, { minimum: 1, maximum: 20 }),
  }
}

export function createDefaultPublisherState(settings) {
  return {
    lastIngestRunAt: null,
    lastPublishAttemptAt: null,
    lastPublishedAt: null,
    nextIngestAt:
      settings.mode !== 'dry-run'
        ? new Date(Date.now() + settings.minIntervalMinutes * 60_000).toISOString()
        : null,
    nextPublishAt: null,
    inProgress: false,
    lastError: '',
    lastDraftId: null,
    publishedDraftIds: [],
    skippedDraftIds: [],
    providerStats: [],
    updatedAt: nowIso(),
  }
}

export function createDefaultPublisherLogs() {
  return []
}

export function createDefaultPublisherQueue() {
  return []
}

export function createDefaultPublishedPosts() {
  return []
}
