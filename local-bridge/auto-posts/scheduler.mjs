import path from 'node:path'
import { enrichSignalCandidates, selectTopCandidates, toSignalCandidate } from './collector.mjs'
import { AUTO_POST_PROMPT_VERSION, generateAutoPost } from './generator.mjs'
import { canonicalizeUrl, nowIso } from './normalize.mjs'
import { createAutoPostsStore } from './store.mjs'

const STARTUP_DELAY_MS = Math.max(
  10_000,
  Math.min(Number(process.env.ARTEMIS_AUTO_POST_STARTUP_DELAY_MS ?? 15_000), 30_000),
)

function createRunId() {
  return `auto-post-run-${Date.now().toString(36)}`
}

function createPostId(candidate, createdAt) {
  return `auto-post-${createdAt.replace(/[-:TZ.]/g, '').slice(0, 14)}-${candidate.dedupeKey.slice(0, 10)}`
}

function createLogger(runLogs, level, message) {
  const entry = {
    id: `${level}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    createdAt: nowIso(),
  }
  runLogs.push(entry)
  return entry
}

function safeErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId = null
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}

export function createAutoPostsScheduler({
  resolveWorkspaceRoot,
  collectSignalItems,
  fetchWithTimeout,
  revealWorkspacePath,
  runCodex,
}) {
  const store = createAutoPostsStore()
  let startupTimer = null
  let intervalTimer = null
  let activeRunPromise = null

  async function getWorkspaceRoot() {
    const workspace = await resolveWorkspaceRoot()
    return workspace.rootPath ?? workspace
  }

  async function getCurrentSettings() {
    const workspaceRoot = await getWorkspaceRoot()
    return store.getSettings(workspaceRoot)
  }

  async function getCurrentState() {
    const workspaceRoot = await getWorkspaceRoot()
    return store.getState(workspaceRoot)
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

  async function scheduleLoop() {
    clearTimers()

    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot)

    if (!settings.enabled) {
      await store.saveState(
        workspaceRoot,
        {
          ...state,
          nextRunAt: null,
          inProgress: false,
        },
        settings,
      )
      return
    }

    startupTimer = setTimeout(() => {
      void runNow({ reason: 'startup' }).catch((error) => {
        console.warn('[auto-posts] startup run skipped', safeErrorMessage(error, 'startup run failed'))
      })
    }, STARTUP_DELAY_MS)

    intervalTimer = setInterval(() => {
      void runNow({ reason: 'interval' }).catch((error) => {
        console.warn('[auto-posts] interval run skipped', safeErrorMessage(error, 'interval run failed'))
      })
    }, settings.intervalMs)

    await store.saveState(
      workspaceRoot,
      {
        ...state,
        nextRunAt: new Date(Date.now() + settings.intervalMs).toISOString(),
      },
      settings,
    )
  }

  async function generateText({ prompt, model }) {
    const workspaceRoot = await getWorkspaceRoot()
    const cwd = workspaceRoot

    const response = await withTimeout(
      runCodex({
        prompt,
        messages: [],
        settings: {
          agentName: 'Artemis Auto Posts',
          tone: '차분한 편집자 브리핑',
          responseStyle: 'JSON 객체',
          customInstructions:
            '항상 한국어로 작성하고, HTML 본문은 기사형 레이아웃을 유지하며, 확인되지 않은 사실을 만들지 마세요.',
          userName: '마스터',
          userRole: '',
          organization: 'Artemis',
          interests: ['AI signal tracking', 'automation'],
          language: '한국어',
          timezone: 'Asia/Seoul',
          locationSharing: false,
          modelProvider: 'codex',
          ollamaModel: '',
          codexModel: model,
        },
        agent: {
          id: 'auto-post-generator',
          name: 'Artemis Auto Posts',
          provider: 'codex',
          preset: 'writing',
          model,
          systemPrompt:
            '당신은 최신 AI 시그널을 한국어 장문 기사형 HTML로 정리하는 편집자다. 입력에 없는 사실을 만들지 말고 JSON만 반환하라.',
        },
        cwd,
        workspaceRoot,
        enabledTools: [],
      }),
      75_000,
      'Codex 기사 생성 시간이 초과되었습니다. 규칙 기반 기사로 대체합니다.',
    )

    return response
  }

  async function resolveRegenerateCandidates({
    regeneratePost,
    category,
    storage,
    settings,
    runLogs,
  }) {
    const savedUrls = new Set(
      (regeneratePost?.sourceItems ?? [])
        .map((item) => canonicalizeUrl(item?.url || ''))
        .filter(Boolean),
    )
    const savedIds = new Set(
      (regeneratePost?.sourceItems ?? [])
        .map((item) => String(item?.id || '').trim())
        .filter(Boolean),
    )

    const rawItems = await collectSignalItems(category)
    const matchedRawItems = rawItems.filter((item) => {
      const nextId = String(item?.id || '').trim()
      const nextUrl = canonicalizeUrl(item?.url || '')
      return (nextId && savedIds.has(nextId)) || (nextUrl && savedUrls.has(nextUrl))
    })

    if (matchedRawItems.length > 0) {
      createLogger(runLogs, 'info', `최신 시그널에서 재생성 대상 ${matchedRawItems.length}건을 다시 찾았습니다.`)
      return enrichSignalCandidates(
        matchedRawItems.map((item) => toSignalCandidate(item)),
        {
          fetchWithTimeout,
          mediaCacheDir: storage.storagePaths.mediaRoot,
          screenshotFallback: settings.screenshotFallback,
        },
      )
    }

    createLogger(runLogs, 'warning', '최신 시그널에서 같은 항목을 찾지 못해 저장된 소스를 다시 정제합니다.')
    return enrichSignalCandidates(
      (regeneratePost?.sourceItems ?? []).map((item) =>
        toSignalCandidate({
          id: item.id,
          category: item.category,
          title: item.title,
          summary: item.summary,
          url: item.url,
          sourceLabel: item.sourceLabel,
          source: item.rawMeta?.originalSource || item.sourceType || 'webpage',
          publishedAt: item.publishedAt,
          discoveredAt: item.discoveredAt,
          score: item.score,
          language: item.language,
          authorOrChannel: item.authorOrChannel,
          rawMeta: item.rawMeta,
          originalTitle: item.rawMeta?.originalTitle || '',
          originalSummary: item.rawMeta?.originalSummary || '',
        }),
      ),
      {
        fetchWithTimeout,
        mediaCacheDir: storage.storagePaths.mediaRoot,
        screenshotFallback: settings.screenshotFallback,
      },
    )
  }

  function parseLocalizationPayload(rawText = '') {
    const normalized = String(rawText ?? '')
      .replace(/```json/gi, '```')
      .replace(/```/g, '')
      .trim()
    const objectMatch = normalized.match(/\[[\s\S]*\]/)
    if (!objectMatch) {
      return []
    }

    try {
      const parsed = JSON.parse(objectMatch[0])
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function hasKoreanSignalText(value = '') {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!normalized) {
      return false
    }

    const matches = normalized.match(/[가-힣]/g)
    return Array.isArray(matches) && matches.length >= 6
  }

  async function localizeCandidatesForGeneration(candidates, settings, runLogs) {
    if (!Array.isArray(candidates) || candidates.length === 0 || typeof runCodex !== 'function') {
      return candidates
    }

    const targets = candidates.filter((item) => {
      const title = String(item?.title || '').trim()
      const summary = String(item?.summary || '').trim()
      return !hasKoreanSignalText(title) || !hasKoreanSignalText(summary)
    })

    if (targets.length === 0) {
      return candidates
    }

    createLogger(runLogs, 'info', `기사 입력 품질을 위해 후보 ${targets.length}건을 한국어로 보정합니다.`)

    try {
      const workspaceRoot = await getWorkspaceRoot()
      const response = await withTimeout(
        runCodex({
          prompt: [
          '다음 공개 기술 소스 후보를 내부 기사 생성용 한국어 입력으로만 정리하세요.',
          '없는 사실을 만들지 말고, 제목은 한국어 기사형 헤드라인으로 1줄만 쓰세요.',
          '고유명사, 저장소 이름, 제품명은 필요한 범위에서 영어를 유지해도 됩니다.',
          '요약은 2~4문장 한국어로 작성하고, JSON-LD, 스키마, 마크업, 코드 조각을 절대 넣지 마세요.',
          '반드시 JSON 배열만 반환하세요.',
          '형식: [{"id":"...", "title":"...", "summary":"..."}]',
          JSON.stringify(
            targets.map((item) => ({
              id: item.id,
              sourceType: item.sourceType,
              sourceLabel: item.sourceLabel,
              category: item.categoryLabel || item.category,
              title: item.title,
              summary: item.summary,
              authorOrChannel: item.authorOrChannel,
              metaDescription: item.rawMeta?.pageMeta?.description || item.rawMeta?.description || '',
              htmlSnippet: item.rawMeta?.pageMeta?.htmlSnippet || '',
              stars: item.rawMeta?.stars ?? null,
              forks: item.rawMeta?.forks ?? null,
              points: item.rawMeta?.points ?? null,
              comments: item.rawMeta?.comments ?? null,
              primaryCategory: item.rawMeta?.primaryCategory || '',
              originalTitle: item.rawMeta?.originalTitle || '',
              originalSummary: item.rawMeta?.originalSummary || '',
            })),
          ),
        ].join('\n\n'),
        messages: [],
        settings: {
          agentName: 'Artemis Auto Posts Localizer',
          tone: '차분한 기술 브리핑',
          responseStyle: 'JSON 배열',
          customInstructions:
            '항상 한국어로 작성하고, 없는 사실을 추가하지 말고, 공개 메타데이터 범위를 넘지 마세요.',
          userName: '마스터',
          userRole: '',
          organization: 'Artemis',
          interests: ['AI signal tracking', 'automation'],
          language: '한국어',
          timezone: 'Asia/Seoul',
          locationSharing: false,
          modelProvider: 'codex',
          ollamaModel: '',
          codexModel: settings.generationModel,
        },
        agent: {
          id: 'auto-post-localizer',
          name: 'Artemis Auto Posts Localizer',
          provider: 'codex',
          preset: 'writing',
          model: settings.generationModel,
          systemPrompt:
            '당신은 공개 기술 소스 메타데이터를 한국어 기사 입력으로 정리하는 편집자다. 입력에 없는 사실을 만들지 말고 JSON 배열만 반환하라.',
        },
          cwd: workspaceRoot,
          workspaceRoot,
          enabledTools: [],
        }),
        20_000,
        '후보 한국어 보정 시간이 초과되었습니다.',
      )

      const localizedItems = parseLocalizationPayload(response?.text || response || '')
      if (localizedItems.length === 0) {
        createLogger(runLogs, 'warning', '한국어 보정 응답이 비어 있어 기존 후보 텍스트를 유지합니다.')
        return candidates
      }

      const localizedMap = new Map(
        localizedItems
          .filter((item) => item && typeof item.id === 'string')
          .map((item) => [
            item.id,
            {
              title: String(item.title || '').trim(),
              summary: String(item.summary || '').trim(),
            },
          ]),
      )

      return candidates.map((candidate) => {
        const localized = localizedMap.get(candidate.id)
        if (!localized) {
          return candidate
        }

        return {
          ...candidate,
          title: hasKoreanSignalText(localized.title) ? localized.title : candidate.title,
          summary: hasKoreanSignalText(localized.summary) ? localized.summary : candidate.summary,
          rawMeta: {
            ...(candidate.rawMeta ?? {}),
            localizedTitle: localized.title || candidate.rawMeta?.localizedTitle || '',
            localizedSummary: localized.summary || candidate.rawMeta?.localizedSummary || '',
          },
        }
      })
    } catch (error) {
      createLogger(
        runLogs,
        'warning',
        `기사 입력 한국어 보정이 실패해 기존 후보 텍스트를 유지합니다: ${safeErrorMessage(error, '보정 실패')}`,
      )
      return candidates
    }
  }

  function buildSchedulerResponse(savedPosts, logs, selectionInfo) {
    return {
      ok: true,
      runId: createRunId(),
      createdCount: savedPosts.length,
      posts: savedPosts.map((item) => item.summary),
      selectedCandidates: selectionInfo,
      logs,
    }
  }

  async function executeGeneration({
    reason = 'manual',
    category = '전체',
    limit = null,
    force = false,
    regeneratePost = null,
  } = {}) {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const previousState = await store.getState(workspaceRoot)
    const storage = await store.ensureInitialized(workspaceRoot)
    const runLogs = []
    const schedulerRunAt = nowIso()

    await store.saveState(
      workspaceRoot,
      {
        ...previousState,
        inProgress: true,
        lastRunAt: schedulerRunAt,
        lastError: '',
      },
      settings,
    )

    createLogger(runLogs, 'info', `자동 게시글 실행을 시작했습니다. (${reason})`)
    const chosenLimit = Math.max(1, Math.min(Number(limit ?? settings.topK), 3))

    try {
      let selectedCandidates = []

      if (regeneratePost) {
        createLogger(runLogs, 'info', `기존 게시글 ${regeneratePost.id}를 같은 소스로 재생성합니다.`)
        selectedCandidates = await resolveRegenerateCandidates({
          regeneratePost,
          category,
          storage,
          settings,
          runLogs,
        })
        } else {
          const rawItems = await collectSignalItems(category)
          createLogger(runLogs, 'info', `시그널 후보 ${rawItems.length}건을 수집했습니다.`)

        const candidates = rawItems.map((item) => toSignalCandidate(item))
        const enriched = await enrichSignalCandidates(candidates, {
          fetchWithTimeout,
          mediaCacheDir: storage.storagePaths.mediaRoot,
          screenshotFallback: settings.screenshotFallback,
        })

        createLogger(runLogs, 'info', `메타데이터 확장을 마친 후보 ${enriched.length}건을 점수화합니다.`)
        selectedCandidates = selectTopCandidates(enriched, {
          topK: chosenLimit,
          categoryWeights: settings.categoryWeights,
            processedUrlHashes: force ? [] : previousState.processedUrlHashes,
          })
        }

        selectedCandidates = await localizeCandidatesForGeneration(selectedCandidates, settings, runLogs)

        const savedPosts = []
        const usedCandidateHashes = []
      const selectionInfo = selectedCandidates.map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        score: item.score,
        category: item.category,
      }))

      for (const primaryCandidate of selectedCandidates.slice(0, chosenLimit)) {
        const relatedCandidates = selectedCandidates
          .filter((item) => item.id !== primaryCandidate.id && item.category === primaryCandidate.category)
          .slice(0, 2)

        if (!force && !regeneratePost) {
          const alreadyExists = await store.hasPostWithDedupeKey(workspaceRoot, primaryCandidate.dedupeKey)
          if (alreadyExists) {
            createLogger(runLogs, 'warning', `${primaryCandidate.title}는 이미 저장된 dedupeKey가 있어 건너뜁니다.`)
            continue
          }
        }

        createLogger(runLogs, 'info', `${primaryCandidate.title} 게시글을 생성합니다.`)

        try {
          const generated = await generateAutoPost({
            primaryCandidate,
            relatedCandidates,
            mediaAttachments: primaryCandidate.mediaAttachments ?? [],
            schedulerRunAt,
            generationModel: settings.generationModel,
            generateText,
          })

          const createdAt = regeneratePost?.createdAt || nowIso()
          const updatedAt = nowIso()
          const postId = regeneratePost?.id || createPostId(primaryCandidate, createdAt)
          const post = {
            id: postId,
            slug: generated.slug,
            createdAt,
            updatedAt,
            schedulerRunAt,
            status: generated.html ? 'ready' : 'failed',
            topicScore: primaryCandidate.score,
            title: generated.title,
            subtitleLines: generated.subtitleLines,
            lead: generated.lead,
            category: primaryCandidate.categoryLabel || primaryCandidate.category,
            tags: generated.tags,
            sourceItems: [primaryCandidate, ...relatedCandidates],
            mediaAttachments: primaryCandidate.mediaAttachments ?? [],
            html: generated.html,
            plainTextSummary: generated.plainTextSummary,
            threeLineSummary: generated.threeLineSummary,
            dedupeKey: primaryCandidate.dedupeKey,
            workspacePath: '',
            generationModel: generated.generationModel || settings.generationModel,
            generationPromptVersion: generated.generationPromptVersion || AUTO_POST_PROMPT_VERSION,
            errors: generated.errors || [],
            logs: [...runLogs],
          }

          const saved = await store.saveGeneratedPost(workspaceRoot, post, settings)
          savedPosts.push(saved)
          usedCandidateHashes.push(primaryCandidate.dedupeKey)
          createLogger(runLogs, 'info', `${saved.title} 게시글을 저장했습니다.`)
        } catch (error) {
          createLogger(
            runLogs,
            'error',
            `${primaryCandidate.title} 게시글 생성에 실패했습니다: ${safeErrorMessage(error, '생성 실패')}`,
          )
        }
      }

      const nextState = await store.saveState(
        workspaceRoot,
        {
          ...previousState,
          inProgress: false,
          lastRunAt: schedulerRunAt,
          lastSuccessAt: savedPosts.length > 0 ? schedulerRunAt : previousState.lastSuccessAt,
          nextRunAt: settings.enabled ? new Date(Date.now() + settings.intervalMs).toISOString() : null,
          lastError: savedPosts.length > 0 ? '' : '생성 가능한 새 게시글이 없었습니다.',
          processedUrlHashes: [...previousState.processedUrlHashes, ...usedCandidateHashes],
          generatedPostIds: [
            ...previousState.generatedPostIds,
            ...savedPosts.map((item) => item.id),
          ],
        },
        settings,
      )

      return {
        ...buildSchedulerResponse(savedPosts, runLogs, selectionInfo),
        state: nextState,
      }
    } catch (error) {
      const message = safeErrorMessage(error, '자동 게시글 실행에 실패했습니다.')
      createLogger(runLogs, 'error', message)
      const nextState = await store.saveState(
        workspaceRoot,
        {
          ...previousState,
          inProgress: false,
          lastRunAt: schedulerRunAt,
          nextRunAt: settings.enabled ? new Date(Date.now() + settings.intervalMs).toISOString() : null,
          lastError: message,
        },
        settings,
      )
      return {
        ok: false,
        runId: createRunId(),
        createdCount: 0,
        posts: [],
        selectedCandidates: [],
        logs: runLogs,
        state: nextState,
        error: message,
      }
    }
  }

  async function runNow(options = {}) {
    if (activeRunPromise) {
      throw new Error('자동 게시글 생성이 이미 실행 중입니다.')
    }

    activeRunPromise = executeGeneration(options)
    try {
      return await activeRunPromise
    } finally {
      activeRunPromise = null
    }
  }

  async function regenerate(postId) {
    if (activeRunPromise) {
      throw new Error('자동 게시글 생성이 이미 실행 중입니다.')
    }

    const workspaceRoot = await getWorkspaceRoot()
    const post = await store.readPost(workspaceRoot, postId)
    if (!post) {
      throw new Error('재생성할 게시글을 찾지 못했습니다.')
    }

    return runNow({
      reason: 'regenerate',
      force: true,
      regeneratePost: post,
      category: post.category,
      limit: 1,
    })
  }

  async function listPosts() {
    const workspaceRoot = await getWorkspaceRoot()
    return store.listPosts(workspaceRoot)
  }

  async function getPost(postId) {
    const workspaceRoot = await getWorkspaceRoot()
    return store.readPost(workspaceRoot, postId)
  }

  async function exportPost(postId, options) {
    const workspaceRoot = await getWorkspaceRoot()
    return store.exportPost(workspaceRoot, postId, options)
  }

  async function revealPostFolder(postId) {
    const workspaceRoot = await getWorkspaceRoot()
    const folderPath = await store.resolvePostFolder(workspaceRoot, postId)
    const relativePath = path.relative(workspaceRoot, folderPath)
    return revealWorkspacePath({
      rootPath: workspaceRoot,
      targetPath: relativePath,
    })
  }

  async function updateSettings(patch = {}) {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.saveSettings(workspaceRoot, patch)
    await scheduleLoop()
    return settings
  }

  async function init() {
    const workspaceRoot = await getWorkspaceRoot()
    await store.ensureInitialized(workspaceRoot)
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot)

    if (state.inProgress) {
      await store.saveState(
        workspaceRoot,
        {
          ...state,
          inProgress: false,
          lastError: state.lastError || '이전 자동 게시글 실행이 브리지 재시작으로 중단되었습니다.',
        },
        settings,
      )
    }

    await scheduleLoop()
  }

  async function getStatus() {
    const workspaceRoot = await getWorkspaceRoot()
    const settings = await store.getSettings(workspaceRoot)
    const state = await store.getState(workspaceRoot)
    return { settings, state }
  }

  return {
    init,
    runNow,
    regenerate,
    listPosts,
    getPost,
    exportPost,
    revealPostFolder,
    updateSettings,
    getStatus,
    scheduleLoop,
  }
}
