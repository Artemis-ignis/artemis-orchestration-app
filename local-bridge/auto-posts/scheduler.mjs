import path from 'node:path'
import { enrichSignalCandidates, selectTopCandidates, toSignalCandidate } from './collector.mjs'
import { AUTO_POST_PROMPT_VERSION, generateAutoPost } from './generator.mjs'
import { nowIso } from './normalize.mjs'
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

    const response = await runCodex({
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
    })

    return response
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
        selectedCandidates = regeneratePost.sourceItems
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
