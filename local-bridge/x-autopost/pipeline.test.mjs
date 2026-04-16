import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildTopicHash, calculateNoveltyScore, jaccardSimilarity, validateDraftCandidate } from './guardrails.mjs'
import {
  computeScheduleForApprovedDrafts,
  createXAutopostScheduler,
  getNextEligiblePublishTime,
} from './scheduler.mjs'

function makeSignal(overrides = {}) {
  return {
    id: `signal-${Math.random().toString(36).slice(2, 8)}`,
    title: 'OpenAI Agents SDK 업데이트',
    summary: '장기 실행 에이전트 제어와 샌드박스 관련 기능이 추가됐습니다.',
    url: 'https://x.com/OpenAIDevs/status/1234567890',
    source: 'X',
    sourceLabel: 'X',
    sourceType: 'x',
    category: 'AI 및 기술',
    authorOrChannel: '@OpenAIDevs',
    publishedAt: new Date().toISOString(),
    rawMeta: {
      likes: 120,
      reposts: 40,
    },
    ...overrides,
  }
}

async function createScheduler(t, overrides = {}) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'artemis-x-autopost-'))
  const envSnapshot = {
    AUTOPOST_MODE: process.env.AUTOPOST_MODE,
    X_API_ENABLED: process.env.X_API_ENABLED,
    X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
    X_REFRESH_TOKEN: process.env.X_REFRESH_TOKEN,
  }
  const scheduler = createXAutopostScheduler({
    resolveWorkspaceRoot: async () => ({ rootPath: workspaceRoot }),
    collectSignalItems: async () => [makeSignal()],
    fetchWithTimeout: async () => {
      throw new Error('unexpected fetch')
    },
    runCodex: async () => ({
      text: 'OpenAI Agents SDK가 장기 실행 에이전트 제어 범위를 넓혔습니다. 샌드박스와 메모리 제어가 핵심이라 실무 자동화 흐름에 바로 영향이 있습니다.\nhttps://x.com/OpenAIDevs/status/1234567890',
    }),
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

test('유사도와 novelty 계산은 중복 후보를 낮게 본다', () => {
  const similarity = jaccardSimilarity(
    'OpenAI Agents SDK가 장기 실행 에이전트 제어를 추가했습니다.',
    'OpenAI Agents SDK 장기 실행 에이전트 제어가 추가됐습니다.',
  )

  assert.ok(similarity > 0.35)

  const novelty = calculateNoveltyScore(
    {
      sourceTitle: 'OpenAI Agents SDK 업데이트',
      summary: '장기 실행 에이전트 제어와 샌드박스 관련 기능이 추가됐습니다.',
    },
    [
      {
        sourceTitle: 'OpenAI Agents SDK 업데이트',
        generatedText: '장기 실행 에이전트 제어와 샌드박스 관련 기능이 추가됐습니다.',
      },
    ],
  )

  assert.ok(novelty < 0.5)
})

test('draft guardrail은 같은 source url과 recent topic hash를 막는다', () => {
  const source = {
    sourceUrl: 'https://x.com/OpenAIDevs/status/1234567890',
    sourceTitle: 'OpenAI Agents SDK 업데이트',
    summary: '장기 실행 에이전트 제어와 샌드박스 관련 기능이 추가됐습니다.',
  }

  const topicHash = buildTopicHash(source)
  const result = validateDraftCandidate({
    sourceItem: source,
    queue: [
      {
        sourceUrl: source.sourceUrl,
        topicHash,
        postedAt: new Date().toISOString(),
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
  assert.match(result.reason, /source url|topic hash/i)
})

test('스케줄 계산은 최소 간격을 반영한다', () => {
  const now = Date.parse('2026-04-16T00:00:00.000Z')
  const queue = [
    {
      id: 'posted-a',
      status: 'posted',
      postedAt: '2026-04-15T23:58:00.000Z',
    },
    {
      id: 'draft-a',
      status: 'approved',
      approvedAt: '2026-04-16T00:00:00.000Z',
      createdAt: '2026-04-16T00:00:00.000Z',
    },
  ]

  const next = computeScheduleForApprovedDrafts(
    queue,
    {
      minIntervalMinutes: 6,
      maxPerHour: 10,
      maxPerDay: 120,
    },
    now,
  )

  const scheduled = next.find((item) => item.id === 'draft-a')
  assert.equal(scheduled?.status, 'scheduled')
  assert.equal(scheduled?.scheduledAt, '2026-04-16T00:04:00.000Z')
})

test('다음 발행 가능 시각 계산은 시간당 cap을 넘기면 다음 시간대로 민다', () => {
  const now = Date.parse('2026-04-16T00:30:00.000Z')
  const queue = Array.from({ length: 10 }, (_, index) => ({
    id: `posted-${index}`,
    status: 'posted',
    postedAt: new Date(Date.parse('2026-04-16T00:00:00.000Z') + index * 60_000).toISOString(),
  }))

  const nextEligible = getNextEligiblePublishTime(
    queue,
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

test('dry-run에서 draft가 생성되고 approval에서 approve -> scheduled -> posted로 이어진다', async (t) => {
  process.env.AUTOPOST_MODE = 'approval'
  process.env.X_API_ENABLED = 'false'

  const { scheduler } = await createScheduler(t)
  const queued = await scheduler.runNow({ limit: 1, reason: 'manual-test' })
  assert.equal(queued.createdCount, 1)
  assert.equal(queued.items[0].status, 'draft')

  const approved = await scheduler.approveDraft(queued.items[0].id)
  assert.equal(approved.item.status, 'scheduled')
  assert.ok(approved.item.scheduledAt)

  const publishResult = await scheduler.publishDraftNow(queued.items[0].id)
  assert.equal(publishResult.ok, true)
  assert.equal(publishResult.item.status, 'posted')
  assert.match(String(publishResult.item.xPostId), /^dryrun-/)
})

test('지금 게시는 cap을 넘기면 즉시 게시하지 않고 예약으로 돌린다', async (t) => {
  process.env.AUTOPOST_MODE = 'approval'
  process.env.X_API_ENABLED = 'true'
  process.env.X_ACCESS_TOKEN = 'token-present'

  const now = Date.parse('2026-04-16T00:30:00.000Z')
  const { scheduler } = await createScheduler(t, {
    fetchWithTimeout: async () => {
      throw new Error('publish should not run while capped')
    },
  })

  const queued = await scheduler.runNow({ limit: 1, reason: 'manual-cap-test' })
  const status = await scheduler.getStatus()
  const queueWithCap = [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `posted-${index}`,
      status: 'posted',
      postedAt: new Date(Date.parse('2026-04-16T00:00:00.000Z') + index * 60_000).toISOString(),
    })),
    ...status.queue,
  ]

  const publishResult = await scheduler.publishDraftNow(queued.items[0].id, {
    dryRun: false,
    now,
    queueOverride: queueWithCap,
  })

  assert.equal(publishResult.ok, true)
  assert.equal(publishResult.item.status, 'scheduled')
  assert.equal(publishResult.item.scheduledAt, '2026-04-16T01:00:00.000Z')
  assert.match(String(publishResult.detail), /다음 슬롯/)
})

test('인증이 없으면 publisher 상태는 disabled/미준비로 내려간다', async (t) => {
  delete process.env.X_API_ENABLED
  delete process.env.X_ACCESS_TOKEN
  delete process.env.X_REFRESH_TOKEN

  const { scheduler } = await createScheduler(t)
  const status = await scheduler.getStatus()

  assert.equal(status.publisher.enabled, false)
  assert.equal(status.publisher.ready, false)
})
