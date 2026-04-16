import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildDossiers } from './dossiers.mjs'
import { createSourceProviders } from './providers.mjs'
import {
  buildTopicHash,
  validateGeneratedDraft,
  validateNormalizedCandidate,
} from './quality.mjs'
import {
  computeScheduleForApprovedDrafts,
  createPublisherScheduler,
  getNextEligiblePublishTime,
} from './scheduler.mjs'

function makeSeed(overrides = {}) {
  return {
    id: `seed-${Math.random().toString(36).slice(2, 8)}`,
    provider: 'legacySignals',
    sourceType: 'news',
    canonicalUrl: 'https://example.com/news/openai-agents-sdk',
    sourceUrl: 'https://example.com/news/openai-agents-sdk',
    title: 'OpenAI Agents SDK가 장기 실행 제어 기능을 확장했습니다',
    subtitle: 'OpenAI Developers',
    authors: ['OpenAI Developers'],
    publishedAt: '2026-04-16T02:00:00.000Z',
    abstractOrSnippet:
      '장기 실행 에이전트 제어, 샌드박스, 메모리 관리 기능이 추가된 업데이트입니다.',
    language: 'ko',
    doi: '',
    arxivId: '',
    tags: ['ai', 'agent'],
    rawMeta: {},
    ...overrides,
  }
}

function makeFetchResponse({ ok = true, status = 200, text = '', json = null } = {}) {
  return {
    ok,
    status,
    async text() {
      return text
    },
    async json() {
      return json
    },
  }
}

