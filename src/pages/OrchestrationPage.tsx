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
    return '현재 실행기는 최종 답변을 한 번에 반환합니다. 완료 전까지는 아래 진행 로그가 먼저 갱신됩니다.'
  }

  return '현재 공급자는 스트리밍으로 응답을 보내는 중입니다. 결과와 시도 로그가 순서대로 갱신됩니다.'
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

export function OrchestrationPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    activeAgent,
    activeAgentRuns,
    activeThread,
    bridgeHealth,
    bridgeError,
    latestExecution,
    runAgentTask,
    setActiveAgent,
    state,
    workspaceAbsolutePath,
    workspaceCurrentPath,
    workspaceError,
    workspaceSummary,
  } = useArtemisApp()
  const [task, setTask] = useState('')
  const [aiProviders, setAiProviders] = useState<AiProviderState[]>([])
  const [runClock, setRunClock] = useState(() => Date.now())

  const activeTools = state.tools.items.filter((item) => item.enabled)
  const latestMasterMessage = [...activeThread.messages]
    .reverse()
    .find((message) => message.role === 'master')
  const latestRun = useMemo(
    () =>
      activeAgentRuns
        .slice()
        .sort((left, right) => {
          const leftTime = Date.parse(left.finishedAt ?? left.startedAt)
          const rightTime = Date.parse(right.finishedAt ?? right.startedAt)
          return rightTime - leftTime
        })[0] ?? null,
    [activeAgentRuns],
  )
  const liveRunLogs = latestRun?.logs.slice(-6) ?? []
  const latestRunCurrentMessage = liveRunLogs[liveRunLogs.length - 1]?.message ?? ''
  const latestRunEndTime = latestRun
    ? Date.parse(latestRun.finishedAt ?? latestRun.startedAt)
    : runClock
  const latestRunElapsedSeconds = latestRun
    ? Math.max(
        0,
        Math.floor(
          ((latestRun.status === 'running' ? runClock : latestRunEndTime) -
            Date.parse(latestRun.startedAt)) /
            1000,
        ),
      )
    : 0
  const latestRunElapsedLabel = latestRun ? formatElapsedSeconds(latestRunElapsedSeconds) : ''
  const latestChangedFiles = latestExecution?.workspace.changedFiles ?? []
  const readyProviderCount = bridgeHealth?.providers.filter((item) => item.ready).length ?? 0
  const ollamaReady =
    bridgeHealth?.providers.find((item) => item.provider === 'ollama')?.ready ?? false
  const officialProviders =
    activeAgent?.provider === 'official-router' ? aiProviders : []
  const readyOfficialProviders = officialProviders.filter(
    (item) => item.enabled && item.configured && (item.status === 'ready' || item.available_count > 0),
  )
  const hasReadyProvider =
    activeAgent?.provider === 'official-router'
      ? readyOfficialProviders.length > 0
      : Boolean(readyProviderCount || ollamaReady)
  const hasWorkspaceConnection = Boolean(workspaceAbsolutePath)
  const subscribedSignalCount = state.signals.items.filter((item) => item.subscribed).length
  const subscribedSignalTitles = state.signals.items
    .filter((item) => item.subscribed)
    .map((item) => item.title)
  const latestInsightTitles = state.insights.items.map((item) => item.title)
  const latestActivityTitles = state.activity.items.map((item) => item.title)
  const requiresApiKey =
    (activeAgent?.provider === 'openai-compatible' || activeAgent?.provider === 'anthropic') &&
    !state.apiKeys.some((item) => item.id === activeAgent.apiKeyId)
  const workspaceLabel = summarizeWorkspaceLabel(workspaceCurrentPath, workspaceAbsolutePath)

  const canRunTask =
    Boolean(activeAgent) &&
    Boolean(task.trim()) &&
    activeAgent?.status !== 'running' &&
    !requiresApiKey &&
    hasReadyProvider &&
    hasWorkspaceConnection &&
    !bridgeError &&
    !workspaceError

  const taskTemplates = useMemo(
    () => [
      {
        label: '소식 브리핑',
        value: 'AI 관련 소식을 요약해서 핵심 브리핑으로 정리해줘.',
      },
      {
        label: '다음 작업',
        value: '최근 실행 결과를 바탕으로 다음 작업 순서를 정리해줘.',
      },
      {
        label: '자동화 설계',
        value: '현재 활성 도구와 파일을 기준으로 자동화 흐름을 제안해줘.',
      },
    ],
    [],
  )

  useEffect(() => {
    if (latestRun?.status !== 'running') {
      return undefined
    }

    const timer = window.setInterval(() => {
      setRunClock(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [latestRun?.id, latestRun?.status])

  useEffect(() => {
    let active = true

    if (activeAgent?.provider !== 'official-router') {
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
  }, [activeAgent?.provider, state.settings.bridgeUrl])

  return (
    <section className="page">
      <PageIntro
        description="입력에서 결과까지 어떤 경로로 흘러가는지 먼저 보고, 같은 화면에서 바로 실행합니다."
        icon="agent"
        title="오케스트레이션"
      />

      <section className="panel-card orchestration-stage orchestration-stage--single">
        <div className="orchestration-stage__header orchestration-stage__header--compact">
          <div>
            <h2>실행 흐름 개요</h2>
            <p className="settings-card__lead">
              입력이 어디로 흐르고, 어떤 모델과 도구를 거쳐 결과로 정리되는지 먼저 보여줍니다.
            </p>
          </div>
          <div className="orchestration-summary-bar">
            <span className={`chip ${activeAgent ? 'is-active' : 'chip--soft'}`}>
              {activeAgent
                ? `${formatFriendlyModelName(activeAgent.model)} · ${executionProviderLabel(activeAgent.provider)}`
                : '에이전트 선택 필요'}
            </span>
            <span className={`chip ${hasReadyProvider ? 'is-active' : 'chip--soft'}`}>
              실행기 {readyProviderCount}개
            </span>
            <span className={`chip ${hasWorkspaceConnection ? 'is-active' : 'chip--soft'}`}>
              작업 폴더 {workspaceLabel}
            </span>
          </div>
        </div>

        <div className="orchestration-stage__canvasShell">
          <div className="orchestration-stage__canvas">
            <OrchestrationCanvas
              activeAgent={activeAgent}
              activityCount={state.activity.items.length}
              activityTitles={latestActivityTitles}
              bridgeError={bridgeError}
              filesCount={workspaceSummary.fileCount}
              insightsCount={state.insights.items.length}
              insightTitles={latestInsightTitles}
              latestExecution={latestExecution}
              messageCount={activeThread.messages.length}
              onNavigate={onNavigate}
              onSelectAgent={setActiveAgent}
              recentPrompt={latestMasterMessage?.text ?? ''}
              requiresApiKey={requiresApiKey}
              runs={activeAgentRuns}
              signalCount={subscribedSignalCount}
              signalTitles={subscribedSignalTitles}
              tools={state.tools.items}
              workspaceError={workspaceError}
            />
          </div>

          <section className="orchestration-inline-dock orchestration-inline-dock--compact">
            <div className="panel-card__header">
              <h2>작업 실행</h2>
              {activeAgent ? (
                <span className="chip chip--soft">{formatFriendlyModelName(activeAgent.model)}</span>
              ) : null}
            </div>

            <div className="orchestration-inline-dock__meta">
              <span className="chip chip--soft">
                작업 폴더 {workspaceLabel}
              </span>
              <span className="chip chip--soft">
                최근 입력 {latestMasterMessage ? '있음' : '없음'}
              </span>
            </div>

            <div className="orchestration-inline-dock__agentSwitch">
              {state.agents.items.map((agent) => (
                <button
                  key={agent.id}
                  className={`chip ${activeAgent?.id === agent.id ? 'is-active' : 'chip--soft'}`}
                  onClick={() => setActiveAgent(agent.id)}
                  type="button"
                >
                  {agent.name}
                </button>
              ))}
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
                {requiresApiKey ? (
                  <div className="status-banner status-banner--error">
                    <Icon name="warning" size={16} />
                    <span>이 에이전트는 API 키 연결이 필요합니다.</span>
                    <button
                      className="ghost-button ghost-button--compact"
                      onClick={() => onNavigate('settings')}
                      type="button"
                    >
                      설정 열기
                    </button>
                  </div>
                ) : null}

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

                {!bridgeError && !hasReadyProvider ? (
                  <div className="status-banner status-banner--warning">
                    <Icon name="warning" size={16} />
                    <span>준비된 실행기가 없어 지금은 실행할 수 없습니다.</span>
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
                    <span>작업 폴더가 연결되지 않아 실제 파일 작업을 시작할 수 없습니다.</span>
                    <button
                      className="ghost-button ghost-button--compact"
                      onClick={() => onNavigate('files')}
                      type="button"
                    >
                      내 파일 열기
                    </button>
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
                  onClick={async () => {
                    if (!activeAgent) {
                      return
                    }

                    await runAgentTask(activeAgent.id, task)
                    setTask('')
                  }}
                  type="button"
                >
                  {activeAgent?.status === 'running'
                    ? `실행 중... ${latestRunElapsedLabel || ''}`.trim()
                    : '오케스트레이션 실행'}
                </button>
              </div>
            </div>

            {latestRun ? (
              <section className="orchestration-live-panel">
                <div className="panel-card__header">
                  <h2>실시간 결과</h2>
                  <span className={`chip ${latestRun.status === 'running' ? 'is-active' : 'chip--soft'}`}>
                    {displayRunStatusLabel(latestRun.status)}
                  </span>
                </div>

                <div className="orchestration-live-panel__grid">
                  <article className="orchestration-live-panel__output">
                    <div className="orchestration-live-panel__meta">
                      <span className="chip chip--soft">{executionProviderLabel(latestRun.provider)}</span>
                      <span className="chip chip--soft">{formatFriendlyModelName(latestRun.model)}</span>
                      <span className="chip chip--soft">{formatDate(latestRun.startedAt)}</span>
                      {latestRunElapsedLabel ? (
                        <span className="chip chip--soft">{latestRunElapsedLabel}</span>
                      ) : null}
                    </div>
                    {latestRun.status === 'running' && latestRunCurrentMessage ? (
                      <div className="orchestration-live-panel__statusLine">
                        <span>현재 단계</span>
                        <strong>{latestRunCurrentMessage}</strong>
                      </div>
                    ) : null}
                    {latestRun.status === 'running' ? (
                      <p className="orchestration-live-panel__hint">{runningHint(latestRun.provider)}</p>
                    ) : null}
                    <div className="orchestration-live-panel__text">
                      {latestRun.output ||
                        (latestRun.status === 'running'
                          ? latestRunCurrentMessage || '실행기가 응답을 준비하는 중입니다. 아래 로그가 먼저 갱신됩니다.'
                          : '아직 결과가 없습니다.')}
                    </div>
                  </article>

                  <aside className="orchestration-live-panel__logs">
                    <div className="orchestration-live-panel__logsHeader">
                      <strong>시도 로그</strong>
                      <span>{liveRunLogs.length}개</span>
                    </div>
                    {liveRunLogs.length > 0 ? (
                      <div className="orchestration-live-panel__logList">
                        {liveRunLogs.map((log) => (
                          <div key={log.id} className={`run-log run-log--${log.level}`}>
                            <span>{formatDate(log.createdAt)}</span>
                            <p>{log.message}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="orchestration-live-panel__empty">
                        실행을 시작하면 여기에서 후보 선택과 진행 상태를 바로 볼 수 있습니다.
                      </p>
                    )}
                  </aside>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </section>

      <DisclosureSection
        className="disclosure--soft"
        summary="에이전트 선택, 최근 실행, 변경 파일, 실행 로그"
        title="더 보기"
      >
        <div className="orchestration-detail-grid">
          <section className="panel-card">
            <div className="panel-card__header">
              <h2>활성 에이전트</h2>
              <span className="chip">{state.agents.items.length}개</span>
            </div>
            <div className="chip-wrap">
              {state.agents.items.map((agent) => (
                <button
                  key={agent.id}
                  className={`chip ${activeAgent?.id === agent.id ? 'is-active' : ''}`}
                  onClick={() => setActiveAgent(agent.id)}
                  type="button"
                >
                  {agent.name}
                </button>
              ))}
            </div>
            <div className="stack-grid stack-grid--compact orchestration-detail-stats">
              <div className="summary-row">
                <span>구독 시그널</span>
                <strong>{subscribedSignalCount}개</strong>
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
              {latestRun ? <span className="chip chip--soft">{latestRun.status}</span> : null}
            </div>

            {latestExecution ? (
              <>
                <div className="summary-row">
                  <span>최근 실제 실행</span>
                  <strong>
                    {executionProviderLabel(latestExecution.provider)} ·{' '}
                    {formatFriendlyModelName(latestExecution.model)}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>실행 폴더</span>
                  <strong>{latestExecution.workspace.cwdPath}</strong>
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
                  {latestExecution.workspace.changeDetectionLimited ? (
                    <span className="chip chip--soft">일부 변경만 표시</span>
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState
                description="채팅이나 오케스트레이션을 한 번 실행하면 실제 폴더와 변경 파일 정보가 여기에 쌓입니다."
                title="아직 실제 실행 기록이 없습니다"
              />
            )}

            {activeAgentRuns.length > 0 ? (
              <div className="stack-grid stack-grid--compact">
                {activeAgentRuns.slice(0, 2).map((run) => (
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
                description="작업을 실행하면 최근 로그가 여기에 간단히 쌓입니다."
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
