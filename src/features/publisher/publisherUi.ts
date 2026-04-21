import type {
  PublisherDossier,
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
    detail: '퍼블리셔 상태를 아직 확인하지 못했습니다.',
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
    dossierCount: 0,
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
      return '중지됨'
    case 'failed':
      return '실패'
    case 'skipped':
      return '제외됨'
    default:
      return '초안'
  }
}

export function publisherModeLabel(mode: PublisherSettings['mode']) {
  switch (mode) {
    case 'auto':
      return '자동 게시'
    case 'dry-run':
      return '시뮬레이션'
    default:
      return '승인 대기'
  }
}

export function summaryTypeLabel(summaryType: PublisherDraft['summaryType'] | PublishedPost['summaryType']) {
  switch (summaryType) {
    case 'paper-intro':
      return '논문 소개'
    case 'brief-points':
      return '핵심 포인트'
    default:
      return '속보 요약'
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

export function dossierStatusLabel(status: PublisherDossier['status']) {
  switch (status) {
    case 'published':
      return '게시 중'
    case 'tracking':
      return '추적 중'
    default:
      return '새 묶음'
  }
}
