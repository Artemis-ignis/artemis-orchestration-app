import { useEffect, useMemo, useReducer, useState, type PropsWithChildren } from 'react'
import {
  executeModelPrompt,
  fetchBridgeHealth,
  fetchSkillCatalog,
  type ExecuteWorkspaceContext,
  type BridgeHealth,
} from '../lib/modelClient'
import {
  streamAiChat,
  type AiStreamAttemptEvent,
  type AiRoutingMessageMeta,
  type AiStreamFinalEvent,
  type AiStreamMetaEvent,
} from '../lib/aiRoutingClient'
import {
  createWorkspaceFolderRequest,
  deleteWorkspaceEntryRequest,
  fetchDefaultWorkspaceRoot,
  fetchWorkspaceFile,
  fetchWorkspaceListing,
  revealWorkspacePathRequest,
  saveWorkspaceFileRequest,
  uploadWorkspaceFilesRequest,
  type WorkspaceEntry,
  type WorkspaceListing,
} from '../lib/workspaceClient'
import { ArtemisContext, type ArtemisContextValue } from './context'
import { loadRuntimeState, saveRuntimeState } from './storage'
import { getActiveThread, runtimeReducer } from './runtimeReducer'
import type { AgentRun } from './types'

const WORKSPACE_STORAGE_KEY = 'artemis-workspace/v1'
function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function nowIso() {
  return new Date().toISOString()
}

function startOfTodayIso() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

function emptyWorkspaceSummary(): WorkspaceListing['summary'] {
  return {
    totalEntries: 0,
    fileCount: 0,
    folderCount: 0,
    totalBytes: 0,
    systemEntryCount: 0,
  }
}

function buildRoutingWorkspaceContext({
  rootPath,
  absolutePath,
  currentPath,
}: {
  rootPath: string
  absolutePath: string
  currentPath: string
}): ExecuteWorkspaceContext {
  const effectiveRoot = rootPath || absolutePath || ''
  const effectiveCwdPath = absolutePath || rootPath || ''
  return {
    rootPath: effectiveRoot,
    cwdPath: effectiveCwdPath,
    cwdRelativePath: currentPath || '',
    changedAt: new Date().toISOString(),
    changedFiles: [],
    changeDetectionLimited: false,
  }
}

function buildPromptHistory(
  messages: Array<{ role: string; text: string }>,
  limit: number,
): Array<{ role: 'master'; text: string }> {
  // 이전 assistant 답변 문체가 다음 모델 호출에 전염되지 않도록
  // 사용자의 최근 요청만 컨텍스트로 전달한다.
  return messages
    .filter((message) => message.role === 'master')
    .slice(-limit)
    .flatMap((message) => {
      const text = message.text.trim()
      return text ? [{ role: 'master' as const, text }] : []
    })
}