async function createScheduler(t, overrides = {}) {
  const workspaceRoot = overrides.workspaceRoot ?? await mkdtemp(path.join(os.tmpdir(), 'artemis-publisher-'))
  const envKeys = [
    'AUTOPOST_MODE',
    'PUBLISH_INTERNAL_ENABLED',
    'PUBLISH_X_ENABLED',
    'PUBLISH_MAX_PER_HOUR',
    'PUBLISH_MIN_INTERVAL_MINUTES',
    'PUBLISH_MAX_PER_DAY',
    'INGEST_ARXIV_ENABLED',
    'INGEST_CROSSREF_ENABLED',
    'INGEST_SEMANTIC_SCHOLAR_ENABLED',
    'INGEST_NEWSAPI_ENABLED',
    'INGEST_RSS_ENABLED',
    'INGEST_LEGACY_SIGNALS_ENABLED',
    'PUBLISH_DEFAULT_QUEUE_LIMIT',
  ]
  const envSnapshot = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

  process.env.AUTOPOST_MODE = 'approval'
  process.env.PUBLISH_INTERNAL_ENABLED = 'true'
  process.env.PUBLISH_X_ENABLED = 'false'
  process.env.PUBLISH_MAX_PER_HOUR = '10'
  process.env.PUBLISH_MIN_INTERVAL_MINUTES = '6'
  process.env.PUBLISH_MAX_PER_DAY = '120'
  process.env.INGEST_ARXIV_ENABLED = 'false'
  process.env.INGEST_CROSSREF_ENABLED = 'false'
  process.env.INGEST_SEMANTIC_SCHOLAR_ENABLED = 'false'
  process.env.INGEST_NEWSAPI_ENABLED = 'false'
  process.env.INGEST_RSS_ENABLED = 'false'
  process.env.INGEST_LEGACY_SIGNALS_ENABLED = 'false'
  process.env.PUBLISH_DEFAULT_QUEUE_LIMIT = '2'

  const scheduler = createPublisherScheduler({
    resolveWorkspaceRoot: async () => ({ rootPath: workspaceRoot }),
    collectSignalItems: async () => [],
    fetchWithTimeout: async () => {
      throw new Error('unexpected fetch')
    },
    ...overrides,
  })

  t.after(async () => {
    await scheduler.stop()
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  return { scheduler, workspaceRoot }
}

test('provider normalization은 arXiv 항목을 정규 스키마로 바꾼다', async () => {
  const xml = `
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>https://arxiv.org/abs/2604.12345</id>
        <updated>2026-04-16T00:00:00Z</updated>
        <published>2026-04-15T20:00:00Z</published>
        <title>Agentic Memory for Long-running Systems</title>
        <summary>This paper studies memory orchestration for AI agents.</summary>
        <author><name>Jane Doe</name></author>
        <category term="cs.AI" />
      </entry>
    </feed>
  `
  const providers = createSourceProviders({
    fetchWithTimeout: async () => makeFetchResponse({ text: xml }),
    collectSignalItems: async () => [],
  })
  const arxiv = providers.find((item) => item.id === 'arxiv')
  const items = await arxiv.fetchNormalized({
    settings: {
      ingestArxivEnabled: true,
      ingestQuery: 'agent memory',
    },
    limit: 1,
  })

  assert.equal(items.length, 1)
  assert.equal(items[0].provider, 'arxiv')
  assert.equal(items[0].sourceType, 'paper')
  assert.equal(items[0].arxivId, '2604.12345')
  assert.match(items[0].canonicalUrl, /arxiv\.org\/abs\/2604\.12345/)
})

test('dedupe는 DOI, arXiv ID, canonical URL, 유사 제목을 차단한다', () => {
  const base = {
    ...makeSeed(),
    sourceType: 'paper',
    doi: '10.1000/xyz123',
    arxivId: '2604.12345',
  }

  const duplicateByDoi = validateNormalizedCandidate({
    sourceItem: base,
    existingItems: [{ doi: '10.1000/xyz123', canonicalUrl: 'https://other.example.com', title: 'Different title' }],
    settings: {
      requireSourceUrl: true,
      requireUniqueTopic: true,
      minNoveltyScore: 0.72,
      topicCooldownHours: 48,
    },
  })
  assert.equal(duplicateByDoi.ok, false)

  const duplicateByArxiv = validateNormalizedCandidate({
    sourceItem: { ...base, doi: '' },
    existingItems: [{ arxivId: '2604.12345', title: 'Different title', canonicalUrl: 'https://other.example.com' }],
    settings: {
      requireSourceUrl: true,
      requireUniqueTopic: true,
      minNoveltyScore: 0.72,
      topicCooldownHours: 48,
    },
  })
  assert.equal(duplicateByArxiv.ok, false)

  const duplicateByTitle = validateNormalizedCandidate({
    sourceItem: { ...base, doi: '', arxivId: '', canonicalUrl: 'https://example.com/paper-a' },
    existingItems: [{ canonicalUrl: 'https://example.com/paper-b', title: base.title }],
    settings: {
      requireSourceUrl: true,
      requireUniqueTopic: true,
      minNoveltyScore: 0.72,
      topicCooldownHours: 48,
    },
  })
  assert.equal(duplicateByTitle.ok, false)
})

test('novelty gating과 topic hash는 반복 주제를 차단한다', () => {
  const sourceItem = makeSeed({
    title: 'OpenAI Agents SDK가 장기 실행 제어 기능을 확장했습니다',
    abstractOrSnippet: '장기 실행 제어, 샌드박스, 메모리 관리 기능이 추가된 업데이트입니다.',
  })
  const topicHash = buildTopicHash(sourceItem)

  const result = validateNormalizedCandidate({
    sourceItem,
    existingItems: [
      {
        title: sourceItem.title,
        generatedText:
          'OpenAI Agents SDK 관련 새 업데이트입니다. 장기 실행 제어와 샌드박스 기능이 추가됐습니다. 출처 링크: https://example.com/news/openai-agents-sdk',
        topicHash,
        publishedAt: new Date().toISOString(),
      },
    ],
    settings: {
      requireSourceUrl: true,
      requireUniqueTopic: true,
      minNoveltyScore: 0.72,
      topicCooldownHours: 48,
    },
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /topic hash|novelty|제목/i)
})

test('승인 후에는 즉시 다음 슬롯이 배정된다', () => {
  const now = Date.parse('2026-04-16T00:00:00.000Z')
  const queue = [
    {
      id: 'draft-1',
      status: 'approved',
      approvedAt: '2026-04-16T00:00:00.000Z',
      createdAt: '2026-04-16T00:00:00.000Z',
    },
  ]

  const next = computeScheduleForApprovedDrafts(queue, [], {
    minIntervalMinutes: 6,
    maxPerHour: 10,
    maxPerDay: 120,
  }, now)

  assert.equal(next[0].status, 'scheduled')
  assert.equal(next[0].scheduledAt, '2026-04-16T00:00:00.000Z')
})

test('publish now는 cap을 넘기면 scheduled로 되돌린다', () => {
  const now = Date.parse('2026-04-16T00:30:00.000Z')
  const queue = Array.from({ length: 10 }, (_, index) => ({
    id: `scheduled-${index}`,
    status: 'scheduled',
    scheduledAt: new Date(Date.parse('2026-04-16T00:00:00.000Z') + index * 60_000).toISOString(),
  }))

  const nextEligible = getNextEligiblePublishTime(
    queue,
    [],
    {
      minIntervalMinutes: 6,
      maxPerHour: 10,
      maxPerDay: 120,
    },
    'draft-a',
    now,
  )

  assert.equal(new Date(nextEligible).toISOString(), '2026-04-16T01:00:00.000Z')
})

test('internal publish success와 X disabled fallback이 함께 동작한다', async (t) => {
  const { scheduler } = await createScheduler(t)
  const run = await scheduler.runNow({
    reason: 'test-seed',
    seedItems: [makeSeed()],
    limit: 1,
  })

  assert.equal(run.createdCount, 1)
  assert.equal(run.items[0].status, 'draft')

  const approved = await scheduler.approveDraft(run.items[0].id)
  assert.equal(approved.item.status, 'scheduled')

  const published = await scheduler.publishDraftNow(run.items[0].id)
  assert.equal(published.ok, true)
  assert.equal(published.item.status, 'published')
  assert.ok(published.item.internalPostId)
  assert.equal(published.item.xPostId, null)

  const status = await scheduler.getStatus()
  const xPublisher = status.publishers.find((item) => item.target === 'x')
  assert.equal(status.published.length, 1)
  assert.equal(xPublisher?.enabled, false)
})

test('restart 후에도 queue와 published history를 복원한다', async (t) => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'artemis-publisher-restart-'))
  const { scheduler } = await createScheduler(t, { workspaceRoot })
  const run = await scheduler.runNow({
    reason: 'restart-seed',
    seedItems: [makeSeed({ canonicalUrl: 'https://example.com/news/restart-check', sourceUrl: 'https://example.com/news/restart-check' })],
    limit: 1,
  })
  await scheduler.approveDraft(run.items[0].id)
  await scheduler.publishDraftNow(run.items[0].id)

  const { scheduler: restarted } = await createScheduler(t, { workspaceRoot })
  const status = await restarted.getStatus()

  assert.equal(status.queue.length >= 1, true)
  assert.equal(status.published.length, 1)
  assert.equal(status.published[0].sourceUrl, 'https://example.com/news/restart-check')
})

