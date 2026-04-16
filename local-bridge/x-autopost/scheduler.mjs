import { canonicalizeUrl, nowIso } from '../auto-posts/normalize.mjs'
import { rankSignalCandidates } from '../auto-posts/scoring.mjs'
import { toSignalCandidate } from '../auto-posts/collector.mjs'
import { createQueueLog, buildTopicHash, validateDraftCandidate, validateGeneratedDraft } from './guardrails.mjs'
import { generateXAutopostDraft, X_AUTOPOST_PROMPT_VERSION } from './generator.mjs'
import { createXPublisher } from './publisher.mjs'
import { createXAutopostStore } from './store.mjs'

function createDraftId(item) {
  const base = buildTopicHash(item).slice(0, 12)
  return `x-draft-${Date.now().toString(36)}-${base}`
}

function buildSourceSnapshot(item = {}) {
  return {
    sourceUrl: canonicalizeUrl(item.url || item.sourceUrl || item.rawMeta?.externalUrl || ''),
    sourceTitle: item.title || item.sourceTitle || '',
    summary: item.summary || '',
    source: item.source || item.sourceLabel || '',
    sourceLabel: item.sourceLabel || item.source || '',
    sourceType: item.sourceType || '',
    category: item.category || '',
    authorOrChannel: item.authorOrChannel || '',
    publishedAt: item.publishedAt || null,
    rawMeta: item.rawMeta ?? {},
  }
}

function collectWindowItems(queue, timeKey, windowMs, now) {
  return queue.filter((item) => {
    const targetTime = Date.parse(item[timeKey] || 0)
    return Number.isFinite(targetTime) && targetTime >= now - windowMs && targetTime <= now
  })
}

function reserveFutureSlots(queue) {
  return queue
    .filter((item) => item.status === 'scheduled' && item.scheduledAt)
    .map((item) => Date.parse(item.scheduledAt))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
}

export function computeScheduleForApprovedDrafts(queue, settings, now = Date.now()) {
  const minIntervalMs = settings.minIntervalMinutes * 60_000
  const reservedTimes = [
    ...queue
      .filter((item) => item.status === 'posted' && item.postedAt)
      .map((item) => Date.parse(item.postedAt))
      .filter(Number.isFinite),
    ...reserveFutureSlots(queue),
  ].sort((left, right) => left - right)

  const nextQueue = queue.map((item) => ({ ...item }))
  const approvedItems = nextQueue
    .filter((item) => item.status === 'approved')
    .sort(
      (left, right) =>
        Date.parse(left.approvedAt || left.createdAt || 0) - Date.parse(right.approvedAt || right.createdAt || 0),
    )

  for (const draft of approvedItems) {
    let candidateTime = now
    let attempts = 0

    while (attempts < 64) {
      attempts += 1
      const hourWindow = reservedTimes.filter((time) => time >= candidateTime - 3_600_000 && time <= candidateTime)
      const dayWindow = reservedTimes.filter((time) => time >= candidateTime - 86_400_000 && time <= candidateTime)
      const latestReserved = reservedTimes.filter((time) => time <= candidateTime).slice(-1)[0]

      if (dayWindow.length >= settings.maxPerDay) {
        candidateTime = dayWindow[0] + 86_400_000
        continue
      }

      if (hourWindow.length >= settings.maxPerHour) {
        candidateTime = hourWindow[0] + 3_600_000
        continue
      }

      if (Number.isFinite(latestReserved) && candidateTime < latestReserved + minIntervalMs) {
        candidateTime = latestReserved + minIntervalMs
        continue
      }

      break
    }

    draft.status = 'scheduled'
    draft.scheduledAt = new Date(candidateTime).toISOString()
    draft.updatedAt = nowIso()
    reservedTimes.push(candidateTime)
    reservedTimes.sort((left, right) => left - right)
  }

  return nextQueue
}

