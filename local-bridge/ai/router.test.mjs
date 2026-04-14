import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { calculateCandidateScore, createAiRouter } from './router.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function isoNow() {
  return new Date().toISOString()
}

async function createTestRouter(t, fetchWithTimeout = async () => {
  throw new Error('unexpected fetch')
}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'artemis-ai-router-test-'))
  const previousDataDir = process.env.ARTEMIS_DATA_DIR
  process.env.ARTEMIS_DATA_DIR = dataDir

  t.after(() => {
    if (previousDataDir === undefined) {
      delete process.env.ARTEMIS_DATA_DIR
    } else {
      process.env.ARTEMIS_DATA_DIR = previousDataDir
    }
  })

  const router = createAiRouter({
    projectRoot,
    fetchWithTimeout,
    requestTimeoutMs: 5_000,
    firstTokenTimeoutMs: 5_000,
    appEncryptionKey: 'test-app-encryption-key',
    publicSessionSecret: 'test-public-session-secret',
    openRouterTitle: 'Artemis Test',
    openRouterReferer: 'http://127.0.0.1:4173',
  })

  router.storage.insertAttemptLogs = (items) => insertAttemptLogs(router.storage, items)

  return router
}

function buildCandidate({
  provider,
  modelId,
  score,
  verified = true,
  priority = 10,
}) {
  return {
    provider,
    model_id: modelId,
    display_name: modelId,
    free_candidate: true,
    verified_available: verified,
    supports_streaming: true,
    supports_tools: false,
    supports_vision: false,
    quality_score: score,
    reasoning_score: score,
    coding_score: score,
    speed_score: score,
    stability_score: score,
    priority,
    excluded: false,
    last_checked_at: null,
    last_error: '',
    notes: 'test seed',
    source: 'seed',
  }
}

