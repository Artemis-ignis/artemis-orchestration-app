import { nowIso } from '../auto-posts/normalize.mjs'
import { generatePublisherDraft, PUBLISHER_PROMPT_VERSION } from './generator.mjs'
import {
  buildTopicHash,
  createPublisherLog,
  rankNormalizedItems,
  validateGeneratedDraft,
  validateNormalizedCandidate,
} from './quality.mjs'
import { createSourceProviders } from './providers.mjs'
import { createInternalPublisher } from './publishers/internalPublisher.mjs'
import { createOptionalXPublisher } from './publishers/xPublisher.mjs'
import { createPublisherStore } from './store.mjs'

function createDraftId(item) {
  return `publisher-draft-${Date.now().toString(36)}-${buildTopicHash(item).slice(0, 12)}`
}

function sourceLabelForProvider(provider = '') {
  switch (provider) {
    case 'arxiv':
      return 'arXiv'
    case 'crossref':
      return 'Crossref'
    case 'semanticScholar':
      return 'Semantic Scholar'
    case 'newsApi':
      return 'News API'
    case 'rss':
      return 'RSS'
    case 'legacySignals':
      return 'Signals'
    default:
      return provider || 'Source'
  }
}

function categoryLabelForSourceType(sourceType = '') {
  switch (sourceType) {
    case 'paper':
      return '논문'
    case 'news':
      return '뉴스'
    default:
      return '피드'
  }
}

function collectWindowItems(items, timeKey, windowMs, now) {
  return items.filter((item) => {
    const targetTime = Date.parse(item[timeKey] || 0)
    return Number.isFinite(targetTime) && targetTime >= now - windowMs && targetTime <= now
  })
}

function reserveFutureSlots(queue, published) {
  return [
    ...published
      .map((item) => Date.parse(item.publishedAt || 0))
      .filter(Number.isFinite),
    ...queue
      .filter((item) => item.status === 'scheduled' && item.scheduledAt)
      .map((item) => Date.parse(item.scheduledAt))
      .filter(Number.isFinite),
  ].sort((left, right) => left - right)
}

function collectScheduledTimes(queue) {
  return queue
    .filter((item) => item.status === 'scheduled')
    .map((item) => Date.parse(item.scheduledAt || item.nextRetryAt || 0))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
}

export function computeScheduleForApprovedDrafts(queue, published, settings, now = Date.now()) {
  const minIntervalMs = settings.minIntervalMinutes * 60_000
  const reservedTimes = reserveFutureSlots(queue, published)
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

export function getNextEligiblePublishTime(queue, published, settings, targetDraftId, now = Date.now()) {
  const probeId = '__publisher-probe__'
  const baseQueue = queue
    .filter((item) => item.id !== targetDraftId)
    .map((item) => ({ ...item }))

  baseQueue.push({
    id: probeId,
    status: 'approved',
    approvedAt: new Date(now).toISOString(),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  })

  const scheduledQueue = computeScheduleForApprovedDrafts(baseQueue, published, settings, now)
  const probe = scheduledQueue.find((item) => item.id === probeId)
  const slotTime = Date.parse(probe?.scheduledAt || 0)
  return Number.isFinite(slotTime) ? slotTime : now
}

function summarizeProviderWindow(items = [], published = [], providerStats = []) {
  const now = Date.now()
  const providerMap = new Map()
  const upsert = (provider, patch = {}) => {
    providerMap.set(provider, {
      provider,
      fetchedCount24h: providerMap.get(provider)?.fetchedCount24h ?? 0,
      draftCount24h: providerMap.get(provider)?.draftCount24h ?? 0,
      publishedCount24h: providerMap.get(provider)?.publishedCount24h ?? 0,
      ...providerMap.get(provider),
      ...patch,
    })
  }

  for (const stat of providerStats) {
    upsert(stat.provider, {
      label: stat.label,
      enabled: stat.enabled,
      fetchedCount24h: stat.lastFetchedAt && Date.parse(stat.lastFetchedAt) >= now - 86_400_000 ? stat.lastFetchedCount : 0,
      lastFetchedAt: stat.lastFetchedAt || null,
      lastError: stat.lastError || '',
    })
  }

  for (const item of collectWindowItems(items, 'createdAt', 86_400_000, now)) {
    upsert(item.provider || 'unknown', {
      draftCount24h: (providerMap.get(item.provider || 'unknown')?.draftCount24h ?? 0) + 1,
    })
  }

  for (const item of collectWindowItems(published, 'publishedAt', 86_400_000, now)) {
    upsert(item.provider || 'unknown', {
      publishedCount24h: (providerMap.get(item.provider || 'unknown')?.publishedCount24h ?? 0) + 1,
    })
  }

  return Array.from(providerMap.values()).sort((left, right) => right.publishedCount24h - left.publishedCount24h)
}

function computeMetrics(queue, published, providerStats, publisherStatuses) {
  const now = Date.now()
  const publishedToday = collectWindowItems(published, 'publishedAt', 86_400_000, now)
  const publishedHour = collectWindowItems(published, 'publishedAt', 3_600_000, now)
  const recentFailures = queue
    .filter((item) => item.status === 'failed')
    .slice(0, 8)
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
    publishedCount24h: publishedToday.length,
    publishedCount1h: publishedHour.length,
    failedCount: queue.filter((item) => item.status === 'failed').length,
    providerCounts24h: summarizeProviderWindow(queue, published, providerStats),
    recentFailures,
    publishers: publisherStatuses,
  }
}