function computeMetrics(queue, publisherStatus) {
  const now = Date.now()
  const postedToday = collectWindowItems(queue, 'postedAt', 86_400_000, now)
  const postedHour = collectWindowItems(queue, 'postedAt', 3_600_000, now)
  const recentFailures = queue
    .filter((item) => item.status === 'failed')
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      sourceTitle: item.sourceTitle,
      errorReason: item.errorReason,
      updatedAt: item.updatedAt,
    }))

  return {
    draftCount: queue.filter((item) => item.status === 'draft').length,
    approvedCount: queue.filter((item) => item.status === 'approved').length,
    scheduledCount: queue.filter((item) => item.status === 'scheduled').length,
    postedCount24h: postedToday.length,
    postedCount1h: postedHour.length,
    failedCount: queue.filter((item) => item.status === 'failed').length,
    publisher: publisherStatus,
    recentFailures,
  }
}

export function createXAutopostScheduler({ resolveWorkspaceRoot, collectSignalItems, fetchWithTimeout, runCodex }) {
  const store = createXAutopostStore()
  const publisher = createXPublisher({ fetchWithTimeout })
  let startupTimer = null
  let intervalTimer = null
  let activeTickPromise = null

  async function getWorkspaceRoot() {
    const workspace = await resolveWorkspaceRoot()
    return workspace.rootPath ?? workspace
  }

  function clearTimers() {
    if (startupTimer) {
      clearTimeout(startupTimer)
      startupTimer = null
    }
    if (intervalTimer) {
      clearInterval(intervalTimer)
      intervalTimer = null
    }
  }

  async function appendLog(workspaceRoot, entry, settings = null) {
    return store.appendLog(workspaceRoot, entry, settings)
  }

  async function getStatus() {
    const workspaceRoot = await getWorkspaceRoot()
    const { settings, state, items, logs } = await store.listQueue(workspaceRoot)
    const publisherStatus = await publisher.getStatus()
    return {
      settings,
      state,
      queue: items,
      logs,
      metrics: computeMetrics(items, publisherStatus),
      publisher: publisherStatus,
    }
  }

  async function updateSettings(patch = {}) {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.saveSettings(workspaceRoot, patch)
    const currentState = await store.getState(workspaceRoot, settings)
    await store.saveState(
      workspaceRoot,
      {
        ...currentState,
        nextGenerationAt:
          settings.mode === 'dry-run'
            ? null
            : new Date(Date.now() + settings.minIntervalMinutes * 60_000).toISOString(),
      },
      settings,
    )
    await scheduleLoop()
    return getStatus()
  }

  async function listQueue() {
    return getStatus()
  }

  async function saveQueueAndState(workspaceRoot, queue, state, settings) {
    const [savedQueue, savedState] = await Promise.all([
      store.saveQueue(workspaceRoot, queue, settings),
      store.saveState(workspaceRoot, state, settings),
    ])
    return { queue: savedQueue, state: savedState }
  }

  async function queueDrafts({ category = '전체', limit = 1, force = false, seedItems = [], reason = 'manual' } = {}) {
    const workspaceRoot = await getWorkspaceRoot()
    const init = await store.ensureInitialized(workspaceRoot)
    const settings = init.settings
    const previousState = await store.getState(workspaceRoot, settings)
    const existingQueue = await store.getQueue(workspaceRoot, settings)
    const currentTime = nowIso()
    const logs = []

    const log = async (level, action, message, draftId = null, meta = null) => {
      const entry = createQueueLog(level, action, message, draftId, meta)
      logs.push(entry)
      await appendLog(workspaceRoot, entry, settings)
      return entry
    }

    const sourceItems = Array.isArray(seedItems) && seedItems.length > 0 ? seedItems : await collectSignalItems(category)
    await log('info', 'queue-run', `X 자동 게시 후보 ${sourceItems.length}건을 점검합니다.`)

    const rankedCandidates = rankSignalCandidates(sourceItems.map((item) => toSignalCandidate(item)))
    const selectedCandidates = force ? rankedCandidates.slice(0, limit) : rankedCandidates.slice(0, Math.max(1, limit))

    const nextQueue = [...existingQueue]
    const createdDrafts = []
    const skippedDrafts = []

    for (const candidate of selectedCandidates) {
      const sourceSnapshot = buildSourceSnapshot(candidate)
      const gate = force
        ? {
            ok: true,
            topicHash: buildTopicHash(sourceSnapshot),
            noveltyScore: 1,
            sourceUrl: sourceSnapshot.sourceUrl,
          }
        : validateDraftCandidate({ sourceItem: sourceSnapshot, queue: nextQueue, settings })
      const draftId = createDraftId(sourceSnapshot)

      if (!gate.ok) {
        const skipped = {
          id: draftId,
          createdAt: currentTime,
          updatedAt: currentTime,
          status: 'skipped',
          sourceUrl: sourceSnapshot.sourceUrl,
          sourceTitle: sourceSnapshot.sourceTitle,
          sourceSummary: sourceSnapshot.summary,
          topicHash: gate.topicHash,
          noveltyScore: gate.noveltyScore,
          generatedText: '',
          scheduledAt: null,
          postedAt: null,
          xPostId: null,
          errorReason: gate.reason,
          skipReason: gate.reason,
          sourceLabel: sourceSnapshot.sourceLabel,
          sourceType: sourceSnapshot.sourceType,
          category: sourceSnapshot.category,
          authorOrChannel: sourceSnapshot.authorOrChannel,
          publishedAt: sourceSnapshot.publishedAt,
          promptVersion: X_AUTOPOST_PROMPT_VERSION,
          generationModel: settings.generationModel,
          sourceSnapshot,
          approvedAt: null,
          attempts: 0,
          lastAttemptAt: null,
          retryCount: 0,
          nextRetryAt: null,
        }
        nextQueue.unshift(skipped)
        skippedDrafts.push(skipped)
        await log('warning', 'draft-skipped', gate.reason, draftId, { sourceUrl: sourceSnapshot.sourceUrl, topicHash: gate.topicHash })
        continue
      }

      const generated = await generateXAutopostDraft({ sourceItem: sourceSnapshot, settings, runCodex })
      const draft = {
        id: draftId,
        createdAt: currentTime,
        updatedAt: currentTime,
        status: settings.mode === 'auto' ? 'approved' : 'draft',
        sourceUrl: gate.sourceUrl,
        sourceTitle: sourceSnapshot.sourceTitle,
        sourceSummary: sourceSnapshot.summary,
        topicHash: gate.topicHash,
        noveltyScore: gate.noveltyScore,
        generatedText: generated.text,
        scheduledAt: null,
        postedAt: null,
        xPostId: null,
        errorReason: null,
        skipReason: null,
        sourceLabel: sourceSnapshot.sourceLabel,
        sourceType: sourceSnapshot.sourceType,
        category: sourceSnapshot.category,
        authorOrChannel: sourceSnapshot.authorOrChannel,
        publishedAt: sourceSnapshot.publishedAt,
        promptVersion: generated.promptVersion,
        generationModel: generated.model,
        sourceSnapshot,
        approvedAt: settings.mode === 'auto' ? currentTime : null,
        attempts: 0,
        lastAttemptAt: null,
        retryCount: 0,
        nextRetryAt: null,
      }

      const validation = validateGeneratedDraft({ text: draft.generatedText, draft, queue: nextQueue, settings })
      if (!validation.ok) {
        draft.status = 'skipped'
        draft.errorReason = validation.reason
        draft.skipReason = validation.reason
        nextQueue.unshift(draft)
        skippedDrafts.push(draft)
        await log('warning', 'draft-skipped', validation.reason, draftId, { similarityScore: validation.similarityScore })
        continue
      }

      nextQueue.unshift(draft)
      createdDrafts.push(draft)
      await log('info', 'draft-created', `${draft.sourceTitle} 초안을 생성했습니다.`, draftId, {
        status: draft.status,
        noveltyScore: draft.noveltyScore,
        usedFallback: generated.usedFallback,
        reason,
      })
    }

    const nextState = {
      ...previousState,
      lastDraftRunAt: currentTime,
      nextGenerationAt:
        settings.mode === 'dry-run' ? null : new Date(Date.now() + settings.minIntervalMinutes * 60_000).toISOString(),
      lastDraftId: createdDrafts[0]?.id ?? previousState.lastDraftId,
      skippedDraftIds: [...(previousState.skippedDraftIds ?? []), ...skippedDrafts.map((item) => item.id)].slice(-300),
      lastError: '',
      updatedAt: nowIso(),
    }

    const saved = await saveQueueAndState(workspaceRoot, nextQueue, nextState, settings)
    return {
      ok: true,
      createdCount: createdDrafts.length,
      skippedCount: skippedDrafts.length,
      items: createdDrafts,
      skipped: skippedDrafts,
      state: saved.state,
      queue: saved.queue,
      logs,
    }
  }

  async function approveDraft(id) {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot, settings)
    const queue = await store.getQueue(workspaceRoot, settings)
    const draft = queue.find((item) => item.id === id)

    if (!draft) {
      throw new Error('승인할 draft를 찾지 못했습니다.')
    }
    if (draft.status !== 'draft') {
      throw new Error('현재 상태에서는 승인할 수 없습니다.')
    }

    draft.status = 'approved'
    draft.approvedAt = nowIso()
    draft.updatedAt = nowIso()
    draft.errorReason = null
    await appendLog(workspaceRoot, createQueueLog('success', 'draft-approved', `${draft.sourceTitle} 초안을 승인했습니다.`, id), settings)

    const saved = await saveQueueAndState(workspaceRoot, queue, state, settings)
    return { ok: true, item: saved.queue.find((item) => item.id === id) ?? draft, state: saved.state }
  }

  async function rejectDraft(id, reason = 'operator_rejected') {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot, settings)
    const queue = await store.getQueue(workspaceRoot, settings)
    const draft = queue.find((item) => item.id === id)

    if (!draft) {
      throw new Error('거절할 draft를 찾지 못했습니다.')
    }

    draft.status = 'skipped'
    draft.skipReason = reason
    draft.errorReason = reason
    draft.updatedAt = nowIso()
    await appendLog(workspaceRoot, createQueueLog('warning', 'draft-rejected', `${draft.sourceTitle} 초안을 거절했습니다.`, id, { reason }), settings)

    const saved = await saveQueueAndState(
      workspaceRoot,
      queue,
      { ...state, skippedDraftIds: [...(state.skippedDraftIds ?? []), id].slice(-300) },
      settings,
    )

    return { ok: true, item: saved.queue.find((item) => item.id === id) ?? draft, state: saved.state }
  }

  async function publishDraftNow(id, { dryRun = false } = {}) {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot, settings)
    const queue = await store.getQueue(workspaceRoot, settings)
    const draft = queue.find((item) => item.id === id)

    if (!draft) {
      throw new Error('게시할 draft를 찾지 못했습니다.')
    }
    if (draft.status === 'posted') {
      return { ok: true, item: draft, state }
    }

    draft.attempts = Number(draft.attempts ?? 0) + 1
    draft.lastAttemptAt = nowIso()
    draft.updatedAt = draft.lastAttemptAt

    const result = await publisher.publish({ text: draft.generatedText, dryRun: dryRun || settings.mode === 'dry-run' })

    if (result.ok) {
      draft.status = 'posted'
      draft.postedAt = result.postedAt
      draft.xPostId = result.xPostId
      draft.errorReason = null
      draft.skipReason = null
      draft.updatedAt = result.postedAt

      await appendLog(
        workspaceRoot,
        createQueueLog(
          'success',
          'publish-success',
          result.simulated ? `${draft.sourceTitle} 게시를 dry-run으로 시뮬레이션했습니다.` : `${draft.sourceTitle} 게시를 완료했습니다.`,
          id,
          { simulated: result.simulated, xPostId: result.xPostId },
        ),
        settings,
      )

      const saved = await saveQueueAndState(
        workspaceRoot,
        queue,
        {
          ...state,
          lastPublishAttemptAt: draft.lastAttemptAt,
          lastPostedAt: draft.postedAt,
          nextPublishAt: null,
          lastError: '',
          postedDraftIds: [...(state.postedDraftIds ?? []), id].slice(-300),
        },
        settings,
      )

      return { ok: true, item: saved.queue.find((item) => item.id === id) ?? draft, state: saved.state, simulated: result.simulated }
    }

    const retryCount = Number(draft.retryCount ?? 0) + 1
    const shouldRetry = retryCount <= settings.retryLimit
    const retryAt = shouldRetry ? new Date(Date.now() + settings.retryBackoffMinutes * 60_000 * retryCount).toISOString() : null

    draft.status = shouldRetry ? 'scheduled' : 'failed'
    draft.retryCount = retryCount
    draft.nextRetryAt = retryAt
    draft.scheduledAt = retryAt
    draft.errorReason = result.error?.message || 'X 게시 요청이 실패했습니다.'
    draft.updatedAt = nowIso()

    await appendLog(
      workspaceRoot,
      createQueueLog('error', 'publish-failed', `${draft.sourceTitle} 게시에 실패했습니다: ${draft.errorReason}`, id, {
        retryAt,
        retryCount,
        status: result.error?.status ?? null,
      }),
      settings,
    )

    const saved = await saveQueueAndState(
      workspaceRoot,
      queue,
      { ...state, lastPublishAttemptAt: draft.lastAttemptAt, nextPublishAt: retryAt, lastError: draft.errorReason },
      settings,
    )

    return { ok: false, item: saved.queue.find((item) => item.id === id) ?? draft, state: saved.state, error: result.error }
  }

  async function tick(reason = 'interval') {
    if (activeTickPromise) {
      return activeTickPromise
    }

    activeTickPromise = (async () => {
      const workspaceRoot = await getWorkspaceRoot()
      const settings = await store.getSettings(workspaceRoot)
      const state = await store.getState(workspaceRoot, settings)

      if (state.inProgress) {
        return getStatus()
      }

      await store.saveState(workspaceRoot, { ...state, inProgress: true }, settings)

      try {
        if (settings.mode !== 'dry-run' && state.nextGenerationAt && Date.parse(state.nextGenerationAt) <= Date.now()) {
          await queueDrafts({ category: '전체', limit: 1, force: false, reason })
        }

        const queue = await store.getQueue(workspaceRoot, settings)
        const dueScheduledItems = queue.filter((item) => {
          const dueTime = Date.parse(item.scheduledAt || item.nextRetryAt || 0)
          return item.status === 'scheduled' && Number.isFinite(dueTime) && dueTime <= Date.now()
        })

        if (dueScheduledItems.length > 0) {
          await publishDraftNow(dueScheduledItems[0].id)
        } else {
          const queueWithScheduled = computeScheduleForApprovedDrafts(queue, settings)
          const changed = queueWithScheduled.some((item, index) => item !== queue[index])
          if (changed) {
            const scheduledTimes = queueWithScheduled
              .filter((item) => item.status === 'scheduled')
              .map((item) => Date.parse(item.scheduledAt || 0))
              .filter(Number.isFinite)
              .sort((left, right) => left - right)

            await saveQueueAndState(
              workspaceRoot,
              queueWithScheduled,
              { ...(await store.getState(workspaceRoot, settings)), nextPublishAt: scheduledTimes.length > 0 ? new Date(scheduledTimes[0]).toISOString() : null },
              settings,
            )
          }
        }
      } finally {
        const latestState = await store.getState(workspaceRoot, settings)
        await store.saveState(workspaceRoot, { ...latestState, inProgress: false, updatedAt: nowIso() }, settings)
      }

      return getStatus()
    })().finally(() => {
      activeTickPromise = null
    })

    return activeTickPromise
  }

  async function scheduleLoop() {
    clearTimers()
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot, settings)

    if (settings.mode === 'dry-run') {
      await store.saveState(workspaceRoot, { ...state, nextGenerationAt: null, nextPublishAt: null, inProgress: false }, settings)
      return
    }

    startupTimer = setTimeout(() => {
      void tick('startup')
    }, settings.startupDelayMs)

    intervalTimer = setInterval(() => {
      void tick('interval')
    }, settings.schedulerPollMs)

    await store.saveState(
      workspaceRoot,
      { ...state, nextGenerationAt: state.nextGenerationAt || new Date(Date.now() + settings.minIntervalMinutes * 60_000).toISOString() },
      settings,
    )
  }

  async function start() {
    const workspaceRoot = await getWorkspaceRoot()
    await store.ensureInitialized(workspaceRoot)
    await scheduleLoop()
  }

  async function stop() {
    clearTimers()
  }

  return {
    start,
    stop,
    tick,
    getStatus,
    listQueue,
    updateSettings,
    runNow: queueDrafts,
    approveDraft,
    rejectDraft,
    publishDraftNow,
  }
}