function createOpenAiStreamResponse(chunks) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`),
        )
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  })
}

function toDbBool(value) {
  return value ? 1 : 0
}

function insertModels(storage, items) {
  const db = new DatabaseSync(storage.dbPath)
  const stmt = db.prepare(`
    INSERT INTO model_catalog (
      provider,
      model_id,
      display_name,
      free_candidate,
      verified_available,
      supports_streaming,
      supports_tools,
      supports_vision,
      quality_score,
      reasoning_score,
      coding_score,
      speed_score,
      stability_score,
      priority,
      excluded,
      last_checked_at,
      last_error,
      notes,
      source,
      updated_at
    )
    VALUES (
      @provider, @model_id, @display_name, @free_candidate, @verified_available,
      @supports_streaming, @supports_tools, @supports_vision, @quality_score,
      @reasoning_score, @coding_score, @speed_score, @stability_score, @priority,
      @excluded, @last_checked_at, @last_error, @notes, @source, @updated_at
    )
  `)

  for (const item of items) {
    stmt.run({
      provider: item.provider,
      model_id: item.model_id,
      display_name: item.display_name,
      free_candidate: toDbBool(item.free_candidate),
      verified_available: toDbBool(item.verified_available),
      supports_streaming: toDbBool(item.supports_streaming),
      supports_tools: toDbBool(item.supports_tools),
      supports_vision: toDbBool(item.supports_vision),
      quality_score: item.quality_score,
      reasoning_score: item.reasoning_score,
      coding_score: item.coding_score,
      speed_score: item.speed_score,
      stability_score: item.stability_score,
      priority: item.priority,
      excluded: toDbBool(item.excluded),
      last_checked_at: item.last_checked_at,
      last_error: item.last_error,
      notes: item.notes,
      source: item.source,
      updated_at: isoNow(),
    })
  }

  db.close()
}

function insertAttemptLogs(storage, items) {
  const db = new DatabaseSync(storage.dbPath)
  const stmt = db.prepare(`
    INSERT INTO model_attempt_logs (
      id, session_id, message_id, routing_mode, attempt_index, provider, model, started_at,
      first_token_at, ended_at, success, error_type, error_message, status_code, latency_ms,
      fallback_reason, score_at_selection
    )
    VALUES (
      @id, @session_id, @message_id, @routing_mode, @attempt_index, @provider, @model, @started_at,
      @first_token_at, @ended_at, @success, @error_type, @error_message, @status_code, @latency_ms,
      @fallback_reason, @score_at_selection
    )
  `)

  for (const item of items) {
    stmt.run({
      ...item,
      success: toDbBool(item.success),
    })
  }

  db.close()
}

test('점수 계산은 가중치, 가용성 보너스, 실패 패널티를 반영한다', { concurrency: false }, () => {
  const score = calculateCandidateScore(
    {
      quality_score: 90,
      reasoning_score: 80,
      coding_score: 70,
      stability_score: 60,
      speed_score: 50,
      verified_available: true,
    },
    {
      quality: 0.4,
      reasoning: 0.22,
      coding: 0.22,
      stability: 0.1,
      speed: 0.06,
      availability_bonus: 8,
    },
    6,
  )

  assert.equal(score, 80)
})

test('자동 후보 선택은 검증된 무료 후보만 비교하고 실패 패널티를 반영한다', { concurrency: false }, async (t) => {
  const router = await createTestRouter(t)

  router.saveProvider('openrouter', { enabled: true, apiKey: 'openrouter-key' })
  router.saveProvider('nvidia-build', { enabled: true, apiKey: 'nvidia-key' })
  router.saveProvider('gemini', { enabled: true, apiKey: 'gemini-key' })

  insertModels(router.storage, [
    buildCandidate({
      provider: 'openrouter',
      modelId: 'openrouter-top-but-unverified',
      score: 99,
      verified: false,
      priority: 12,
    }),
    buildCandidate({
      provider: 'gemini',
      modelId: 'gemini-penalized',
      score: 90,
      verified: true,
      priority: 11,
    }),
    buildCandidate({
      provider: 'nvidia-build',
      modelId: 'nvidia-steady',
      score: 85,
      verified: true,
      priority: 10,
    }),
  ])

  insertAttemptLogs(router.storage, [
    {
      id: 'attempt-gemini-1',
      session_id: 'session-a',
      message_id: null,
      routing_mode: 'auto-best-free',
      attempt_index: 1,
      provider: 'gemini',
      model: 'gemini-penalized',
      started_at: isoNow(),
      first_token_at: null,
      ended_at: isoNow(),
      success: false,
      error_type: 'rate_limit',
      error_message: 'quota',
      status_code: 429,
      latency_ms: 100,
      fallback_reason: 'test',
      score_at_selection: 98,
    },
    {
      id: 'attempt-gemini-2',
      session_id: 'session-b',
      message_id: null,
      routing_mode: 'auto-best-free',
      attempt_index: 1,
      provider: 'gemini',
      model: 'gemini-penalized',
      started_at: isoNow(),
      first_token_at: null,
      ended_at: isoNow(),
      success: false,
      error_type: 'rate_limit',
      error_message: 'quota',
      status_code: 429,
      latency_ms: 100,
      fallback_reason: 'test',
      score_at_selection: 98,
    },
  ])

  const preview = await router.previewRoute({ routing_mode: 'auto-best-free' })

  assert.equal(preview.mode, 'auto-best-free')
  assert.deepEqual(
    preview.candidates.map((item) => item.model_id),
    ['nvidia-steady', 'gemini-penalized'],
  )
  assert.equal(preview.candidates[0].provider, 'nvidia-build')
  assert.equal(preview.candidates[0].score, 93)
  assert.equal(preview.candidates[1].score, 86)
})

test('스트리밍은 첫 후보 실패 시 다음 공급자로 폴백하고 시도 로그를 남긴다', { concurrency: false }, async (t) => {
  const fetchCalls = []
  const router = await createTestRouter(t, async (url, options = {}) => {
    fetchCalls.push({ url, options })

    if (String(url).includes('openrouter.ai')) {
      return new Response(JSON.stringify({
        error: { message: 'rate limited by upstream' },
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    }

    if (String(url).includes('integrate.api.nvidia.com')) {
      return createOpenAiStreamResponse(['fallback ', 'answer'])
    }

    throw new Error(`unexpected url: ${url}`)
  })

  router.saveProvider('openrouter', { enabled: true, apiKey: 'openrouter-key' })
  router.saveProvider('nvidia-build', { enabled: true, apiKey: 'nvidia-key' })

  insertModels(router.storage, [
    buildCandidate({
      provider: 'openrouter',
      modelId: 'openrouter-primary',
      score: 95,
      verified: true,
      priority: 12,
    }),
    buildCandidate({
      provider: 'nvidia-build',
      modelId: 'nvidia-fallback',
      score: 90,
      verified: true,
      priority: 11,
    }),
  ])

  const events = []
  const result = await router.streamChat(
    {
      prompt: '폴백 테스트',
      messages: [{ role: 'master', text: '폴백 테스트' }],
      routing_mode: 'auto-best-free',
    },
    {
      writeEvent: async (eventName, payload) => {
        events.push({ eventName, payload })
      },
    },
  )

  assert.equal(result.provider, 'nvidia-build')
  assert.equal(result.model, 'nvidia-fallback')
  assert.equal(result.text, 'fallback answer')
  assert.equal(result.attempts.length, 2)
  assert.equal(result.attempts[0].provider, 'openrouter')
  assert.equal(result.attempts[0].error_type, 'rate_limit')
  assert.equal(result.attempts[1].provider, 'nvidia-build')
  assert.equal(result.attempts[1].success, true)

  const attemptFailedEvent = events.find((item) => item.eventName === 'attempt_failed')
  const finalEvent = events.find((item) => item.eventName === 'final')
  assert.ok(attemptFailedEvent)
  assert.equal(attemptFailedEvent.payload.provider, 'openrouter')
  assert.ok(finalEvent)
  assert.equal(finalEvent.payload.provider, 'nvidia-build')
  assert.equal(finalEvent.payload.text, 'fallback answer')

  const logs = router.listRoutingLogs({ limit: 10 })
  const failedLog = logs.find((item) => item.provider === 'openrouter')
  const successLog = logs.find((item) => item.provider === 'nvidia-build')

  assert.ok(failedLog)
  assert.equal(Number(failedLog.success), 0)
  assert.equal(failedLog.error_type, 'rate_limit')
  assert.ok(failedLog.fallback_reason)

  assert.ok(successLog)
  assert.equal(Number(successLog.success), 1)
  assert.equal(successLog.model, 'nvidia-fallback')

  assert.equal(fetchCalls.length, 2)
})
