import { useMemo, useState } from 'react'
import type { PageId } from '../crewData'
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

  const activeTools = state.tools.items.filter((item) => item.enabled)
  const latestMasterMessage = [...activeThread.messages]
    .reverse()
    .find((message) => message.role === 'master')
  const latestRun = activeAgentRuns[0]
  const latestChangedFiles = latestExecution?.workspace.changedFiles ?? []
  const readyProviderCount = bridgeHealth?.providers.filter((item) => item.ready).length ?? 0
  const ollamaReady = bridgeHealth?.providers.find((item) => item.provider === 'ollama')?.ready ?? false
  const hasReadyProvider = Boolean(readyProviderCount || ollamaReady)
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
        label: '신호 브리핑',
        value: '오늘 시그널을 요약해서 한국어 브리핑 문서로 정리해줘.',
      },
      {
        label: '다음 작업',
        value: '최근 산출물과 변경 파일을 바탕으로 다음 작업 순서를 정리해줘.',
      },
      {
        label: '자동화 설계',
        value: '현재 활성 스킬과 파일을 기준으로 자동화 가능한 작업 흐름을 제안해줘.',
      },
    ],
    [],
  )

  return (
    <section className="page">
      <PageIntro
        description="입력, 에이전트, 연결된 모델과 결과 경로를 한 화면에서 추적하고 바로 실행합니다."
        icon="agent"
        title="오케스트레이션"
      />

      <section className="panel-card orchestration-stage orchestration-stage--single">
        <div className="orchestration-stage__header orchestration-stage__header--compact">
          <div>
            <h2>실행 흐름 개요</h2>
            <p className="settings-card__lead">
              입력이 어디로 흘러가고, 어떤 모델과 도구를 거쳐 결과로 정리되는지 먼저 보여줍니다.
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
              작업 폴더 {workspaceCurrentPath || '루트'}
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
                작업 폴더 {workspaceCurrentPath || workspaceAbsolutePath || '연결 필요'}
              </span>
              <span className="chip chip--soft">
                최근 입력 {latestMasterMessage ? '있음' : '없음'}
              </span>
            </div>

            <div className="orchestration-inline-dock__composer">
              <label className="field field--full orchestration-inline-dock__field">
                <span>작업 지시</span>
                <textarea
                  onChange={(event) => setTask(event.target.value)}
                  placeholder="예: 오늘 시그널을 요약해서 브리핑 문서로 정리해줘."
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
                  {activeAgent?.status === 'running' ? '실행 중...' : '오케스트레이션 실행'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>

      <DisclosureSection
        className="disclosure--soft"
        summary="에이전트 선택, 최근 실행, 변경 파일, 실행 로그"
        title="세부 정보"
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
                description="채팅이나 오케스트레이션을 한 번 실행하면 실제 폴더와 변경 파일이 여기에 쌓입니다."
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
