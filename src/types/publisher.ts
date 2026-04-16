export type PublisherMode = 'dry-run' | 'approval' | 'auto'

export type ContentSourceType = 'paper' | 'news' | 'feed'

export type PublishTarget = 'internal' | 'x'

export type PublisherDraftStatus =
  | 'draft'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'disabled'

export type NormalizedContentItem = {
  id: string
  sourceType: ContentSourceType
  provider: string
  canonicalUrl: string
  sourceUrl: string
  title: string
  subtitle: string
  authors: string[]
  publishedAt: string
  abstractOrSnippet: string
  language: string
  doi: string
  arxivId: string
  tags: string[]
  score: number
  topicHash: string
  rawMeta: Record<string, unknown>
}

export type PublisherSettings = {
  mode: PublisherMode
  publishInternalEnabled: boolean
  publishXEnabled: boolean
  maxPerHour: number
  minIntervalMinutes: number
  maxPerDay: number
  requireSourceUrl: boolean
  requireUniqueTopic: boolean
  minNoveltyScore: number
  blockNearDuplicates: boolean
  outputDir: string
  generationModel: string
  startupDelayMs: number
  schedulerPollMs: number
  topicCooldownHours: number
  retryLimit: number
  retryBackoffMinutes: number
  maxQueueItems: number
  ingestArxivEnabled: boolean
  ingestCrossrefEnabled: boolean
  ingestSemanticScholarEnabled: boolean
  ingestNewsApiEnabled: boolean
  newsApiKey: string
  ingestRssEnabled: boolean
  rssFeeds: string[]
  ingestLegacySignalsEnabled: boolean
  ingestQuery: string
  defaultQueueLimit: number
}

export type ProviderRuntimeStat = {
  provider: string
  label: string
  sourceType: ContentSourceType | 'mixed'
  enabled: boolean
  lastFetchedAt: string | null
  lastFetchedCount: number
  lastDraftCount: number
  lastSkippedCount: number
  lastError: string
}

export type PublisherState = {
  lastIngestRunAt: string | null
  lastPublishAttemptAt: string | null
  lastPublishedAt: string | null
  nextIngestAt: string | null
  nextPublishAt: string | null
  inProgress: boolean
  lastError: string
  lastDraftId: string | null
  publishedDraftIds: string[]
  skippedDraftIds: string[]
  providerStats: ProviderRuntimeStat[]
  updatedAt: string
}

export type PublisherDraft = {
  id: string
  createdAt: string
  updatedAt: string
  status: PublisherDraftStatus
  provider: string
  sourceLabel: string
  sourceType: ContentSourceType
  category: string
  sourceTitle: string
  sourceSummary: string
  sourceUrl: string
  canonicalUrl: string
  subtitle: string
  authors: string[]
  sourcePublishedAt: string | null
  publishedAt: string | null
  language: string
  doi: string
  arxivId: string
  tags: string[]
  topicHash: string
  noveltyScore: number
  generatedText: string
  summaryType: 'breaking' | 'brief-points' | 'paper-intro'
  scheduledAt: string | null
  publishTarget: PublishTarget
  crossPostToX: boolean
  errorReason: string | null
  skipReason: string | null
  promptVersion: string
  generationModel: string
  publishResult: Record<string, unknown> | null
  internalPostId: string | null
  xPostId: string | null
  sourceMeta: NormalizedContentItem
  approvedAt: string | null
  attempts: number
  lastAttemptAt: string | null
  retryCount: number
  nextRetryAt: string | null
}

export type PublisherLog = {
  id: string
  createdAt: string
  level: 'info' | 'success' | 'warning' | 'error'
  action: string
  message: string
  draftId: string | null
  meta: Record<string, unknown> | null
}

export type PublishedPost = {
  id: string
  draftId: string
  title: string
  excerpt: string
  body: string
  summaryType: 'breaking' | 'brief-points' | 'paper-intro'
  provider: string
  sourceLabel?: string
  sourceType: ContentSourceType
  category?: string
  sourceUrl: string
  canonicalUrl: string
  authors: string[]
  tags: string[]
  publishedAt: string
  createdAt: string
  sourceMeta: NormalizedContentItem | null
  publishResult: Record<string, unknown> | null
}

export type PublisherRuntimeStatus = {
  target: PublishTarget
  enabled: boolean
  configured: boolean
  ready: boolean
  detail: string
  authMode?: string
}

export type PublisherMetrics = {
  draftCount: number
  approvedCount: number
  scheduledCount: number
  publishedCount24h: number
  publishedCount1h: number
  failedCount: number
  providerCounts24h: Array<{
    provider: string
    label?: string
    enabled?: boolean
    fetchedCount24h: number
    draftCount24h: number
    publishedCount24h: number
    lastFetchedAt?: string | null
    lastError?: string
  }>
  recentFailures: Array<{
    id: string
    sourceTitle: string
    errorReason: string | null
    updatedAt: string
  }>
  publishers: PublisherRuntimeStatus[]
}

export type PublisherStateResponse = {
  ok: boolean
  settings: PublisherSettings
  state: PublisherState
  queue: PublisherDraft[]
  logs: PublisherLog[]
  published: PublishedPost[]
  metrics: PublisherMetrics
  publishers: PublisherRuntimeStatus[]
}

export type PublisherRunResponse = {
  ok: boolean
  createdCount: number
  skippedCount: number
  items: PublisherDraft[]
  skipped: PublisherDraft[]
  state: PublisherState
  queue: PublisherDraft[]
  logs: PublisherLog[]
  published: PublishedPost[]
}

export type PublisherDraftActionResponse = {
  ok: boolean
  item: PublisherDraft
  state: PublisherState
  simulated?: boolean
  detail?: string | null
  error?: {
    status?: number
    message?: string
    payload?: unknown
  }
}
