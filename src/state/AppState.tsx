import { useEffect, useMemo, useReducer, useRef, useState, type PropsWithChildren } from 'react'
import {
  executeModelPrompt,
  fetchBridgeHealth,
  fetchSignalsFeed,
  fetchSkillCatalog,
  type ExecuteResponse,
  type ExecuteWorkspaceContext,
  type BridgeHealth,
} from '../lib/modelClient'
import {
  fetchAiSettings,
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
  // 이전 assistant 응답은 다음 모델 호출에 섞이지 않도록 하고,
  // 사용자의 최근 요청만 컨텍스트로 전달합니다.
  return messages
    .filter((message) => message.role === 'master')
    .slice(-limit)
    .flatMap((message) => {
      const text = message.text.trim()
      return text ? [{ role: 'master' as const, text }] : []
    })
}

const RUN_PROGRESS_LOG_STEPS = [
  { delayMs: 2_000, message: '실행기가 요청을 확인하는 중입니다.' },
  { delayMs: 6_000, message: '응답 초안을 준비하는 중입니다.' },
  { delayMs: 14_000, message: '최종 응답을 모으는 중입니다. 조금만 기다려 주세요.' },
  { delayMs: 30_000, message: '지연이 길어지고 있습니다. 완료될 때까지 계속 상태를 갱신합니다.' },
  { delayMs: 60_000, message: '응답이 늦어지고 있습니다. 타임아웃 전까지 대기합니다.' },
]

function shouldAttachSignalsContext(task: string) {
  return /(\\uC18C\\uC2DD|\\uB274\\uC2A4|\\uB3D9\\uD5A5|\\uBE0C\\uB9AC\\uD551|\\uD2B8\\uB80C\\uB4DC|\\uC5C5\\uB370\\uC774\\uD2B8|\\uC2E0\\uD638)/.test(task)
}

function buildSignalsContext(
  items: Array<{
    title: string
    summary: string
  }>,
) {
  return items
    .map((item, index) => `${index + 1}. ${item.title}\n- 요약: ${item.summary}`)
    .join('\n')
}

