import type {
  PublisherDraft,
  PublisherMetrics,
  PublisherRuntimeStatus,
  PublisherSettings,
  PublisherState,
  PublishedPost,
} from '../../types/publisher'

export function defaultPublisherSettings(): PublisherSettings {
  return {
    mode: 'approval',
    publishInternalEnabled: true,
    publishXEnabled: false,
    maxPerHour: 10,
    minIntervalMinutes: 6,
    maxPerDay: 120,
    requireSourceUrl: true,
    requireUniqueTopic: true,
    minNoveltyScore: 0.72,
    blockNearDuplicates: true,
    outputDir: 'publisher',
    generationModel: 'gpt-5.4-mini',
    startupDelayMs: 15_000,
    schedulerPollMs: 60_000,
    topicCooldownHours: 48,
    retryLimit: 3,
    retryBackoffMinutes: 12,
    maxQueueItems: 400,
    ingestArxivEnabled: true,
    ingestCrossrefEnabled: true,
    ingestSemanticScholarEnabled: true,
    ingestNewsApiEnabled: false,
    newsApiKey: '',
    ingestRssEnabled: false,
    rssFeeds: [],
    ingestLegacySignalsEnabled: true,
    ingestQuery: 'artificial intelligence large language model agent multimodal open source research',
    defaultQueueLimit: 3,
  }
}

export function defaultPublisherState(): PublisherState {
  return {
    lastIngestRunAt: null,
    lastPublishAttemptAt: null,
    lastPublishedAt: null,
    nextIngestAt: null,
    nextPublishAt: null,
    inProgress: false,
    lastError: '',
    lastDraftId: null,
    publishedDraftIds: [],
    skippedDraftIds: [],
    providerStats: [],
    updatedAt: new Date().toISOString(),
  }
}

export function defaultPublisherRuntimeStatus(): PublisherRuntimeStatus {
  return {
    target: 'internal',
    enabled: false,
    configured: false,
    ready: false,
    detail: 'Artemis Wire 게시기 상태를 확인하지 못했습니다.',
  }
}

export function defaultPublisherMetrics(): PublisherMetrics {
  return {
    draftCount: 0,
    approvedCount: 0,
    scheduledCount: 0,
    publishedCount24h: 0,
    publishedCount1h: 0,
    failedCount: 0,
    providerCounts24h: [],
    recentFailures: [],
    publishers: [],
  }
}

export function draftStatusLabel(status: PublisherDraft['status']) {
  switch (status) {
    case 'approved':
      return '승인됨'
    case 'scheduled':
      return '예약됨'
    case 'published':
      return '게시됨'
    case 'disabled':
      return '비활성'
    case 'failed':
      return '실패'
    case 'skipped':
      return '건너뜀'
    default:
      return '초안'
  }
}

export function publisherModeLabel(mode: PublisherSettings['mode']) {
  switch (mode) {
    case 'auto':
      return '자동 게시'
    case 'dry-run':
      return '드라이 런'
    default:
      return '승인 대기'
  }
}

export function summaryTypeLabel(summaryType: PublisherDraft['summaryType'] | PublishedPost['summaryType']) {
  switch (summaryType) {
    case 'paper-intro':
      return '논문 소개형'
    case 'brief-points':
      return '핵심 포인트형'
    default:
      return '속보형'
  }
}

export function sourceTypeLabel(sourceType: PublisherDraft['sourceType'] | PublishedPost['sourceType']) {
  switch (sourceType) {
    case 'paper':
      return '논문'
    case 'news':
      return '뉴스'
    default:
      return '피드'
  }
}
