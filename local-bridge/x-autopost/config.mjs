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

export function createDefaultXAutopostSettings() {
  return {
    mode: normalizeMode(process.env.AUTOPOST_MODE, 'approval'),
    maxPerHour: parseInteger(process.env.AUTOPOST_MAX_PER_HOUR, 10, { minimum: 1, maximum: 24 }),
    minIntervalMinutes: parseInteger(process.env.AUTOPOST_MIN_INTERVAL_MINUTES, 6, {
      minimum: 1,
      maximum: 240,
    }),
    maxPerDay: parseInteger(process.env.AUTOPOST_MAX_PER_DAY, 120, { minimum: 1, maximum: 500 }),
    requireSourceUrl: parseBooleanFlag(process.env.AUTOPOST_REQUIRE_SOURCE_URL, true),
    requireUniqueTopic: parseBooleanFlag(process.env.AUTOPOST_REQUIRE_UNIQUE_TOPIC, true),
    minNoveltyScore: parseFloatValue(process.env.AUTOPOST_MIN_NOVELTY_SCORE, 0.72, {
      minimum: 0,
      maximum: 1,
    }),
    blockNearDuplicates: parseBooleanFlag(process.env.AUTOPOST_BLOCK_NEAR_DUPLICATES, true),
    outputDir: String(process.env.AUTOPOST_OUTPUT_DIR ?? 'x-autopost').trim() || 'x-autopost',
    generationModel:
      String(process.env.AUTOPOST_GENERATION_MODEL ?? 'gpt-5.4-mini').trim() || 'gpt-5.4-mini',
    startupDelayMs: parseInteger(process.env.AUTOPOST_STARTUP_DELAY_MS, 15_000, {
      minimum: 5_000,
      maximum: 60_000,
    }),
    schedulerPollMs: parseInteger(process.env.AUTOPOST_SCHEDULER_POLL_MS, 60_000, {
      minimum: 15_000,
      maximum: 10 * 60_000,
    }),
    topicCooldownHours: parseInteger(process.env.AUTOPOST_TOPIC_COOLDOWN_HOURS, 48, {
      minimum: 1,
      maximum: 24 * 30,
    }),
    retryLimit: parseInteger(process.env.AUTOPOST_RETRY_LIMIT, 3, { minimum: 0, maximum: 8 }),
    retryBackoffMinutes: parseInteger(process.env.AUTOPOST_RETRY_BACKOFF_MINUTES, 12, {
      minimum: 1,
      maximum: 240,
    }),
    maxQueueItems: parseInteger(process.env.AUTOPOST_MAX_QUEUE_ITEMS, 400, {
      minimum: 50,
      maximum: 2_000,
    }),
  }
}

export function mergeXAutopostSettings(current, patch = {}) {
  return {
    ...current,
    mode: patch.mode === undefined ? current.mode : normalizeMode(patch.mode, current.mode),
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
        : parseInteger(patch.maxQueueItems, current.maxQueueItems, { minimum: 50, maximum: 2_000 }),
  }
}

export function createDefaultXAutopostState(settings) {
  return {
    lastDraftRunAt: null,
    lastPublishAttemptAt: null,
    lastPostedAt: null,
    nextGenerationAt:
      settings.mode !== 'dry-run'
        ? new Date(Date.now() + settings.minIntervalMinutes * 60_000).toISOString()
        : null,
    nextPublishAt: null,
    inProgress: false,
    lastError: '',
    lastDraftId: null,
    postedDraftIds: [],
    skippedDraftIds: [],
    updatedAt: nowIso(),
  }
}

export function createDefaultXAutopostLogs() {
  return []
}

export function createDefaultXAutopostQueue() {
  return []
}
