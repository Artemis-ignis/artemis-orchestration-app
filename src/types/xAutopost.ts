export type XAutopostMode = 'dry-run' | 'approval' | 'auto'

export type XAutopostStatus =
  | 'draft'
  | 'approved'
  | 'scheduled'
  | 'posted'
  | 'failed'
  | 'skipped'

export type XAutopostSettings = {
  mode: XAutopostMode
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
}

export type XAutopostDraft = {
  id: string
  createdAt: string
  updatedAt: string
  status: XAutopostStatus
  sourceUrl: string
  sourceTitle: string
  sourceSummary: string
  sourceLabel: string
  sourceType: string
  category: string
  authorOrChannel: string
  publishedAt: string | null
  topicHash: string
  noveltyScore: number
  generatedText: string
  scheduledAt: string | null
  postedAt: string | null
  xPostId: string | null
  errorReason: string | null
  skipReason: string | null
  promptVersion: string
  generationModel: string
  approvedAt: string | null
  attempts: number
  lastAttemptAt: string | null
  retryCount: number
  nextRetryAt: string | null
}

export type XAutopostLog = {
  id: string
  createdAt: string
  level: 'info' | 'success' | 'warning' | 'error'
  action: string
  message: string
  draftId: string | null
  meta: Record<string, unknown> | null
}

export type XAutopostState = {
  lastDraftRunAt: string | null
  lastPublishAttemptAt: string | null
  lastPostedAt: string | null
  nextGenerationAt: string | null
  nextPublishAt: string | null
  inProgress: boolean
  lastError: string
  lastDraftId: string | null
  postedDraftIds: string[]
  skippedDraftIds: string[]
  updatedAt: string
}

export type XAutopostPublisherStatus = {
  enabled: boolean
  configured: boolean
  ready: boolean
  detail: string
  authMode?: string
}

export type XAutopostMetrics = {
  draftCount: number
  approvedCount: number
  scheduledCount: number
  postedCount24h: number
  postedCount1h: number
  failedCount: number
  publisher: XAutopostPublisherStatus
  recentFailures: Array<{
    id: string
    sourceTitle: string
    errorReason: string | null
    updatedAt: string
  }>
}

export type XAutopostStateResponse = {
  ok: boolean
  settings: XAutopostSettings
  state: XAutopostState
  queue: XAutopostDraft[]
  logs: XAutopostLog[]
  metrics: XAutopostMetrics
  publisher: XAutopostPublisherStatus
}

export type XAutopostRunResponse = {
  ok: boolean
  createdCount: number
  skippedCount: number
  items: XAutopostDraft[]
  skipped: XAutopostDraft[]
  state: XAutopostState
  queue: XAutopostDraft[]
  logs: XAutopostLog[]
}

export type XAutopostDraftActionResponse = {
  ok: boolean
  item: XAutopostDraft
  state: XAutopostState
  simulated?: boolean
  error?: {
    status?: number
    message?: string
    payload?: unknown
  }
}