test('generated draft validation은 링크 누락과 일반 문구를 차단한다', () => {
  const draft = {
    sourceUrl: 'https://example.com/news/openai-agents-sdk',
  }

  const result = validateGeneratedDraft({
    text: 'AI news update. absolutely must see right now.',
    draft,
    existingItems: [],
    settings: {
      requireSourceUrl: true,
      blockNearDuplicates: true,
    },
  })

  assert.equal(result.ok, false)
})

test('dossier는 비슷한 주제의 draft와 published를 하나의 라이브 묶음으로 합친다', () => {
  const draft = {
    id: 'draft-1',
    status: 'draft',
    provider: 'rss',
    sourceLabel: 'RSS',
    sourceType: 'news',
    sourceTitle: 'OpenAI Agents SDK가 장기 실행 제어 기능을 확장했습니다',
    sourceSummary: '샌드박스와 메모리 관리 업데이트를 공개했습니다.',
    sourceUrl: 'https://example.com/news/openai-agents-sdk-update',
    canonicalUrl: 'https://example.com/news/openai-agents-sdk-update',
    subtitle: 'OpenAI Developers',
    authors: ['OpenAI Developers'],
    sourcePublishedAt: '2026-04-16T02:00:00.000Z',
    publishedAt: null,
    language: 'ko',
    doi: '',
    arxivId: '',
    tags: ['agents', 'sdk'],
    topicHash: 'topic-a',
    noveltyScore: 0.91,
    generatedText: '장기 실행 에이전트 운영 제어가 강화됐고 샌드박스 및 메모리 관리가 함께 추가됐습니다.\n- 샌드박스\n- 메모리 관리\n출처 링크: https://example.com/news/openai-agents-sdk-update',
    summaryType: 'brief-points',
    scheduledAt: null,
    publishTarget: 'internal',
    crossPostToX: false,
    errorReason: null,
    skipReason: null,
    promptVersion: 'test',
    generationModel: 'gpt-5.4-mini',
    publishResult: null,
    internalPostId: null,
    xPostId: null,
    sourceMeta: makeSeed({
      provider: 'rss',
      sourceType: 'news',
      title: 'OpenAI Agents SDK가 장기 실행 제어 기능을 확장했습니다',
      subtitle: 'OpenAI Developers',
      sourceUrl: 'https://example.com/news/openai-agents-sdk-update',
      canonicalUrl: 'https://example.com/news/openai-agents-sdk-update',
      tags: ['agents', 'sdk'],
    }),
    approvedAt: null,
    attempts: 0,
    lastAttemptAt: null,
    retryCount: 0,
    nextRetryAt: null,
    createdAt: '2026-04-16T02:10:00.000Z',
    updatedAt: '2026-04-16T02:10:00.000Z',
  }

  const published = {
    id: 'post-1',
    draftId: 'draft-0',
    title: 'OpenAI Agents SDK 장기 실행 운영 업데이트',
    excerpt: '장기 실행 에이전트 운영 제어와 샌드박스 기능이 함께 강화됐습니다.',
    body: '# 핵심 변화\n에이전트 운영 제어와 메모리 관리가 강화됐습니다.\n- 샌드박스 실행\n- 메모리 제어',
    summaryType: 'breaking',
    provider: 'legacySignals',
    sourceLabel: 'Signals',
    sourceType: 'news',
    category: '뉴스',
    sourceUrl: 'https://example.com/news/openai-agents-sdk-overview',
    canonicalUrl: 'https://example.com/news/openai-agents-sdk-overview',
    authors: ['OpenAI Developers'],
    tags: ['agents', 'sdk'],
    publishedAt: '2026-04-16T02:30:00.000Z',
    createdAt: '2026-04-16T02:20:00.000Z',
    sourceMeta: makeSeed({
      provider: 'legacySignals',
      sourceType: 'news',
      title: 'OpenAI Agents SDK 장기 실행 운영 업데이트',
      subtitle: 'OpenAI Developers',
      sourceUrl: 'https://example.com/news/openai-agents-sdk-overview',
      canonicalUrl: 'https://example.com/news/openai-agents-sdk-overview',
      tags: ['agents', 'sdk'],
    }),
    publishResult: null,
  }

  const dossiers = buildDossiers({
    queue: [draft],
    published: [published],
    logs: [],
  })

  assert.equal(dossiers.length, 1)
  assert.equal(dossiers[0].publishedCount, 1)
  assert.equal(dossiers[0].draftCount, 1)
  assert.equal(dossiers[0].sourceCount, 2)
  assert.equal(dossiers[0].status, 'published')
  assert.equal(dossiers[0].linkedDraftIds.includes('draft-1'), true)
  assert.equal(dossiers[0].linkedPublishedIds.includes('post-1'), true)
})