function buildSourceSnapshot(item = {}) {
  return {
    id: item.id,
    provider: item.provider,
    sourceType: item.sourceType,
    canonicalUrl: item.canonicalUrl,
    sourceUrl: item.sourceUrl,
    title: item.title,
    subtitle: item.subtitle,
    authors: Array.isArray(item.authors) ? item.authors : [],
    publishedAt: item.publishedAt,
    abstractOrSnippet: item.abstractOrSnippet,
    language: item.language,
    doi: item.doi || '',
    arxivId: item.arxivId || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    rawMeta: item.rawMeta ?? {},
  }
}

export function createPublisherScheduler({ resolveWorkspaceRoot, collectSignalItems, fetchWithTimeout, runCodex }) {
  const store = createPublisherStore()
  const internalPublisher = createInternalPublisher({ store })
  const xPublisher = createOptionalXPublisher({ fetchWithTimeout })
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

  async function getPublisherStatuses(settings) {
    const [internalStatus, xStatus] = await Promise.all([
      internalPublisher.getStatus(settings),
      xPublisher.getStatus(settings),
    ])
    return [internalStatus, xStatus]
  }

  async function getStatus() {
    const workspaceRoot = await getWorkspaceRoot()
    const { settings, state, queue, logs, published } = await store.listState(workspaceRoot)
    const publishers = await getPublisherStatuses(settings)
    return {
      settings,
      state,
      queue,
      logs,
      published,
      metrics: computeMetrics(queue, published, state.providerStats || [], publishers),
      publishers,
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
        nextIngestAt:
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

  async function saveQueueAndState(workspaceRoot, queue, published, state, settings) {
    const [savedQueue, savedState] = await Promise.all([
      store.saveQueue(workspaceRoot, queue, settings),
      store.saveState(workspaceRoot, state, settings),
    ])

    return { queue: savedQueue, state: savedState, published }
  }

  function buildNextPublishState(queue, state) {
    const scheduledTimes = collectScheduledTimes(queue)
    return {
      ...state,
      nextPublishAt: scheduledTimes.length > 0 ? new Date(scheduledTimes[0]).toISOString() : null,
    }
  }

  async function runIngestNow({ limit, force = false, reason = 'manual', seedItems = [] } = {}) {
    const workspaceRoot = await getWorkspaceRoot()
    const init = await store.ensureInitialized(workspaceRoot)
    const settings = init.settings
    const queueLimit = Math.max(1, Number(limit || settings.defaultQueueLimit || 3))
    const previousState = await store.getState(workspaceRoot, settings)
    const existingQueue = await store.getQueue(workspaceRoot, settings)
    const published = await store.getPublished(workspaceRoot, settings)
    const currentTime = nowIso()
    const providers = createSourceProviders({ fetchWithTimeout, collectSignalItems })
    const providerStats = []
    const logs = []
    const nextQueue = [...existingQueue]
    const createdDrafts = []
    const skippedDrafts = []
    const collectedItems = []

    const log = async (level, action, message, draftId = null, meta = null) => {
      const entry = createPublisherLog(level, action, message, draftId, meta)
      logs.push(entry)
      await appendLog(workspaceRoot, entry, settings)
      return entry
    }

    for (const provider of providers) {
      const enabled = Boolean(provider.enabled(settings))
      const providerStat = {
        provider: provider.id,
        label: provider.label,
        sourceType: provider.sourceType,
        enabled,
        lastFetchedAt: currentTime,
        lastFetchedCount: 0,
        lastDraftCount: 0,
        lastSkippedCount: 0,
        lastError: '',
      }

      if (!enabled) {
        providerStats.push(providerStat)
        continue
      }

      try {
        const items = await provider.fetchNormalized({ settings, limit: Math.max(queueLimit * 2, 6) })
        providerStat.lastFetchedCount = items.length
        collectedItems.push(...items)
        await log('info', 'source-fetch', `${provider.label}에서 ${items.length}개 항목을 수집했습니다.`, null, {
          provider: provider.id,
          count: items.length,
          reason,
        })
      } catch (error) {
        providerStat.lastError = error instanceof Error ? error.message : 'source fetch failed'
        await log('warning', 'source-fetch-failed', `${provider.label} 수집에 실패했습니다.`, null, {
          provider: provider.id,
          error: providerStat.lastError,
        })
      }

      providerStats.push(providerStat)
    }

    if (seedItems.length > 0) {
      for (const item of seedItems) {
        const normalized = buildSourceSnapshot({
          id: item.id || `seed-${Date.now().toString(36)}`,
          provider: item.provider || 'legacySignals',
          sourceType:
            item.sourceType === 'paper' || item.sourceType === 'news' || item.sourceType === 'feed'
              ? item.sourceType
              : item.sourceType === 'arxiv'
                ? 'paper'
                : item.sourceType === 'github' || item.sourceType === 'hackerNews'
                  ? 'news'
                  : 'feed',
          canonicalUrl: item.canonicalUrl || item.url || item.sourceUrl || '',
          sourceUrl: item.sourceUrl || item.url || '',
          title: item.title || item.sourceTitle || '',
          subtitle: item.sourceLabel || item.source || '',
          authors: item.authorOrChannel ? [item.authorOrChannel] : Array.isArray(item.authors) ? item.authors : [],
          publishedAt: item.publishedAt || nowIso(),
          abstractOrSnippet: item.summary || item.abstractOrSnippet || item.sourceSummary || '',
          language: item.language || '',
          doi: item.doi || '',
          arxivId: item.arxivId || '',
          tags: [item.category || item.categoryLabel || '', item.sourceLabel || item.source || ''].filter(Boolean),
          rawMeta: item.rawMeta || {},
        })
        collectedItems.push(normalized)
      }
    }

    const rankedCandidates = rankNormalizedItems(collectedItems)
    const selectedCandidates = rankedCandidates.slice(0, queueLimit)

    for (const candidate of selectedCandidates) {
      const sourceSnapshot = buildSourceSnapshot(candidate)
      const gate = force
        ? {
            ok: true,
            topicHash: buildTopicHash(sourceSnapshot),
            noveltyScore: 1,
          }
        : validateNormalizedCandidate({
            sourceItem: sourceSnapshot,
            existingItems: [...nextQueue, ...published],
            settings,
          })
      const draftId = createDraftId(sourceSnapshot)

      if (!gate.ok) {
        const skipped = {
          id: draftId,
          createdAt: currentTime,
          updatedAt: currentTime,
          status: 'skipped',
          provider: sourceSnapshot.provider,
          sourceLabel: sourceLabelForProvider(sourceSnapshot.provider),
          sourceType: sourceSnapshot.sourceType,
          category: categoryLabelForSourceType(sourceSnapshot.sourceType),
          sourceTitle: sourceSnapshot.title,
          sourceSummary: sourceSnapshot.abstractOrSnippet,
          sourceUrl: sourceSnapshot.sourceUrl,
          canonicalUrl: sourceSnapshot.canonicalUrl,
          subtitle: sourceSnapshot.subtitle,
          authors: sourceSnapshot.authors,
          sourcePublishedAt: sourceSnapshot.publishedAt,
          publishedAt: null,
          language: sourceSnapshot.language,
          doi: sourceSnapshot.doi,
          arxivId: sourceSnapshot.arxivId,
          tags: sourceSnapshot.tags,
          topicHash: gate.topicHash,
          noveltyScore: gate.noveltyScore,
          generatedText: '',
          summaryType: 'brief-points',
          scheduledAt: null,
          publishTarget: 'internal',
          crossPostToX: settings.publishXEnabled,
          errorReason: gate.reason,
          skipReason: gate.reason,
          promptVersion: PUBLISHER_PROMPT_VERSION,
          generationModel: settings.generationModel,
          publishResult: null,
          internalPostId: null,
          xPostId: null,
          sourceMeta: sourceSnapshot,
          approvedAt: null,
          attempts: 0,
          lastAttemptAt: null,
          retryCount: 0,
          nextRetryAt: null,
        }
        nextQueue.unshift(skipped)
        skippedDrafts.push(skipped)
        const providerStat = providerStats.find((item) => item.provider === skipped.provider)
        if (providerStat) {
          providerStat.lastSkippedCount += 1
        }
        await log('warning', 'draft-skipped', gate.reason, draftId, {
          provider: skipped.provider,
          sourceUrl: skipped.sourceUrl,
          topicHash: gate.topicHash,
        })
        continue
      }

      const generated = await generatePublisherDraft({ item: sourceSnapshot, settings, runCodex })
      const draft = {
        id: draftId,
        createdAt: currentTime,
        updatedAt: currentTime,
        status: settings.mode === 'auto' ? 'approved' : 'draft',
        provider: sourceSnapshot.provider,
        sourceLabel: sourceLabelForProvider(sourceSnapshot.provider),
        sourceType: sourceSnapshot.sourceType,
        category: categoryLabelForSourceType(sourceSnapshot.sourceType),
        sourceTitle: sourceSnapshot.title,
        sourceSummary: sourceSnapshot.abstractOrSnippet,
        sourceUrl: sourceSnapshot.sourceUrl,
        canonicalUrl: sourceSnapshot.canonicalUrl,
        subtitle: sourceSnapshot.subtitle,
        authors: sourceSnapshot.authors,
        sourcePublishedAt: sourceSnapshot.publishedAt,
        publishedAt: null,
        language: sourceSnapshot.language,
        doi: sourceSnapshot.doi,
        arxivId: sourceSnapshot.arxivId,
        tags: sourceSnapshot.tags,
        topicHash: gate.topicHash,
        noveltyScore: gate.noveltyScore,
        generatedText: generated.text,
        summaryType: generated.summaryType,
        scheduledAt: null,
        publishTarget: 'internal',
        crossPostToX: settings.publishXEnabled,
        errorReason: null,
        skipReason: null,
        promptVersion: generated.promptVersion,
        generationModel: generated.model,
        publishResult: null,
        internalPostId: null,
        xPostId: null,
        sourceMeta: sourceSnapshot,
        approvedAt: settings.mode === 'auto' ? currentTime : null,
        attempts: 0,
        lastAttemptAt: null,
        retryCount: 0,
        nextRetryAt: null,
      }

      const validation = validateGeneratedDraft({
        text: draft.generatedText,
        draft,
        existingItems: [...nextQueue, ...published],
        settings,
      })
      if (!validation.ok) {
        draft.status = 'skipped'
        draft.errorReason = validation.reason
        draft.skipReason = validation.reason
        nextQueue.unshift(draft)
        skippedDrafts.push(draft)
        const providerStat = providerStats.find((item) => item.provider === draft.provider)
        if (providerStat) {
          providerStat.lastSkippedCount += 1
        }
        await log('warning', 'draft-skipped', validation.reason, draftId, {
          provider: draft.provider,
          similarityScore: validation.similarityScore,
        })
        continue
      }

      nextQueue.unshift(draft)
      createdDrafts.push(draft)
      const providerStat = providerStats.find((item) => item.provider === draft.provider)
      if (providerStat) {
        providerStat.lastDraftCount += 1
      }
      await log('info', 'draft-created', `${draft.sourceTitle} 초안을 생성했습니다.`, draftId, {
        provider: draft.provider,
        noveltyScore: draft.noveltyScore,
        usedFallback: generated.usedFallback,
        summaryType: draft.summaryType,
        reason,
      })
    }

    const scheduledQueue =
      settings.mode === 'auto'
        ? computeScheduleForApprovedDrafts(nextQueue, published, settings)
        : nextQueue

    const nextState = buildNextPublishState(scheduledQueue, {
      ...previousState,
      lastIngestRunAt: currentTime,
      nextIngestAt:
        settings.mode === 'dry-run'
          ? null
          : new Date(Date.now() + settings.minIntervalMinutes * 60_000).toISOString(),
      lastDraftId: createdDrafts[0]?.id ?? previousState.lastDraftId,
      skippedDraftIds: [...(previousState.skippedDraftIds ?? []), ...skippedDrafts.map((item) => item.id)].slice(-500),
      lastError: '',
      providerStats,
      updatedAt: nowIso(),
    })

    const saved = await saveQueueAndState(workspaceRoot, scheduledQueue, published, nextState, settings)
    return {
      ok: true,
      createdCount: createdDrafts.length,
      skippedCount: skippedDrafts.length,
      items: createdDrafts,
      skipped: skippedDrafts,
      state: saved.state,
      queue: saved.queue,
      logs,
      published,
    }
  }

  async function approveDraft(id) {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot, settings)
    const published = await store.getPublished(workspaceRoot, settings)
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
    await appendLog(workspaceRoot, createPublisherLog('success', 'draft-approved', `${draft.sourceTitle} 초안을 승인했습니다.`, id), settings)

    const nextQueue = computeScheduleForApprovedDrafts(queue, published, settings)
    const scheduledDraft = nextQueue.find((item) => item.id === id)

    if (scheduledDraft?.status === 'scheduled' && scheduledDraft.scheduledAt) {
      await appendLog(
        workspaceRoot,
        createPublisherLog(
          'info',
          'draft-scheduled',
          `${draft.sourceTitle} 초안에 다음 게시 슬롯을 배정했습니다.`,
          id,
          { scheduledAt: scheduledDraft.scheduledAt },
        ),
        settings,
      )
    }

    const saved = await saveQueueAndState(
      workspaceRoot,
      nextQueue,
      published,
      buildNextPublishState(nextQueue, state),
      settings,
    )
    return { ok: true, item: saved.queue.find((item) => item.id === id) ?? draft, state: saved.state }
  }

  async function rejectDraft(id, reason = 'operator_rejected') {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot, settings)
    const published = await store.getPublished(workspaceRoot, settings)
    const queue = await store.getQueue(workspaceRoot, settings)
    const draft = queue.find((item) => item.id === id)

    if (!draft) {
      throw new Error('거절할 draft를 찾지 못했습니다.')
    }

    draft.status = 'skipped'
    draft.skipReason = reason
    draft.errorReason = reason
    draft.updatedAt = nowIso()
    await appendLog(workspaceRoot, createPublisherLog('warning', 'draft-rejected', `${draft.sourceTitle} 초안을 제외했습니다.`, id, { reason }), settings)

    const saved = await saveQueueAndState(
      workspaceRoot,
      queue,
      published,
      { ...state, skippedDraftIds: [...(state.skippedDraftIds ?? []), id].slice(-500) },
      settings,
    )

    return { ok: true, item: saved.queue.find((item) => item.id === id) ?? draft, state: saved.state }
  }

  async function publishDraftNow(id, { dryRun = false, now = Date.now(), queueOverride = null } = {}) {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot, settings)
    const published = await store.getPublished(workspaceRoot, settings)
    const queue = queueOverride ?? (await store.getQueue(workspaceRoot, settings))
    const draft = queue.find((item) => item.id === id)

    if (!draft) {
      throw new Error('게시할 draft를 찾지 못했습니다.')
    }
    if (draft.status === 'published') {
      return { ok: true, item: draft, state }
    }

    const nextEligibleTime = getNextEligiblePublishTime(queue, published, settings, id, now)
    if (!dryRun && settings.mode !== 'dry-run' && nextEligibleTime > now) {
      draft.status = 'scheduled'
      draft.scheduledAt = new Date(nextEligibleTime).toISOString()
      draft.nextRetryAt = null
      draft.updatedAt = new Date(now).toISOString()
      draft.errorReason = `현재 cap을 넘겨 즉시 게시하지 않고 다음 슬롯 ${draft.scheduledAt}로 이동합니다.`

      await appendLog(
        workspaceRoot,
        createPublisherLog(
          'warning',
          'publish-delayed',
          `${draft.sourceTitle} 게시를 즉시 처리하지 않고 예약으로 돌렸습니다.`,
          id,
          { scheduledAt: draft.scheduledAt },
        ),
        settings,
      )

      const nextState = buildNextPublishState(queue, {
        ...state,
        lastPublishAttemptAt: new Date(now).toISOString(),
        lastError: draft.errorReason,
      })
      const saved = await saveQueueAndState(workspaceRoot, queue, published, nextState, settings)
      return {
        ok: true,
        item: saved.queue.find((item) => item.id === id) ?? draft,
        state: saved.state,
        detail: draft.errorReason,
      }
    }

    draft.attempts = Number(draft.attempts ?? 0) + 1
    draft.lastAttemptAt = nowIso()
    draft.updatedAt = draft.lastAttemptAt

    const internalResult = await internalPublisher.publish({
      workspaceRoot,
      settings,
      draft,
      dryRun: dryRun || settings.mode === 'dry-run',
    })

    if (internalResult.ok) {
      draft.status = 'published'
      draft.publishedAt = internalResult.publishedAt
      draft.internalPostId = internalResult.internalPostId
      draft.errorReason = null
      draft.skipReason = null
      draft.updatedAt = internalResult.publishedAt || nowIso()
      draft.publishResult = {
          internal: {
            simulated: internalResult.simulated,
            detail: internalResult.detail,
            internalPostId: internalResult.internalPostId,
            publishedAt: internalResult.publishedAt,
        },
      }

      let xResult = null
      if (settings.publishXEnabled && draft.crossPostToX) {
        xResult = await xPublisher.publish({
          text: draft.generatedText,
          dryRun: dryRun || settings.mode === 'dry-run',
        })
        draft.publishResult.x = xResult
        if (xResult.ok && xResult.xPostId) {
          draft.xPostId = xResult.xPostId
        }
      }

      await appendLog(
        workspaceRoot,
        createPublisherLog(
          'success',
          'publish-success',
          internalResult.simulated
            ? `${draft.sourceTitle} 게시를 dry-run으로 시뮬레이션했습니다.`
            : `${draft.sourceTitle} 게시를 내부 피드에 반영했습니다.`,
          id,
          {
            internalPostId: internalResult.internalPostId,
            crossPostStatus: xResult?.ok ? 'posted' : xResult?.disabled ? 'disabled' : xResult ? 'failed' : 'not-requested',
          },
        ),
        settings,
      )

      if (xResult && !xResult.ok && !xResult.disabled) {
        await appendLog(
          workspaceRoot,
          createPublisherLog(
            'warning',
            'cross-post-failed',
            `${draft.sourceTitle} 내부 게시는 성공했지만 X cross-post는 실패했습니다.`,
            id,
            { message: xResult.error?.message || xResult.detail || 'x cross-post failed' },
          ),
          settings,
        )
      }

      const nextPublished = internalResult.post ? [internalResult.post, ...published] : published
      const saved = await saveQueueAndState(
        workspaceRoot,
        queue,
        nextPublished,
        buildNextPublishState(queue, {
          ...state,
          lastPublishAttemptAt: draft.lastAttemptAt,
          lastPublishedAt: draft.publishedAt,
          lastError: '',
          publishedDraftIds: [...(state.publishedDraftIds ?? []), id].slice(-500),
        }),
        settings,
      )

      return {
        ok: true,
        item: saved.queue.find((item) => item.id === id) ?? draft,
        state: saved.state,
        detail: internalResult.detail ?? null,
        simulated: internalResult.simulated,
      }
    }

    const retryCount = Number(draft.retryCount ?? 0) + 1
    const shouldRetry = retryCount <= settings.retryLimit && !internalResult.disabled
    const retryAt = shouldRetry ? new Date(Date.now() + settings.retryBackoffMinutes * 60_000 * retryCount).toISOString() : null

    draft.status = internalResult.disabled ? 'disabled' : shouldRetry ? 'scheduled' : 'failed'
    draft.retryCount = retryCount
    draft.nextRetryAt = retryAt
    draft.scheduledAt = retryAt
    draft.errorReason = internalResult.detail || '게시 요청이 실패했습니다.'
    draft.updatedAt = nowIso()

    await appendLog(
      workspaceRoot,
      createPublisherLog('error', 'publish-failed', `${draft.sourceTitle} 게시에 실패했습니다: ${draft.errorReason}`, id, {
        retryAt,
        retryCount,
        disabled: internalResult.disabled ?? false,
      }),
      settings,
    )

    const saved = await saveQueueAndState(
      workspaceRoot,
      queue,
      published,
      buildNextPublishState(queue, {
        ...state,
        lastPublishAttemptAt: draft.lastAttemptAt,
        lastError: draft.errorReason,
      }),
      settings,
    )

    return {
      ok: false,
      item: saved.queue.find((item) => item.id === id) ?? draft,
      state: saved.state,
      error: internalResult.error,
      detail: internalResult.detail ?? null,
    }
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
        if (settings.mode !== 'dry-run' && state.nextIngestAt && Date.parse(state.nextIngestAt) <= Date.now()) {
          await runIngestNow({ limit: settings.defaultQueueLimit, force: false, reason })
        }

        const queue = await store.getQueue(workspaceRoot, settings)
        const published = await store.getPublished(workspaceRoot, settings)
        const dueScheduledItems = queue.filter((item) => {
          const dueTime = Date.parse(item.scheduledAt || item.nextRetryAt || 0)
          return item.status === 'scheduled' && Number.isFinite(dueTime) && dueTime <= Date.now()
        })

        if (dueScheduledItems.length > 0) {
          await publishDraftNow(dueScheduledItems[0].id)
        } else {
          const queueWithScheduled = computeScheduleForApprovedDrafts(queue, published, settings)
          const changed = queueWithScheduled.some((item, index) => item.scheduledAt !== queue[index]?.scheduledAt || item.status !== queue[index]?.status)
          if (changed) {
            await saveQueueAndState(
              workspaceRoot,
              queueWithScheduled,
              published,
              buildNextPublishState(queueWithScheduled, await store.getState(workspaceRoot, settings)),
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
      await store.saveState(workspaceRoot, { ...state, nextIngestAt: null, nextPublishAt: null, inProgress: false }, settings)
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
      {
        ...state,
        nextIngestAt: state.nextIngestAt || new Date(Date.now() + settings.minIntervalMinutes * 60_000).toISOString(),
      },
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
    runNow: runIngestNow,
    approveDraft,
    rejectDraft,
    publishDraftNow,
  }
}
