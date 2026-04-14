import { useEffect, useMemo, useState } from 'react'
import type { PageId } from '../crewData'
import { fetchAiProviders, type AiProviderState } from '../lib/aiRoutingClient'
import { DisclosureSection, EmptyState, PageIntro } from '../crewPageShared'
import {
  changeTypeLabel,
  executionProviderLabel,
  formatDate,
  formatFriendlyModelName,
} from '../crewPageHelpers'
import { Icon } from '../icons'
import { OrchestrationCanvas } from '../OrchestrationCanvas'
import type { AgentItem, AgentRun } from '../state/types'
import { useArtemisApp } from '../state/context'

function displayRunStatusLabel(status?: string) {
  switch (status) {
    case 'running':
      return '실시간 생성 중'
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
    return '이 실행기는 토큰을 조금씩 보내기보다 최종 결과를 한 번에 돌려줍니다. 대신 아래 로그와 상태가 먼저 갱신됩니다.'
  }

  return '스트리밍 가능한 공급자는 생성 중 로그와 함께 응답이 순차적으로 갱신됩니다.'
}

function summarizeWorkspaceLabel(workspaceCurrentPath?: string, workspaceAbsolutePath?: string) {
  const resolved = workspaceCurrentPath || workspaceAbsolutePath

  if (!resolved) {
    return '연결 필요'
  }

  if (!workspaceCurrentPath || workspaceCurrentPath === workspaceAbsolutePath) {
    return '루트 작업 폴더'
  }

  const segments = workspaceCurrentPath.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) || '현재 작업 폴더'
}

function canAgentUseApiKey(agent: AgentItem, apiKeyIds: Set<string>) {
  if (agent.provider === 'openai-compatible' || agent.provider === 'anthropic') {
    return Boolean(agent.apiKeyId && apiKeyIds.has(agent.apiKeyId))
  }

  return true
}