function buildOfficialRouterSystemPrompt({
  agentName,
  workspacePath,
}: {
  agentName: string
  workspacePath: string
}) {
  return [
    `너의 이름은 ${agentName || '아르테미스'}다. 사용자를 항상 마스터라고 부른다.`,
    '항상 한국어로 답하고, 요청이 분명하면 바로 짧고 정확하게 답한다.',
    '짧은 인사나 잡담에는 자연스럽고 부담 없이 답한다.',
    '불필요한 "결론:", "다음 조치:" 같은 템플릿 문구는 쓰지 않는다.',
    '요청이 애매할 때만 한 가지 짧은 질문으로 되묻는다.',
    '실제로 하지 않은 파일 수정, 실행, 검색을 했다고 말하지 않는다.',
    '현재 세션은 공식 API 무료 후보를 고르는 채팅 경로이므로, 실제 파일 수정이 필요하면 Codex CLI가 필요하다고 짧게 안내한다.',
    workspacePath ? `참고 작업 경로: ${workspacePath}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function describeRoutingMeta(meta: AiStreamMetaEvent) {
  return `${meta.routing_mode} · 무료 후보 ${meta.candidate_count}개 확인`
}

function describeRoutingAttempt(attempt: AiStreamAttemptEvent) {
  const label = attempt.display_name || attempt.model
  return `${attempt.attempt_index}차 시도 · ${attempt.provider} · ${label}`
}

function describeRoutingAttemptFailure(attempt: AiStreamAttemptEvent) {
  const label = attempt.display_name || attempt.model
  const reason = attempt.fallback_reason || attempt.error_message || '다음 후보로 전환'
  return `${attempt.attempt_index}차 실패 · ${attempt.provider} · ${label} · ${reason}`
}

function loadWorkspacePrefs() {
  if (typeof window === 'undefined') {
    return { rootPath: '', currentPath: '', showSystemEntries: false }
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (!raw) {
      return { rootPath: '', currentPath: '', showSystemEntries: false }
    }

    const parsed = JSON.parse(raw) as {
      rootPath?: string
      currentPath?: string
      showSystemEntries?: boolean
    }
    return {
      rootPath: parsed.rootPath ?? '',
      currentPath: parsed.currentPath ?? '',
      showSystemEntries: parsed.showSystemEntries ?? false,
    }
  } catch {
    return { rootPath: '', currentPath: '', showSystemEntries: false }
  }
}

function saveWorkspacePrefs(rootPath: string, currentPath: string, showSystemEntries: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          rootPath,
          currentPath,
          showSystemEntries,
        }),
    )
  } catch (error) {
    console.warn('Artemis 작업 폴더 상태 저장에 실패했습니다.', error)
  }
}

function clearWorkspacePrefs() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
}

export function ArtemisProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(runtimeReducer, undefined, loadRuntimeState)
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealth | null>(null)
  const [bridgeError, setBridgeError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [latestExecution, setLatestExecution] =
    useState<ArtemisContextValue['latestExecution']>(null)
  const [workspaceRootPath, setWorkspaceRootPath] = useState(() => loadWorkspacePrefs().rootPath)
  const [workspaceCurrentPath, setWorkspaceCurrentPath] = useState(
    () => loadWorkspacePrefs().currentPath,
  )
  const [workspaceShowSystemEntries, setWorkspaceShowSystemEntries] = useState(
    () => loadWorkspacePrefs().showSystemEntries,
  )
  const [workspaceAbsolutePath, setWorkspaceAbsolutePath] = useState('')
  const [workspaceParentPath, setWorkspaceParentPath] = useState<string | null>(null)
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([])
  const [workspaceSummary, setWorkspaceSummary] = useState<WorkspaceListing['summary']>(
    emptyWorkspaceSummary(),
  )
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveRuntimeState(state)
    }, 120)

    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    saveWorkspacePrefs(workspaceRootPath, workspaceCurrentPath, workspaceShowSystemEntries)
  }, [workspaceCurrentPath, workspaceRootPath, workspaceShowSystemEntries])

  const applyWorkspaceListing = (listing: WorkspaceListing) => {
    setWorkspaceRootPath(listing.rootPath)
    setWorkspaceCurrentPath(listing.currentPath)
    setWorkspaceAbsolutePath(listing.absolutePath)
    setWorkspaceParentPath(listing.parentPath)
    setWorkspaceEntries(listing.entries)
    setWorkspaceSummary(listing.summary)
    setWorkspaceError(null)
  }

  const requestWorkspaceListing = async ({
    rootPath,
    currentPath,
    includeSystem = workspaceShowSystemEntries,
  }: {
    rootPath: string
    currentPath: string
    includeSystem?: boolean
  }) =>
    fetchWorkspaceListing({
      bridgeUrl: state.settings.bridgeUrl,
      rootPath,
      currentPath,
      includeSystem,
    })

  const ensureWorkspaceRoot = async (preferredRoot?: string) => {
    const direct = String(preferredRoot ?? workspaceRootPath).trim()

    if (direct) {
      return direct
    }

    const fallback = await fetchDefaultWorkspaceRoot(state.settings.bridgeUrl)
    setWorkspaceRootPath(fallback.rootPath)
    return fallback.rootPath
  }

  const refreshWorkspace = async (nextPath?: string) => {
    setWorkspaceLoading(true)

    try {
      const rootPath = await ensureWorkspaceRoot()
      const requestedPath = nextPath ?? workspaceCurrentPath
      const listing = await requestWorkspaceListing({
        rootPath,
        currentPath: requestedPath,
      })
      applyWorkspaceListing(listing)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '작업 폴더를 불러오지 못했습니다.'
      setWorkspaceError(message)
    } finally {
      setWorkspaceLoading(false)
    }
  }

  const connectWorkspace = async (rootPath: string) => {
    setWorkspaceLoading(true)

    try {
      const listing = await requestWorkspaceListing({
        rootPath,
        currentPath: '',
      })
      applyWorkspaceListing(listing)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '작업 폴더 연결에 실패했습니다.'
      setWorkspaceError(message)
      throw error
    } finally {
      setWorkspaceLoading(false)
    }
  }

  const openWorkspaceFolder = async (path: string) => {
    await refreshWorkspace(path)
  }

  const setWorkspaceSystemEntriesVisible = async (visible: boolean) => {
    setWorkspaceLoading(true)

    try {
      const rootPath = await ensureWorkspaceRoot()
      const listing = await requestWorkspaceListing({
        rootPath,
        currentPath: workspaceCurrentPath,
        includeSystem: visible,
      })
      applyWorkspaceListing(listing)
      setWorkspaceShowSystemEntries(visible)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '작업 폴더 표시 옵션을 반영하지 못했습니다.'
      setWorkspaceError(message)
    } finally {
      setWorkspaceLoading(false)
    }
  }

  const createWorkspaceFolder = async (name: string) => {
    const rootPath = await ensureWorkspaceRoot()
    const listing = await createWorkspaceFolderRequest({
      bridgeUrl: state.settings.bridgeUrl,
      rootPath,
      currentPath: workspaceCurrentPath,
      name,
      includeSystem: workspaceShowSystemEntries,
    })
    applyWorkspaceListing(listing)
  }

  const uploadWorkspaceFiles = async (files: FileList) => {
    const rootPath = await ensureWorkspaceRoot()
    const listing = await uploadWorkspaceFilesRequest({
      bridgeUrl: state.settings.bridgeUrl,
      rootPath,
      currentPath: workspaceCurrentPath,
      files,
      includeSystem: workspaceShowSystemEntries,
    })
    applyWorkspaceListing(listing)
  }

  const readWorkspaceFile = async (path: string) => {
    const rootPath = await ensureWorkspaceRoot()
    return fetchWorkspaceFile({
      bridgeUrl: state.settings.bridgeUrl,
      rootPath,
      path,
    })
  }

  const saveWorkspaceFile = async (path: string, content: string) => {
    const rootPath = await ensureWorkspaceRoot()
    const response = await saveWorkspaceFileRequest({
      bridgeUrl: state.settings.bridgeUrl,
      rootPath,
      path,
      content,
    })
    await refreshWorkspace(workspaceCurrentPath)
    return response
  }

  const deleteWorkspaceEntry = async (path: string) => {
    const rootPath = await ensureWorkspaceRoot()
    const listing = await deleteWorkspaceEntryRequest({
      bridgeUrl: state.settings.bridgeUrl,
      rootPath,
      path,
      includeSystem: workspaceShowSystemEntries,
    })
    applyWorkspaceListing(listing)
  }

  const revealWorkspacePath = async (path = '') => {
    const rootPath = await ensureWorkspaceRoot()
    await revealWorkspacePathRequest({
      bridgeUrl: state.settings.bridgeUrl,
      rootPath,
      path,
    })
  }

  const refreshBridgeHealth = async () => {
    try {
      const nextHealth = await fetchBridgeHealth(state.settings.bridgeUrl)
      setBridgeHealth(nextHealth)
      setBridgeError(null)
    } catch (error) {
      setBridgeHealth(null)
      setBridgeError(
        error instanceof Error ? error.message : '모델 브리지 상태를 확인하지 못했습니다.',
      )
    }
  }

  const syncSkills = async () => {
    try {
      const catalog = await fetchSkillCatalog(state.settings.bridgeUrl)
      dispatch({
        type: 'SYNC_TOOL_CATALOG',
        items: catalog.items.map((item) => ({ ...item, enabled: false })),
      })
      setBridgeError(null)
    } catch (error) {
      setBridgeError(error instanceof Error ? error.message : '스킬 목록을 불러오지 못했습니다.')
    }
  }

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      const [healthResult, skillResult, defaultWorkspaceResult] = await Promise.allSettled([
        fetchBridgeHealth(state.settings.bridgeUrl),
        fetchSkillCatalog(state.settings.bridgeUrl),
        fetchDefaultWorkspaceRoot(state.settings.bridgeUrl),
      ])

      if (!active) {
        return
      }

      if (healthResult.status === 'fulfilled') {
        setBridgeHealth(healthResult.value)
        setBridgeError(null)
      } else {
        setBridgeHealth(null)
        setBridgeError(
          healthResult.reason instanceof Error
            ? healthResult.reason.message
            : '초기 연결 상태를 준비하지 못했습니다.',
        )
      }

      if (skillResult.status === 'fulfilled') {
        dispatch({
          type: 'SYNC_TOOL_CATALOG',
          items: skillResult.value.items.map((item) => ({ ...item, enabled: false })),
        })
      } else {
        console.warn('Artemis 스킬 목록을 불러오지 못했습니다.', skillResult.reason)
      }

      const persistedWorkspace = loadWorkspacePrefs()
      const fallbackRoot =
        defaultWorkspaceResult.status === 'fulfilled' ? defaultWorkspaceResult.value.rootPath : ''
      const initialRoot = persistedWorkspace.rootPath || fallbackRoot
      const initialPath = persistedWorkspace.currentPath
      const initialShowSystemEntries = persistedWorkspace.showSystemEntries

      setWorkspaceShowSystemEntries(initialShowSystemEntries)

      if (!initialRoot) {
        setWorkspaceError('작업 폴더를 확인하지 못했습니다.')
        return
      }

      try {
        const listing = await fetchWorkspaceListing({
          bridgeUrl: state.settings.bridgeUrl,
          rootPath: initialRoot,
          currentPath: initialPath,
          includeSystem: initialShowSystemEntries,
        })
        if (active) {
          applyWorkspaceListing(listing)
        }
      } catch (error) {
        try {
          const listing = await fetchWorkspaceListing({
            bridgeUrl: state.settings.bridgeUrl,
            rootPath: initialRoot,
            currentPath: '',
            includeSystem: initialShowSystemEntries,
          })
          if (active) {
            applyWorkspaceListing(listing)
          }
        } catch (fallbackError) {
          if (active) {
            setWorkspaceError(
              fallbackError instanceof Error
                ? fallbackError.message
                : '작업 폴더를 불러오지 못했습니다.',
            )
          }
          console.warn('Artemis 작업 폴더 초기화에 실패했습니다.', error)
        }
      }
    }

    void bootstrap()
    return () => {
      active = false
    }
  }, [state.settings.bridgeUrl])

  const activeThread = getActiveThread(state)
  const activeAgent =
    state.agents.items.find((item) => item.id === state.agents.activeAgentId) ?? null
  const activeAgentRuns = useMemo(
    () =>
      state.agents.runs
        .filter((run) => run.agentId === activeAgent?.id)
        .slice()
        .sort((left, right) => {
          const leftTime = Date.parse(left.finishedAt ?? left.startedAt)
          const rightTime = Date.parse(right.finishedAt ?? right.startedAt)
          return rightTime - leftTime
        }),
    [state.agents.runs, activeAgent?.id],
  )
  const enabledToolsCount = state.tools.items.filter((item) => item.enabled).length
  const unreadInsightsCount = state.insights.items.filter((item) => item.status === 'unread').length
  const todayIso = startOfTodayIso()
  const dailyPromptCount =
    state.chats.threads
      .flatMap((thread) => thread.messages)
      .filter((message) => message.role === 'master' && message.createdAt >= todayIso).length +
    state.agents.runs.filter((run) => run.startedAt >= todayIso).length
  const storageUsedBytes = workspaceSummary.totalBytes

  const preferredLocalProvider =
    state.settings.modelProvider === 'auto'
      ? bridgeHealth?.providers.find((item) => item.provider === 'ollama' && item.ready)?.provider ??
        bridgeHealth?.providers.find((item) => item.ready)?.provider ??
        'ollama'
      : state.settings.modelProvider

  const value: ArtemisContextValue = {
    state,
    activeThread,
    activeAgent,
    activeAgentRuns,
    enabledToolsCount,
    unreadInsightsCount,
    dailyPromptCount,
    storageUsedBytes,
    bridgeHealth,
    bridgeError,
    latestExecution,
    workspaceRootPath,
    workspaceCurrentPath,
    workspaceAbsolutePath,
    workspaceParentPath,
    workspaceShowSystemEntries,
    workspaceEntries,
    workspaceSummary,
    workspaceLoading,
    workspaceError,
    isGenerating,
    setComposerText: (text) => dispatch({ type: 'SET_COMPOSER', text }),
    sendPrompt: async (prompt, options) => {
      const nextPrompt = (prompt ?? state.chats.composerText).trim()

      if (!nextPrompt || isGenerating) {
        return
      }

      const selectedAgent =
        options?.agentId != null
          ? state.agents.items.find((item) => item.id === options.agentId) ?? null
          : activeAgent
      const requestProvider = selectedAgent?.provider ?? options?.provider ?? preferredLocalProvider
      const requestSettings = {
        ...state.settings,
        modelProvider:
          requestProvider === 'codex' || requestProvider === 'ollama'
            ? requestProvider
            : state.settings.modelProvider,
        codexModel:
          requestProvider === 'codex' && options?.model
            ? options.model
            : state.settings.codexModel,
        ollamaModel:
          requestProvider === 'ollama' && options?.model
            ? options.model
            : state.settings.ollamaModel,
      }
      setIsGenerating(true)
      setBridgeError(null)

      try {
        const rootPath = await ensureWorkspaceRoot()

        if (selectedAgent?.provider === 'official-router') {
          let finalEvent: AiStreamFinalEvent | null = null
          let streamError: string | null = null
          let streamedText = ''
          const officialRouterSystemPrompt = buildOfficialRouterSystemPrompt({
            agentName: state.settings.agentName,
            workspacePath: workspaceAbsolutePath || rootPath || '',
          })

          await streamAiChat(
            state.settings.bridgeUrl,
            {
              sessionId: activeThread.id,
              prompt: nextPrompt,
              messages: buildPromptHistory(activeThread.messages, 12),
              systemPrompt: officialRouterSystemPrompt,
            },
            {
              signal: options?.signal,
              onMeta: options?.onStreamMeta,
              onAttempt: options?.onStreamAttempt,
              onAttemptFailed: options?.onStreamAttemptFailed,
              onToken: (token) => {
                streamedText += token
                options?.onStreamToken?.(token)
              },
              onFinal: (payload) => {
                finalEvent = payload
                options?.onStreamFinal?.(payload)
              },
              onError: (message) => {
                streamError = message
              },
            },
          )

          if (streamError) {
            throw new Error(streamError)
          }

          const finalPayload = finalEvent as AiStreamFinalEvent | null

          if (!finalPayload) {
            throw new Error('스트리밍은 연결됐지만 최종 응답을 마무리하지 못했습니다.')
          }

          const routingMeta: AiRoutingMessageMeta = {
            routing_mode: finalPayload.routing_mode,
            final_provider: finalPayload.provider,
            final_provider_label: finalPayload.provider_label,
            final_model: finalPayload.model,
            final_display_name: finalPayload.display_name,
            first_token_at: finalPayload.first_token_at ?? null,
            score_at_selection: finalPayload.score_at_selection,
            attempts: finalPayload.attempts,
          }

          dispatch({
            type: 'RUN_PROMPT',
            prompt: nextPrompt,
            assistantText: finalPayload.text || streamedText.trim(),
            provider: finalPayload.provider,
            model: finalPayload.model,
            routingMeta,
          })
          setLatestExecution({
            source: 'chat',
            request: nextPrompt,
            provider: finalPayload.provider,
            model: finalPayload.model,
            receivedAt: nowIso(),
            workspace: buildRoutingWorkspaceContext({
              rootPath,
              absolutePath: workspaceAbsolutePath,
              currentPath: workspaceCurrentPath,
            }),
          })
          return
        }

        if (
          selectedAgent?.provider === 'openai-compatible' &&
          !state.apiKeys.find((item) => item.id === selectedAgent.apiKeyId)
        ) {
          throw new Error('이 에이전트는 API 키가 필요합니다. 설정에서 먼저 연결해 주세요.')
        }

        if (
          selectedAgent?.provider === 'anthropic' &&
          !state.apiKeys.find((item) => item.id === selectedAgent.apiKeyId)
        ) {
          throw new Error('Claude 에이전트는 API 키가 필요합니다. 설정에서 먼저 연결해 주세요.')
        }

        const response = await executeModelPrompt({
          bridgeUrl: state.settings.bridgeUrl,
          prompt: nextPrompt,
          messages: buildPromptHistory(activeThread.messages, 8),
          settings: requestSettings,
          agent: selectedAgent ?? undefined,
          apiKeys: state.apiKeys,
          enabledTools: state.tools.items.filter((item) => item.enabled),
          rootPath,
          cwdPath: workspaceCurrentPath,
        })

        dispatch({
          type: 'RUN_PROMPT',
          prompt: nextPrompt,
          assistantText: response.text,
          provider: response.provider,
          model: response.model,
        })
        setLatestExecution({
          source: 'chat',
          request: nextPrompt,
          provider: response.provider,
          model: response.model,
          receivedAt: nowIso(),
          workspace: response.workspace,
        })

        await refreshWorkspace(workspaceCurrentPath)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '모델 실행 중 오류가 발생했습니다.'
        setBridgeError(message)
        dispatch({ type: 'APPEND_CHAT_ERROR', prompt: nextPrompt, error: message })
      } finally {
        setIsGenerating(false)
      }
    },
    refreshBridgeHealth,
    syncSkills,
    createThread: () => dispatch({ type: 'CREATE_THREAD' }),
    connectWorkspace,
    refreshWorkspace,
    setWorkspaceSystemEntriesVisible,
    createWorkspaceFolder,
    uploadWorkspaceFiles,
    openWorkspaceFolder,
    readWorkspaceFile,
    saveWorkspaceFile,
    deleteWorkspaceEntry,
    revealWorkspacePath,
    toggleTool: (toolId) => dispatch({ type: 'TOGGLE_TOOL', toolId }),
    markInsight: (insightId, status) => dispatch({ type: 'MARK_INSIGHT', insightId, status }),
    updateSettings: (patch) => dispatch({ type: 'UPDATE_SETTINGS', patch }),
    selectChatModel: (provider, model) =>
      dispatch({ type: 'SELECT_CHAT_MODEL', provider, model }),
    addApiKey: (label, key, presetId) => dispatch({ type: 'ADD_API_KEY', label, key, presetId }),
    removeApiKey: (keyId) => dispatch({ type: 'REMOVE_API_KEY', keyId }),
    setActiveAgent: (agentId) => dispatch({ type: 'SET_ACTIVE_AGENT', agentId }),
    createAgent: (presetId = 'codex-cli') => dispatch({ type: 'CREATE_AGENT', presetId }),
    updateAgent: (agentId, patch) => dispatch({ type: 'UPDATE_AGENT', agentId, patch }),
    deleteAgent: (agentId) => dispatch({ type: 'DELETE_AGENT', agentId }),
    runAgentTask: async (agentId, task) => {
      const agent = state.agents.items.find((item) => item.id === agentId)
      const nextTask = task.trim()

      if (!agent || !nextTask || agent.status === 'running') {
        return
      }

      if (
        agent.provider === 'openai-compatible' &&
        !state.apiKeys.find((item) => item.id === agent.apiKeyId)
      ) {
        setBridgeError('이 에이전트는 API 키가 필요합니다. 설정에서 먼저 연결해 주세요.')
        return
      }

      if (
        agent.provider === 'anthropic' &&
        !state.apiKeys.find((item) => item.id === agent.apiKeyId)
      ) {
        setBridgeError('Claude 에이전트는 API 키가 필요합니다. 설정에서 먼저 연결해 주세요.')
        return
      }

      const runId = createId('run')
      const startedAt = nowIso()
      const run: AgentRun = {
        id: runId,
        agentId,
        task: nextTask,
        provider: agent.provider,
        model: agent.model,
        status: 'running',
        startedAt,
        finishedAt: null,
        output: '',
        logs: [
          {
            id: createId('log'),
            createdAt: startedAt,
            level: 'info',
            message: `${agent.name} 실행을 시작했습니다.`,
          },
        ],
      }

      dispatch({ type: 'START_AGENT_RUN', run })
      setBridgeError(null)

      const pushRunLog = (level: 'info' | 'success' | 'error', message: string) => {
        dispatch({
          type: 'APPEND_AGENT_RUN_LOG',
          runId,
          log: {
            id: createId('log'),
            createdAt: nowIso(),
            level,
            message,
          },
        })
      }

      const updateRunRoute = (provider: string, model: string) => {
        dispatch({ type: 'UPDATE_AGENT_RUN_ROUTE', runId, provider, model })
      }

      try {
        const rootPath = await ensureWorkspaceRoot()

        if (agent.provider === 'official-router') {
          let finalEvent: AiStreamFinalEvent | null = null
          let streamError: string | null = null
          let streamedText = ''

          await streamAiChat(
            state.settings.bridgeUrl,
            {
              sessionId: runId,
              prompt: nextTask,
              messages: buildPromptHistory(activeThread.messages, 6),
              systemPrompt: agent.systemPrompt,
            },
            {
              onMeta: (meta) => {
                pushRunLog('info', describeRoutingMeta(meta))
              },
              onAttempt: (attempt) => {
                updateRunRoute(attempt.provider, attempt.model)
                pushRunLog('info', describeRoutingAttempt(attempt))
              },
              onAttemptFailed: (attempt) => {
                pushRunLog('error', describeRoutingAttemptFailure(attempt))
              },
              onToken: (token) => {
                streamedText += token
                dispatch({ type: 'APPEND_AGENT_RUN_OUTPUT', runId, chunk: token })
              },
              onFinal: (payload) => {
                finalEvent = payload
              },
              onError: (message) => {
                streamError = message
              },
            },
          )

          if (streamError) {
            throw new Error(streamError)
          }

          const finalPayload = finalEvent as AiStreamFinalEvent | null

          if (!finalPayload) {
            throw new Error('오케스트레이션 라우터가 최종 응답을 만들지 못했습니다.')
          }

          dispatch({
            type: 'COMPLETE_AGENT_RUN',
            runId,
            agentId,
            task: nextTask,
            assistantText: finalPayload.text || streamedText.trim(),
            provider: finalPayload.provider,
            model: finalPayload.model,
          })
          setLatestExecution({
            source: 'agent',
            request: nextTask,
            provider: finalPayload.provider,
            model: finalPayload.model,
            receivedAt: nowIso(),
            workspace: buildRoutingWorkspaceContext({
              rootPath,
              absolutePath: workspaceAbsolutePath,
              currentPath: workspaceCurrentPath,
            }),
          })
          return
        }

        pushRunLog('info', `${agent.name} 실행기에 작업을 전달했습니다.`)

        const response = await executeModelPrompt({
          bridgeUrl: state.settings.bridgeUrl,
          prompt: nextTask,
          messages: buildPromptHistory(activeThread.messages, 6),
          settings: state.settings,
          agent,
          apiKeys: state.apiKeys,
          enabledTools: state.tools.items.filter((item) => item.enabled),
          rootPath,
          cwdPath: workspaceCurrentPath,
        })

        dispatch({
          type: 'COMPLETE_AGENT_RUN',
          runId,
          agentId,
          task: nextTask,
          assistantText: response.text,
          provider: response.provider,
          model: response.model,
        })
        setLatestExecution({
          source: 'agent',
          request: nextTask,
          provider: response.provider,
          model: response.model,
          receivedAt: nowIso(),
          workspace: response.workspace,
        })

        await refreshWorkspace(workspaceCurrentPath)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '에이전트 실행 중 오류가 발생했습니다.'
        setBridgeError(message)
        dispatch({ type: 'FAIL_AGENT_RUN', runId, agentId, error: message })
      }
    },
    addSignal: (title, category, description) =>
      dispatch({ type: 'ADD_SIGNAL', title, category, description }),
    toggleSignal: (signalId) => dispatch({ type: 'TOGGLE_SIGNAL', signalId }),
    resetAll: () => {
      clearWorkspacePrefs()
      setWorkspaceRootPath('')
      setWorkspaceCurrentPath('')
      setWorkspaceAbsolutePath('')
      setWorkspaceParentPath(null)
      setWorkspaceShowSystemEntries(false)
      setWorkspaceEntries([])
      setWorkspaceSummary(emptyWorkspaceSummary())
      setWorkspaceError(null)
      setLatestExecution(null)
      dispatch({ type: 'RESET_ALL' })
      void refreshWorkspace('')
    },
  }

  return <ArtemisContext.Provider value={value}>{children}</ArtemisContext.Provider>
}