function buildOfficialRouterSystemPrompt({
  agentName,
  workspacePath,
}: {
  agentName: string
  workspacePath: string
}) {
  return [
    'You are ' + (agentName || 'Artemis') + '. Call the user Master.',
    'Reply in Korean when possible and keep answers concise.',
    'Do not claim file edits or commands you did not actually run.',
    'If real file edits are required, say Codex CLI is needed.',
    workspacePath ? 'Workspace: ' + workspacePath : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function resolveOfficialProviderId(baseUrl: string) {
  const normalized = baseUrl.trim().toLowerCase()
  if (normalized === 'openrouter' || normalized === 'nvidia-build' || normalized === 'gemini') {
    return normalized
  }
  return 'openrouter'
}

function describeRoutingMeta(meta: AiStreamMetaEvent) {
  if (meta.routing_mode === 'manual' && meta.top_candidate) {
    return '직접 호출 - ' + meta.top_candidate.provider_label + ' - ' + meta.top_candidate.display_name
  }

  return meta.routing_mode + ' · 후보 ' + meta.candidate_count + '개'
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
    console.warn('Artemis ?묒뾽 ?대뜑 ?곹깭 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.', error)
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
  const agentItemsRef = useRef(state.agents.items)
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

  const applyBridgeHealthSuccess = (nextHealth: BridgeHealth) => {
    setBridgeHealth(nextHealth)
    setBridgeError(null)
  }

  const applyBridgeHealthFailure = (error: unknown, fallbackMessage: string) => {
    setBridgeError(error instanceof Error ? error.message : fallbackMessage)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveRuntimeState(state)
    }, 120)

    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    agentItemsRef.current = state.agents.items
  }, [state.agents.items])

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
        error instanceof Error ? error.message : '?묒뾽 ?대뜑瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??'
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
        error instanceof Error ? error.message : '?묒뾽 ?대뜑 ?곌껐???ㅽ뙣?덉뒿?덈떎.'
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
        error instanceof Error ? error.message : '?묒뾽 ?대뜑 ?쒖떆 ?듭뀡??諛섏쁺?섏? 紐삵뻽?듬땲??'
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
      applyBridgeHealthSuccess(nextHealth)
    } catch (error) {
      applyBridgeHealthFailure(error, '紐⑤뜽 釉뚮━吏 ?곹깭瑜??뺤씤?섏? 紐삵뻽?듬땲??')
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
      setBridgeError(error instanceof Error ? error.message : '?ㅽ궗 紐⑸줉??遺덈윭?ㅼ? 紐삵뻽?듬땲??')
    }
  }

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      const [healthResult, skillResult, defaultWorkspaceResult, aiSettingsResult] = await Promise.allSettled([
        fetchBridgeHealth(state.settings.bridgeUrl),
        fetchSkillCatalog(state.settings.bridgeUrl),
        fetchDefaultWorkspaceRoot(state.settings.bridgeUrl),
        fetchAiSettings(state.settings.bridgeUrl),
      ])

      if (!active) {
        return
      }

      if (healthResult.status === 'fulfilled') {
        applyBridgeHealthSuccess(healthResult.value)
      } else {
        applyBridgeHealthFailure(healthResult.reason, '珥덇린 ?곌껐 ?곹깭瑜?以鍮꾪븯吏 紐삵뻽?듬땲??')
      }

      if (skillResult.status === 'fulfilled') {
        dispatch({
          type: 'SYNC_TOOL_CATALOG',
          items: skillResult.value.items.map((item) => ({ ...item, enabled: false })),
        })
      } else {
        console.warn('Artemis ?ㅽ궗 紐⑸줉??遺덈윭?ㅼ? 紐삵뻽?듬땲??', skillResult.reason)
      }

      if (aiSettingsResult.status === 'fulfilled') {
        const officialProvider = aiSettingsResult.value.manual_provider
          ? resolveOfficialProviderId(aiSettingsResult.value.manual_provider)
          : null
        const officialModel = aiSettingsResult.value.manual_model?.trim() ?? ''

        if (officialProvider && officialModel) {
          agentItemsRef.current
            .filter((item) => item.provider === 'official-router')
            .forEach((agent) => {
              if (agent.baseUrl !== officialProvider || agent.model !== officialModel) {
                dispatch({
                  type: 'UPDATE_AGENT',
                  agentId: agent.id,
                  patch: {
                    baseUrl: officialProvider,
                    model: officialModel,
                  },
                })
              }
            })
        }
      }

      const persistedWorkspace = loadWorkspacePrefs()
      const fallbackRoot =
        defaultWorkspaceResult.status === 'fulfilled' ? defaultWorkspaceResult.value.rootPath : ''
      const initialRoot = persistedWorkspace.rootPath || fallbackRoot
      const initialPath = persistedWorkspace.currentPath
      const initialShowSystemEntries = persistedWorkspace.showSystemEntries

      setWorkspaceShowSystemEntries(initialShowSystemEntries)

      if (!initialRoot) {
        setWorkspaceError('?묒뾽 ?대뜑瑜??뺤씤?섏? 紐삵뻽?듬땲??')
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
                : '?묒뾽 ?대뜑瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??',
            )
          }
          console.warn('Artemis ?묒뾽 ?대뜑 珥덇린?붿뿉 ?ㅽ뙣?덉뒿?덈떎.', error)
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
          const officialProvider = resolveOfficialProviderId(selectedAgent.baseUrl)
          const officialModel = selectedAgent.model.trim()

          if (!officialModel) {
            throw new Error('Official API model ID is empty. Check provider and model settings.')
          }

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
              routing_mode: 'manual',
              manual_provider: officialProvider,
              manual_model: officialModel,
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
            throw new Error('?ㅽ듃由щ컢? ?곌껐?먯?留?理쒖쥌 ?묐떟??留덈Т由ы븯吏 紐삵뻽?듬땲??')
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
          throw new Error('???먯씠?꾪듃??API ?ㅺ? ?꾩슂?⑸땲?? ?ㅼ젙?먯꽌 癒쇱? ?곌껐??二쇱꽭??')
        }

        if (
          selectedAgent?.provider === 'anthropic' &&
          !state.apiKeys.find((item) => item.id === selectedAgent.apiKeyId)
        ) {
          throw new Error('Claude ?먯씠?꾪듃??API ?ㅺ? ?꾩슂?⑸땲?? ?ㅼ젙?먯꽌 癒쇱? ?곌껐??二쇱꽭??')
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
          error instanceof Error ? error.message : '紐⑤뜽 ?ㅽ뻾 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.'
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
    setOrchestrationDraft: (text) => dispatch({ type: 'SET_ORCHESTRATION_DRAFT', text }),
    setOrchestrationSelection: (agentIds) =>
      dispatch({ type: 'SET_ORCHESTRATION_SELECTION', agentIds }),
    startOrchestrationSession: ({ startedAt, task, agentIds }) =>
      dispatch({ type: 'START_ORCHESTRATION_SESSION', startedAt, task, agentIds }),
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
        setBridgeError('???먯씠?꾪듃??API ?ㅺ? ?꾩슂?⑸땲?? ?ㅼ젙?먯꽌 癒쇱? ?곌껐??二쇱꽭??')
        return
      }

      if (
        agent.provider === 'anthropic' &&
        !state.apiKeys.find((item) => item.id === agent.apiKeyId)
      ) {
        setBridgeError('Claude ?먯씠?꾪듃??API ?ㅺ? ?꾩슂?⑸땲?? ?ㅼ젙?먯꽌 癒쇱? ?곌껐??二쇱꽭??')
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
        let taskPrompt = nextTask

        if (shouldAttachSignalsContext(nextTask)) {
          pushRunLog('info', '최신 신호를 확인하고 있습니다.')
          try {
            const signalFeed = await fetchSignalsFeed({
              bridgeUrl: state.settings.bridgeUrl,
            })
            const contextItems = signalFeed.items.slice(0, 3)

            if (contextItems.length > 0) {
              taskPrompt = [
                nextTask,
                '',
                '[참고 신호]',
                buildSignalsContext(contextItems),
                '',
                '위 신호를 참고해 최신 판단만 짧고 선명하게 정리해 주세요.',
              ].join('\n')
              pushRunLog('info', `최신 신호 ${contextItems.length}건을 참고 문맥으로 연결했습니다.`)
            } else {
              pushRunLog('info', '연결할 최신 신호가 없어 현재 요청만 그대로 실행합니다.')
            }
          } catch {
            pushRunLog('info', '최신 신호를 불러오지 못해 현재 요청만 그대로 실행합니다.')
          }
        }

        if (agent.provider === 'official-router') {
          const officialProvider = resolveOfficialProviderId(agent.baseUrl)
          const officialModel = agent.model.trim()

          if (!officialModel) {
            throw new Error('Official API model ID is empty. Check provider and model settings.')
          }

          let finalEvent: AiStreamFinalEvent | null = null
          let streamError: string | null = null
          let streamedText = ''

          await streamAiChat(
            state.settings.bridgeUrl,
            {
              sessionId: runId,
              prompt: taskPrompt,
              messages: buildPromptHistory(activeThread.messages, 6),
              routing_mode: 'manual',
              manual_provider: officialProvider,
              manual_model: officialModel,
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
            throw new Error('?ㅼ??ㅽ듃?덉씠???쇱슦?곌? 理쒖쥌 ?묐떟??留뚮뱾吏 紐삵뻽?듬땲??')
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

        pushRunLog('info', `${agent.name} ?ㅽ뻾湲곗뿉 ?묒뾽???꾨떖?덉뒿?덈떎.`)
        if (agent.provider === 'codex' || agent.provider === 'ollama') {
          pushRunLog(
            'info',
            '???ㅽ뻾湲곕뒗 寃곌낵瑜???踰덉뿉 諛섑솚?⑸땲?? 理쒖쥌 ?듬? ?꾧퉴吏??吏꾪뻾 濡쒓렇媛 癒쇱? 媛깆떊?⑸땲??',
          )
        }

        const progressTimers = RUN_PROGRESS_LOG_STEPS.map(({ delayMs, message }) =>
          window.setTimeout(() => {
            pushRunLog('info', message)
          }, delayMs),
        )

        let response: ExecuteResponse
        try {
          response = await executeModelPrompt({
            bridgeUrl: state.settings.bridgeUrl,
            prompt: taskPrompt,
            messages: buildPromptHistory(activeThread.messages, 6),
            settings: state.settings,
            agent,
            apiKeys: state.apiKeys,
            enabledTools: state.tools.items.filter((item) => item.enabled),
            rootPath,
            cwdPath: workspaceCurrentPath,
          })
        } finally {
          progressTimers.forEach((timer) => window.clearTimeout(timer))
        }

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
          error instanceof Error ? error.message : '?먯씠?꾪듃 ?ㅽ뻾 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.'
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