export function OrchestrationPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    activeAgent,
    bridgeHealth,
    bridgeError,
    latestExecution,
    runAgentTask,
    state,
    workspaceAbsolutePath,
    workspaceCurrentPath,
    workspaceError,
    workspaceSummary,
  } = useArtemisApp()
  const [task, setTask] = useState('')
  const [aiProviders, setAiProviders] = useState<AiProviderState[]>([])
  const [runClock, setRunClock] = useState(() => Date.now())
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)

  const enabledAgents = useMemo(
    () => state.agents.items.filter((item) => item.enabled),
    [state.agents.items],
  )
  const apiKeyIds = useMemo(() => new Set(state.apiKeys.map((item) => item.id)), [state.apiKeys])
  const activeTools = state.tools.items.filter((item) => item.enabled)
  const latestMasterMessage = [...state.chats.threads.find((thread) => thread.id === state.chats.activeThreadId)?.messages ?? []]
    .reverse()
    .find((message) => message.role === 'master')
  const latestAgentExecution = latestExecution?.source === 'agent' ? latestExecution : null
  const workspaceLabel = summarizeWorkspaceLabel(workspaceCurrentPath, workspaceAbsolutePath)
  const latestChangedFiles = latestAgentExecution?.workspace.changedFiles ?? []
  const enabledAgentIds = useMemo(() => new Set(enabledAgents.map((agent) => agent.id)), [enabledAgents])
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

  const readyOfficialProviders = aiProviders.filter(
    (item) => item.enabled && item.configured && (item.status === 'ready' || item.available_count > 0),
  )
  const codexReady =
    bridgeHealth?.providers.find((item) => item.provider === 'codex')?.ready ?? false
  const ollamaReady =
    bridgeHealth?.providers.find((item) => item.provider === 'ollama')?.ready ?? false

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
        map.set(agent.id, { runnable: ollamaReady, reason: ollamaReady ? null : 'Ollama 미준비' })
        return
      }

      if (agent.provider === 'codex') {
        map.set(agent.id, { runnable: codexReady, reason: codexReady ? null : 'Codex 미준비' })
        return
      }

      if (agent.provider === 'official-router') {
        const ready = readyOfficialProviders.length > 0
        map.set(agent.id, { runnable: ready, reason: ready ? null : '공식 공급자 미준비' })
        return
      }

      map.set(agent.id, { runnable: true, reason: null })
    })

    return map
  }, [enabledAgents, apiKeyIds, ollamaReady, codexReady, readyOfficialProviders])

  const runnableSelectedAgents = useMemo(
    () => selectedAgents.filter((agent) => agentAvailability.get(agent.id)?.runnable),
    [selectedAgents, agentAvailability],
  )

  const skippedSelectedAgents = useMemo(
    () => selectedAgents.filter((agent) => !agentAvailability.get(agent.id)?.runnable),
    [selectedAgents, agentAvailability],
  )

  const selectedAgentIdSet = useMemo(
    () => new Set(effectiveSelectedAgentIds),
    [effectiveSelectedAgentIds],
  )

  const sessionRuns = useMemo(() => {
    return state.agents.runs
      .filter((run) => {
        if (!selectedAgentIdSet.has(run.agentId)) {
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
  }, [state.agents.runs, selectedAgentIdSet, sessionStartedAt])

  const latestRunsByAgent = useMemo(() => {
    const map = new Map<string, AgentRun>()
    for (const run of sessionRuns) {
      if (!map.has(run.agentId)) {
        map.set(run.agentId, run)
      }
    }
    return map
  }, [sessionRuns])

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
  const workspaceStatusLabel = hasWorkspaceConnection ? '폴더 연결' : '폴더 필요'
  const canRunTask =
    Boolean(task.trim()) &&
    runnableSelectedAgents.length > 0 &&
    !sessionRunning &&
    !bridgeError &&
    !workspaceError &&
    hasWorkspaceConnection

  const taskTemplates = useMemo(
    () => [
      {
        label: '소식 브리핑',
        value: 'AI 관련 소식을 요약해서 브리핑 문서로 정리해줘.',
      },
      {
        label: '다음 작업',
        value: '최근 실행 결과를 바탕으로 다음 작업 순서를 정리해줘.',
      },
      {
        label: '자동화 설계',
        value: '현재 활성 모델들을 병렬로 돌려서 자동화 흐름 초안을 제안해줘.',
      },
    ],
    [],
  )

  const executionWorkspaceLabel = latestAgentExecution
    ? summarizeWorkspaceLabel(
        latestAgentExecution.workspace.cwdRelativePath,
        latestAgentExecution.workspace.cwdPath,
      )
    : workspaceLabel

  const toggleSelectedAgent = (agentId: string) => {
    setSelectedAgentIds((previous) => {
      const current = previous.filter((id) => enabledAgentIds.has(id))
      const base = current.length > 0 ? current : effectiveSelectedAgentIds

      if (base.includes(agentId)) {
        if (base.length === 1) {
          return base
        }
        return base.filter((id) => id !== agentId)
      }

      return [...base, agentId]
    })
  }

  const runSelectedAgents = async () => {
    const nextTask = task.trim()
    if (!nextTask || runnableSelectedAgents.length === 0) {
      return
    }

    setSessionStartedAt(Date.now())
    await Promise.allSettled(runnableSelectedAgents.map((agent) => runAgentTask(agent.id, nextTask)))
    setTask('')
  }

  return (
    <section className="page">
      <PageIntro
        description="채팅은 단일, 오케스트레이션은 여러 모델을 병렬로 돌려 결과를 비교합니다."
        icon="agent"
        title="오케스트레이션"
      />

      <section className="panel-card orchestration-stage orchestration-stage--single">
        <div className="orchestration-stage__header orchestration-stage__header--compact">
          <div>
            <h2>실행 흐름 개요</h2>
            <p className="settings-card__lead">
              실행 전엔 단순 흐름만 보이고, 실행하면 선택한 모델 블록이 병렬로 생성됩니다.
            </p>
          </div>
          <div className="orchestration-summary-bar">
            <span className={`chip ${selectedAgents.length > 0 ? 'is-active' : 'chip--soft'}`}>
              선택 {selectedAgents.length}개
            </span>
            <span className={`chip ${runnableSelectedAgents.length > 0 ? 'is-active' : 'chip--soft'}`}>
              실행 {runnableSelectedAgents.length}개
            </span>
            <span className={`chip ${hasWorkspaceConnection ? 'is-active' : 'chip--soft'}`}>
              {workspaceStatusLabel}
            </span>
          </div>
        </div>

        <div className="orchestration-stage__canvasShell">
          <div className="orchestration-stage__canvas">
            <OrchestrationCanvas
              selectedAgents={selectedAgents}
              sessionRuns={sessionRuns}
              tools={state.tools.items}
              filesCount={workspaceSummary.fileCount}
              insightsCount={state.insights.items.length}
              signalCount={state.signals.items.filter((item) => item.subscribed).length}
              activityCount={state.activity.items.length}
              taskDraft={task}
              recentPrompt={latestMasterMessage?.text ?? ''}
              messageCount={state.chats.threads.find((thread) => thread.id === state.chats.activeThreadId)?.messages.length ?? 0}
              latestExecution={latestAgentExecution}
              bridgeError={bridgeError}
              workspaceError={workspaceError}
              requiresApiKey={skippedSelectedAgents.some((agent) => agentAvailability.get(agent.id)?.reason === 'API 키 필요')}
              onNavigate={onNavigate}
            />
          </div>

          <section className="orchestration-inline-dock orchestration-inline-dock--compact">
            <div className="panel-card__header">
              <h2>작업 실행</h2>
              <span className="chip chip--soft">
                {selectedAgents.length > 1 ? '병렬 모드' : '단일 모드'}
              </span>
            </div>

            <div className="orchestration-inline-dock__meta">
              <span className="chip chip--soft">{workspaceStatusLabel}</span>
              <span className="chip chip--soft">
                최근 입력 {latestMasterMessage ? '있음' : '없음'}
              </span>
            </div>

            <div className="orchestration-inline-dock__selection">
              <div className="orchestration-inline-dock__selectionHeader">
                <strong>이번 실행 모델</strong>
                <span>선택한 모델만 병렬 블록으로 생성됩니다.</span>
              </div>
              <div className="orchestration-inline-dock__agentSwitch">
                {enabledAgents.map((agent) => {
                  const availability = agentAvailability.get(agent.id)
                  const selected = effectiveSelectedAgentIds.includes(agent.id)

                  return (
                    <button
                      key={agent.id}
                      aria-pressed={selected}
                      className={`chip orchestration-agent-chip ${
                        selected ? 'is-active' : 'chip--soft'
                      } ${availability?.runnable ? '' : 'is-blocked'}`.trim()}
                      onClick={() => toggleSelectedAgent(agent.id)}
                      type="button"
                    >
                      <span className={`orchestration-agent-chip__dot ${availability?.runnable ? 'is-ready' : 'is-blocked'}`} />
                      {agent.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="orchestration-inline-dock__composer">
              <label className="field field--full orchestration-inline-dock__field">
                <span>작업 지시</span>
                <textarea
                  onChange={(event) => setTask(event.target.value)}
                  placeholder="예: AI 관련 소식을 요약해서 브리핑 문서로 정리해줘."
                  rows={3}
                  value={task}
                />
              </label>

              <div className="orchestration-inline-dock__actions">
                {bridgeError ? (
                  <div className="status-banner status-banner--error">
                    <Icon name="warning" size={16} />
                    <span>{bridgeError}</span>
                    <button
                      className="ghost-button ghost-button--compact"
                      onClick={() => onNavigate('settings')}
                      type="button"
                    >
                      설정 열기
                    </button>
                  </div>
                ) : null}

                {workspaceError ? (
                  <div className="status-banner status-banner--warning">
                    <Icon name="warning" size={16} />
                    <span>{workspaceError}</span>
                    <button
                      className="ghost-button ghost-button--compact"
                      onClick={() => onNavigate('files')}
                      type="button"
                    >
                      내 파일 열기
                    </button>
                  </div>
                ) : null}

                {!workspaceError && !hasWorkspaceConnection ? (
                  <div className="status-banner status-banner--warning">
                    <Icon name="warning" size={16} />
                    <span>작업 폴더가 연결되지 않아 실제 실행을 시작할 수 없습니다.</span>
                    <button
                      className="ghost-button ghost-button--compact"
                      onClick={() => onNavigate('files')}
                      type="button"
                    >
                      내 파일 열기
                    </button>
                  </div>
                ) : null}

                {skippedSelectedAgents.length > 0 ? (
                  <div className="status-banner status-banner--warning">
                    <Icon name="warning" size={16} />
                    <span>
                      {skippedSelectedAgents.length}개 모델은 연결이 덜 끝나 이번 실행에서 제외됩니다.
                    </span>
                  </div>
                ) : null}

                <div className="orchestration-template-list orchestration-template-list--inline">
                  {taskTemplates.map((template) => (
                    <button
                      key={template.label}
                      className="chip orchestration-template"
                      onClick={() => setTask(template.value)}
                      type="button"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>

                <button
                  className="primary-button orchestration-dock__submit"
                  disabled={!canRunTask}
                  onClick={runSelectedAgents}
                  type="button"
                >
                  {sessionRunning
                    ? `병렬 실행 중... ${latestRunElapsedLabel || ''}`.trim()
                    : `${Math.max(runnableSelectedAgents.length, 1)}개 모델 병렬 실행`}
                </button>
              </div>
            </div>

            {sessionHasResults ? (
              <section className="orchestration-live-panel">
                <div className="panel-card__header">
                  <h2>실시간 결과</h2>
                  <span className={`chip ${sessionRunning ? 'is-active' : 'chip--soft'}`}>
                    {sessionRunning ? '병렬 생성 중' : '최근 세션'}
                  </span>
                </div>

                {sessionRuns[0] ? (
                  <p className="orchestration-live-panel__hint">
                    {runningHint(sessionRuns[0].provider)}
                  </p>
                ) : null}

                <div className="orchestration-live-panel__cards">
                  {runnableSelectedAgents.map((agent) => {
                    const run = latestRunsByAgent.get(agent.id)
                    const latestLog = run?.logs[run.logs.length - 1]
                    const elapsedLabel =
                      run && run.status === 'running'
                        ? formatElapsedSeconds(
                            Math.max(
                              0,
                              Math.floor((runClock - Date.parse(run.startedAt)) / 1000),
                            ),
                          )
                        : ''

                    return (
                      <article key={agent.id} className="orchestration-run-card">
                        <div className="orchestration-run-card__header">
                          <div>
                            <strong>{agent.name}</strong>
                            <span>{executionProviderLabel(agent.provider)}</span>
                          </div>
                          <span className={`chip ${run?.status === 'running' ? 'is-active' : 'chip--soft'}`}>
                            {displayRunStatusLabel(run?.status)}
                          </span>
                        </div>

                        <div className="orchestration-run-card__meta">
                          <span className="chip chip--soft">{formatFriendlyModelName(agent.model)}</span>
                          {run ? <span className="chip chip--soft">{formatDate(run.startedAt)}</span> : null}
                          {elapsedLabel ? <span className="chip chip--soft">{elapsedLabel}</span> : null}
                        </div>

                        <div className="orchestration-run-card__body">
                          {run?.output
                            ? run.output
                            : latestLog?.message || '아직 이 모델의 결과가 도착하지 않았습니다.'}
                        </div>

                        {run?.logs.length ? (
                          <div className="orchestration-run-card__logs">
                            {run.logs.slice(-3).map((log) => (
                              <div key={log.id} className={`run-log run-log--${log.level}`}>
                                <span>{formatDate(log.createdAt)}</span>
                                <p>{log.message}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </section>

      <DisclosureSection
        className="disclosure--soft"
        summary="최근 결과, 변경 파일, 병렬 실행 로그"
        title="더보기"
      >
        <div className="orchestration-detail-grid">
          <section className="panel-card">
            <div className="panel-card__header">
              <h2>선택 모델</h2>
              <span className="chip">{selectedAgents.length}개</span>
            </div>
            <div className="chip-wrap">
              {selectedAgents.map((agent) => (
                <span key={agent.id} className="chip chip--soft">
                  {agent.name}
                </span>
              ))}
            </div>
            <div className="stack-grid stack-grid--compact orchestration-detail-stats">
              <div className="summary-row">
                <span>구독 시그널</span>
                <strong>{state.signals.items.filter((item) => item.subscribed).length}개</strong>
              </div>
              <div className="summary-row">
                <span>활성 도구</span>
                <strong>{activeTools.length}개</strong>
              </div>
            </div>
          </section>

          <section className="panel-card orchestration-detail-stack">
            <div className="panel-card__header">
              <h2>최근 결과와 로그</h2>
              {sessionRuns[0] ? <span className="chip chip--soft">{sessionRuns[0].status}</span> : null}
            </div>

            {latestAgentExecution ? (
              <>
                <div className="summary-row">
                  <span>최근 실제 실행</span>
                  <strong>
                    {executionProviderLabel(latestAgentExecution.provider)} ·{' '}
                    {formatFriendlyModelName(latestAgentExecution.model)}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>실행 폴더</span>
                  <strong>{executionWorkspaceLabel}</strong>
                </div>
                <div className="chip-wrap">
                  {latestChangedFiles.length > 0 ? (
                    latestChangedFiles.slice(0, 6).map((item) => (
                      <span
                        key={`${item.changeType}:${item.relativePath}`}
                        className="chip chip--soft"
                      >
                        {changeTypeLabel(item.changeType)} · {item.relativePath}
                      </span>
                    ))
                  ) : (
                    <span className="chip chip--soft">변경 파일 없음</span>
                  )}
                  {latestAgentExecution.workspace.changeDetectionLimited ? (
                    <span className="chip chip--soft">일부 변경만 표시</span>
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState
                description="채팅이나 오케스트레이션을 한 번 실행하면 실제 결과와 변경 파일이 여기에 쌓입니다."
                title="아직 실제 실행 기록이 없습니다"
              />
            )}

            {sessionRuns.length > 0 ? (
              <div className="stack-grid stack-grid--compact">
                {sessionRuns.slice(0, 3).map((run) => (
                  <article key={run.id} className="run-card">
                    <div className="card-topline">
                      <strong>{run.task}</strong>
                      <small>{formatDate(run.startedAt)}</small>
                    </div>
                    <p>{run.output || '아직 결과가 기록되지 않았습니다.'}</p>
                    <div className="run-card__logs">
                      {run.logs.slice(-2).map((log) => (
                        <div key={log.id} className={`run-log run-log--${log.level}`}>
                          <span>{formatDate(log.createdAt)}</span>
                          <p>{log.message}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                description="모델을 병렬 실행하면 최근 로그가 여기에 간단히 쌓입니다."
                title="아직 실행 로그가 없습니다"
              />
            )}
          </section>
        </div>
      </DisclosureSection>
    </section>
  )
}

export default OrchestrationPage
