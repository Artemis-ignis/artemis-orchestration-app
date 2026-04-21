import { useEffect, useMemo, useState } from 'react'
import type { PageId } from '../crewData'
import { PageIntro } from '../crewPageShared'
import { executionProviderLabel } from '../crewPageHelpers'
import {
  OrchestrationAlerts,
  OrchestrationControls,
  OrchestrationDetails,
  OrchestrationResultCard,
  OrchestrationResultsPanel,
  OrchestrationStage,
} from '../features/orchestration/OrchestrationSections'
import { fetchAiProviders, type AiProviderState } from '../lib/aiRoutingClient'
import { OrchestrationCanvas } from '../OrchestrationCanvas'
import { useArtemisApp } from '../state/context'
import type { AgentItem, AgentRun } from '../state/types'

function displayRunStatusLabel(status?: string) {
  switch (status) {
    case 'running':
      return '실행 중'
    case 'success':
      return '응답 완료'
    case 'error':
      return '실행 오류'
    default:
      return '대기'
  }
}

function formatElapsedSeconds(totalSeconds: number) {
  if (totalSeconds < 60) {
    return `${totalSeconds}초`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`
}

function runningHint(provider: string) {
  if (provider === 'codex' || provider === 'ollama') {
    return '이 실행기는 토큰을 조금씩 흘리기보다 최종 결과를 한 번에 올립니다. 대신 아래 로그와 상태가 먼저 갱신됩니다.'
  }

  return '스트리밍이 가능한 공급자는 생성 중 로그와 부분 응답을 순차적으로 갱신합니다.'
}

function canAgentUseApiKey(agent: AgentItem, apiKeyIds: Set<string>) {
  if (agent.provider === 'openai-compatible' || agent.provider === 'anthropic') {
    return Boolean(agent.apiKeyId && apiKeyIds.has(agent.apiKeyId))
  }

  return true
}

function resolveOfficialProviderId(baseUrl: string) {
  const normalized = baseUrl.trim().toLowerCase()
  if (normalized === 'openrouter' || normalized === 'nvidia-build' || normalized === 'gemini') {
    return normalized
  }
  return 'openrouter'
}

export function OrchestrationPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    activeAgent,
    bridgeHealth,
    bridgeError,
    latestExecution,
    runAgentTask,
    setOrchestrationDraft,
    setOrchestrationSelection,
    startOrchestrationSession,
    state,
    workspaceAbsolutePath,
    workspaceError,
  } = useArtemisApp()

  const [aiProviders, setAiProviders] = useState<AiProviderState[]>([])
  const [runClock, setRunClock] = useState(() => Date.now())

  const task = state.orchestration.draftTask
  const selectedAgentIds = state.orchestration.selectedAgentIds
  const sessionStartedAt = state.orchestration.sessionStartedAt
    ? Date.parse(state.orchestration.sessionStartedAt)
    : null

  const enabledAgents = useMemo(
    () => state.agents.items.filter((item) => item.enabled),
    [state.agents.items],
  )
  const enabledAgentIds = useMemo(() => new Set(enabledAgents.map((agent) => agent.id)), [enabledAgents])
  const apiKeyIds = useMemo(() => new Set(state.apiKeys.map((item) => item.id)), [state.apiKeys])
  const activeTools = state.tools.items.filter((item) => item.enabled)
  const latestMasterMessage = [...(state.chats.threads.find((thread) => thread.id === state.chats.activeThreadId)?.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'master')
  const latestAgentExecution = latestExecution?.source === 'agent' ? latestExecution : null
  const latestChangedFiles = latestAgentExecution?.workspace.changedFiles ?? []

  const effectiveSelectedAgentIds = useMemo(() => {
    const preserved = selectedAgentIds.filter((id) => enabledAgentIds.has(id))

    if (preserved.length > 0) {
      return preserved
    }

    if (enabledAgents.length > 0) {
      return enabledAgents.map((agent) => agent.id)
    }

    if (activeAgent && enabledAgentIds.has(activeAgent.id)) {
      return [activeAgent.id]
    }

    return []
  }, [selectedAgentIds, enabledAgentIds, enabledAgents, activeAgent])

  const needsOfficialProviders = enabledAgents.some(
    (agent) => effectiveSelectedAgentIds.includes(agent.id) && agent.provider === 'official-router',
  )

  useEffect(() => {
    let active = true

    if (!needsOfficialProviders) {
      return () => {
        active = false
      }
    }

    const loadProviders = async () => {
      try {
        const providers = await fetchAiProviders(state.settings.bridgeUrl)
        if (!active) {
          return
        }
        setAiProviders(providers)
      } catch {
        if (!active) {
          return
        }
        setAiProviders([])
      }
    }

    void loadProviders()

    return () => {
      active = false
    }
  }, [needsOfficialProviders, state.settings.bridgeUrl])

  const codexStatus = bridgeHealth?.providers.find((item) => item.provider === 'codex') ?? null
  const ollamaStatus = bridgeHealth?.providers.find((item) => item.provider === 'ollama') ?? null
  const codexReady = codexStatus?.ready ?? false
  const ollamaReady = ollamaStatus?.ready ?? false

  const selectedAgents = useMemo(
    () => enabledAgents.filter((agent) => effectiveSelectedAgentIds.includes(agent.id)),
    [enabledAgents, effectiveSelectedAgentIds],
  )

  const agentAvailability = useMemo(() => {
    const map = new Map<string, { runnable: boolean; reason: string | null }>()

    enabledAgents.forEach((agent) => {
      if (!canAgentUseApiKey(agent, apiKeyIds)) {
        map.set(agent.id, { runnable: false, reason: 'API 키 필요' })
        return
      }

      if (agent.provider === 'ollama') {
        map.set(agent.id, { runnable: ollamaReady, reason: ollamaReady ? null : 'Ollama 준비 필요' })
        return
      }

      if (agent.provider === 'codex') {
        map.set(agent.id, { runnable: codexReady, reason: codexReady ? null : 'Codex 준비 필요' })
        return
      }

      if (agent.provider === 'official-router') {
        const providerState =
          aiProviders.find((item) => item.provider === resolveOfficialProviderId(agent.baseUrl)) ?? null
        const ready = Boolean(providerState?.enabled && providerState?.configured && agent.model.trim())
        map.set(agent.id, {
          runnable: ready,
          reason: ready ? null : '공식 API 설정 확인 필요',
        })
        return
      }

      map.set(agent.id, { runnable: true, reason: null })
    })

    return map
  }, [enabledAgents, apiKeyIds, ollamaReady, codexReady, aiProviders])

  const selectedAgentStatusItems = useMemo(() => {
    return selectedAgents.map((agent) => {
      if (agent.provider === 'codex') {
        return {
          id: agent.id,
          tone: codexReady ? 'info' : 'warning',
          summary: codexReady ? '연결됨' : '확인 필요',
          detail:
            codexStatus?.warning ||
            codexStatus?.lastError ||
            codexStatus?.detail ||
            'Codex CLI 상태를 아직 확인하지 못했습니다.',
          label: agent.name,
        }
      }

      if (agent.provider === 'ollama') {
        return {
          id: agent.id,
          tone: ollamaReady ? 'info' : 'warning',
          summary: ollamaReady ? '연결됨' : '확인 필요',
          detail:
            ollamaStatus?.warning ||
            ollamaStatus?.lastError ||
            ollamaStatus?.detail ||
            'Ollama 상태를 아직 확인하지 못했습니다.',
          label: agent.name,
        }
      }

      if (agent.provider === 'official-router') {
        const officialStatus =
          aiProviders.find((item) => item.provider === resolveOfficialProviderId(agent.baseUrl)) ?? null
        const ready = Boolean(officialStatus?.enabled && officialStatus?.configured && agent.model.trim())

        return {
          id: agent.id,
          tone: ready ? 'info' : officialStatus ? 'warning' : 'error',
          summary: ready ? '준비됨' : officialStatus ? '설정 필요' : '미설정',
          detail:
            (ready && officialStatus ? `${officialStatus.label} · ${agent.model}` : null) ||
            officialStatus?.last_test_message ||
            officialStatus?.detail ||
            '공식 API 공급자를 아직 확인하지 못했습니다.',
          label: agent.name,
        }
      }

      return {
        id: agent.id,
        tone: 'info',
        summary: '준비됨',
        detail: executionProviderLabel(agent.provider),
        label: agent.name,
      }
    })
  }, [selectedAgents, codexReady, codexStatus, ollamaReady, ollamaStatus, aiProviders])

  const runnableSelectedAgents = useMemo(
    () => selectedAgents.filter((agent) => agentAvailability.get(agent.id)?.runnable),
    [selectedAgents, agentAvailability],
  )

  const skippedSelectedAgents = useMemo(
    () => selectedAgents.filter((agent) => !agentAvailability.get(agent.id)?.runnable),
    [selectedAgents, agentAvailability],
  )

  const canvasAgentStates = useMemo(
    () =>
      selectedAgents.map((agent) => ({
        id: agent.id,
        ready: Boolean(agentAvailability.get(agent.id)?.runnable),
      })),
    [selectedAgents, agentAvailability],
  )

  const sessionSelectedAgentIds = useMemo(
    () =>
      state.orchestration.sessionAgentIds.filter((id) =>
        state.agents.items.some((agent) => agent.id === id),
      ),
    [state.orchestration.sessionAgentIds, state.agents.items],
  )

  const sessionAgentIdSet = useMemo(
    () => new Set(sessionSelectedAgentIds),
    [sessionSelectedAgentIds],
  )

  const sessionRuns = useMemo(() => {
    return state.agents.runs
      .filter((run) => {
        if (!sessionAgentIdSet.has(run.agentId)) {
          return false
        }

        if (!sessionStartedAt) {
          return false
        }

        return Date.parse(run.startedAt) >= sessionStartedAt - 1000
      })
      .sort(
        (left, right) =>
          Date.parse(right.finishedAt ?? right.startedAt) - Date.parse(left.finishedAt ?? left.startedAt),
      )
  }, [state.agents.runs, sessionAgentIdSet, sessionStartedAt])

  const sessionAgents = useMemo(
    () => state.agents.items.filter((agent) => sessionAgentIdSet.has(agent.id)),
    [state.agents.items, sessionAgentIdSet],
  )

  const latestRunsByAgent = useMemo(() => {
    const map = new Map<string, AgentRun>()
    for (const run of sessionRuns) {
      if (!map.has(run.agentId)) {
        map.set(run.agentId, run)
      }
    }
    return map
  }, [sessionRuns])

  const visibleAgentStatusItems = useMemo(
    () =>
      selectedAgentStatusItems.map((item) => {
        const run = latestRunsByAgent.get(item.id)
        const latestLog = run?.logs[run.logs.length - 1]?.message

        if (run?.status === 'running') {
          return {
            ...item,
            summary: '실행 중',
            detail: latestLog || item.detail,
            tone: 'info',
          }
        }

        if (run?.status === 'success') {
          return {
            ...item,
            summary: '최근 완료',
            detail: latestLog || item.detail,
            tone: 'info',
          }
        }

        if (run?.status === 'error') {
          return {
            ...item,
            summary: '최근 실패',
            detail: latestLog || run.output || item.detail,
            tone: 'warning',
          }
        }

        return item
      }),
    [selectedAgentStatusItems, latestRunsByAgent],
  )

  const sessionRunning = sessionRuns.some((run) => run.status === 'running')
  const sessionHasResults = sessionRuns.length > 0
  const latestRunEndTime = sessionRuns[0]
    ? Date.parse(sessionRuns[0].finishedAt ?? sessionRuns[0].startedAt)
    : runClock
  const latestRunElapsedSeconds = sessionRuns[0]
    ? Math.max(
        0,
        Math.floor(
          ((sessionRunning ? runClock : latestRunEndTime) - Date.parse(sessionRuns[0].startedAt)) / 1000,
        ),
      )
    : 0
  const latestRunElapsedLabel = sessionRuns[0] ? formatElapsedSeconds(latestRunElapsedSeconds) : ''
  const sessionDisplayAgents = sessionHasResults ? sessionAgents : runnableSelectedAgents
  const sessionSuccessCount = sessionRuns.filter((run) => run.status === 'success').length
  const sessionErrorCount = sessionRuns.filter((run) => run.status === 'error').length
  const sessionRunningCount = sessionRuns.filter((run) => run.status === 'running').length
  const sessionSkippedCount = Math.max(sessionDisplayAgents.length - sessionRuns.length, 0)

  useEffect(() => {
    if (!sessionRunning) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setRunClock(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [sessionRunning])

  const hasWorkspaceConnection = Boolean(workspaceAbsolutePath)
  const canRunTask =
    Boolean(task.trim()) &&
    runnableSelectedAgents.length > 0 &&
    !sessionRunning &&
    !workspaceError &&
    hasWorkspaceConnection

  const taskTemplates = useMemo(
    () => [
      {
        label: '브리프 정리',
        value: 'AI 관련 소식을 요약해서 짧은 브리프 문서로 정리해 줘.',
      },
      {
        label: '다음 작업',
        value: '최근 실행 결과를 바탕으로 다음 작업 순서를 정리해 줘.',
      },
      {
        label: '자동화 설계',
        value: '현재 선택한 모델을 병렬로 돌릴 자동화 흐름 초안을 제안해 줘.',
      },
    ],
    [],
  )

  const runnerAlerts = useMemo(() => {
    const alerts: Array<{
      key: string
      tone: 'info' | 'warning' | 'error'
      text: string
      actionLabel?: string
      actionPage?: PageId
    }> = []

    if (sessionHasResults) {
      alerts.push({
        key: 'session-summary',
        tone: sessionErrorCount > 0 ? 'warning' : 'info',
        text: `최근 실행 · 성공 ${sessionSuccessCount} · 실패 ${sessionErrorCount} · 진행 중 ${sessionRunningCount}${sessionSkippedCount > 0 ? ` · 제외 ${sessionSkippedCount}` : ''}`,
      })
    }

    if (bridgeError) {
      alerts.push({
        key: 'bridge-error',
        tone: 'error',
        text: bridgeError,
        actionLabel: '설정 열기',
        actionPage: 'settings',
      })
    }

    if (workspaceError) {
      alerts.push({
        key: 'workspace-error',
        tone: 'warning',
        text: workspaceError,
        actionLabel: '내 파일 열기',
        actionPage: 'files',
      })
    } else if (!hasWorkspaceConnection) {
      alerts.push({
        key: 'workspace-missing',
        tone: 'warning',
        text: '작업 폴더가 연결되지 않아 실제 실행을 시작할 수 없습니다.',
        actionLabel: '내 파일 열기',
        actionPage: 'files',
      })
    }

    if (skippedSelectedAgents.length > 0) {
      alerts.push({
        key: 'skipped-agents',
        tone: 'warning',
        text: `${skippedSelectedAgents.length}개 모델은 아직 연결 조건이 맞지 않아 이번 실행에서 제외됩니다.`,
      })
    }

    return alerts
  }, [
    bridgeError,
    hasWorkspaceConnection,
    sessionErrorCount,
    sessionHasResults,
    sessionRunningCount,
    sessionSkippedCount,
    sessionSuccessCount,
    skippedSelectedAgents.length,
    workspaceError,
  ])

  const toggleSelectedAgent = (agentId: string) => {
    const current = selectedAgentIds.filter((id) => enabledAgentIds.has(id))
    const base = current.length > 0 ? current : effectiveSelectedAgentIds

    if (base.includes(agentId)) {
      if (base.length === 1) {
        setOrchestrationSelection(base)
        return
      }

      setOrchestrationSelection(base.filter((id) => id !== agentId))
      return
    }

    setOrchestrationSelection([...base, agentId])
  }

  const runSelectedAgents = async () => {
    const nextTask = task.trim()
    if (!nextTask || runnableSelectedAgents.length === 0) {
      return
    }

    startOrchestrationSession({
      startedAt: new Date().toISOString(),
      task: nextTask,
      agentIds: selectedAgents.map((agent) => agent.id),
    })

    await Promise.allSettled(runnableSelectedAgents.map((agent) => runAgentTask(agent.id, nextTask)))
  }

  const statusTiles = (
    <>
      {visibleAgentStatusItems.map((item) => (
        <article key={item.id} className={`orchestration-statusTile orchestration-statusTile--${item.tone}`}>
          <strong>{item.label}</strong>
          <span>{item.summary}</span>
          <p>{item.detail}</p>
        </article>
      ))}
    </>
  )

  return (
    <section className="page">
      <PageIntro
        description="여러 실행기를 한 번에 돌리고 결과만 빠르게 비교합니다."
        icon="agent"
        title="오케스트레이션"
      />

      <OrchestrationStage
        canvas={
          <div className="orchestration-stage__canvasShell">
            <div className="orchestration-stage__canvas">
              <OrchestrationCanvas
                selectedAgents={selectedAgents}
                agentStates={canvasAgentStates}
                sessionRuns={sessionRuns}
                taskDraft={task}
                sessionTask={state.orchestration.sessionTask}
                recentPrompt={latestMasterMessage?.text ?? ''}
                bridgeError={bridgeError}
                workspaceError={workspaceError}
                requiresApiKey={skippedSelectedAgents.some((agent) => agentAvailability.get(agent.id)?.reason === 'API 키 필요')}
                onNavigate={onNavigate}
              />
            </div>
          </div>
        }
        controls={
          <OrchestrationControls
            enabledAgentToggles={
              <div className="orchestration-inline-dock__agentSwitch">
                {enabledAgents.map((agent) => {
                  const availability = agentAvailability.get(agent.id)
                  const selected = effectiveSelectedAgentIds.includes(agent.id)

                  return (
                    <button
                      key={agent.id}
                      type="button"
                      aria-pressed={selected}
                      className={`chip orchestration-agent-chip ${
                        selected ? 'is-active' : 'chip--soft'
                      } ${availability?.runnable ? '' : 'is-blocked'}`.trim()}
                      onClick={() => toggleSelectedAgent(agent.id)}
                    >
                      <span className={`orchestration-agent-chip__dot ${availability?.runnable ? 'is-ready' : 'is-blocked'}`} />
                      {agent.name}
                    </button>
                  )
                })}
              </div>
            }
            taskField={
              <label className="field field--full orchestration-inline-dock__field">
                <span>작업 지시</span>
                <textarea
                  rows={3}
                  value={task}
                  onChange={(event) => setOrchestrationDraft(event.target.value)}
                  placeholder="예: AI 관련 소식을 요약해서 브리프 문서로 정리해 줘."
                />
              </label>
            }
            actions={
              <>
                <OrchestrationAlerts alerts={runnerAlerts} onNavigate={onNavigate} />
                <div className="orchestration-template-list orchestration-template-list--inline">
                  {taskTemplates.map((template) => (
                    <button
                      key={template.label}
                      type="button"
                      className="chip orchestration-template"
                      onClick={() => setOrchestrationDraft(template.value)}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="primary-button orchestration-dock__submit"
                  disabled={!canRunTask}
                  onClick={runSelectedAgents}
                >
                  {sessionRunning
                    ? `병렬 실행 중 · ${latestRunElapsedLabel || ''}`.trim()
                    : `${Math.max(runnableSelectedAgents.length, 1)}개 모델 실행`}
                </button>
              </>
            }
          />
        }
      />

      <OrchestrationResultsPanel
        hint={
          sessionRuns[0]
            ? runningHint(sessionRuns[0].provider)
            : '실행을 시작하면 각 모델 결과가 이 영역에 바로 쌓입니다.'
        }
        sessionHasResults={sessionHasResults}
        sessionRunning={sessionRunning}
        cards={
          <div className="orchestration-live-panel__cards">
            {sessionDisplayAgents.map((agent) => {
              const run = latestRunsByAgent.get(agent.id)
              const latestLog = run?.logs[run.logs.length - 1]
              const elapsedLabel =
                run && run.status === 'running'
                  ? formatElapsedSeconds(Math.max(0, Math.floor((runClock - Date.parse(run.startedAt)) / 1000)))
                  : ''

              return (
                <OrchestrationResultCard
                  key={agent.id}
                  title={agent.name}
                  provider={executionProviderLabel(agent.provider)}
                  statusLabel={
                    run
                      ? displayRunStatusLabel(run.status)
                      : agentAvailability.get(agent.id)?.reason
                        ? '제외됨'
                        : '대기'
                  }
                  model={agent.model}
                  startedAt={run?.startedAt}
                  elapsedLabel={elapsedLabel}
                  body={run?.output ? run.output : latestLog?.message || '아직 이 모델의 결과가 도착하지 않았습니다.'}
                  logs={run?.logs.slice(-3)}
                />
              )
            })}
          </div>
        }
      />

      <OrchestrationDetails
        selectedAgents={selectedAgents}
        signalCount={state.signals.items.filter((item) => item.subscribed).length}
        activeToolCount={activeTools.length}
        sessionStatus={sessionRuns[0] ? displayRunStatusLabel(sessionRuns[0].status) : undefined}
        latestAgentExecution={latestAgentExecution}
        latestChangedFiles={latestChangedFiles}
        sessionRuns={sessionRuns}
        statusTiles={statusTiles}
      />
    </section>
  )
}

export default OrchestrationPage
