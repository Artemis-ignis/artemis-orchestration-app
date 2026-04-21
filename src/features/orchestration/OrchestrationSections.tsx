import type { ReactNode } from 'react'
import type { PageId } from '../../crewData'
import { EmptyState, DisclosureSection } from '../../crewPageShared'
import { changeTypeLabel, executionProviderLabel, formatDate, formatFriendlyModelName } from '../../crewPageHelpers'
import { NoticeBanner, PanelCard, SectionHeader, SplitPane, StatusPill, Toolbar } from '../../components/ui/primitives'

export function OrchestrationStage({
  canvas,
  controls,
}: {
  canvas: ReactNode
  controls: ReactNode
}) {
  return (
    <PanelCard className="orchestration-stage orchestration-stage--poster">
      <SplitPane
        className="orchestration-stage__split"
        primary={<div className="orchestration-stage__canvasPane">{canvas}</div>}
        secondary={<div className="orchestration-stage__controlPane">{controls}</div>}
      />
    </PanelCard>
  )
}

export function OrchestrationAlerts({
  alerts,
  onNavigate,
}: {
  alerts: Array<{
    key: string
    tone: 'info' | 'warning' | 'error'
    text: string
    actionLabel?: string
    actionPage?: PageId
  }>
  onNavigate: (page: PageId) => void
}) {
  const priorityAlerts = alerts.filter((alert) => alert.tone !== 'info')
  const visibleAlerts = priorityAlerts.slice(0, 1)

  if (visibleAlerts.length === 0) {
    return null
  }

  return (
    <div className="orchestration-alertStack">
      {visibleAlerts.map((alert) => (
        <NoticeBanner
          key={alert.key}
          action={
            alert.actionLabel && alert.actionPage
              ? { label: alert.actionLabel, onClick: () => onNavigate(alert.actionPage as PageId) }
              : undefined
          }
          tone={alert.tone}
        >
          {alert.text}
        </NoticeBanner>
      ))}
    </div>
  )
}

export function OrchestrationControls({
  enabledAgentToggles,
  taskField,
  actions,
}: {
  enabledAgentToggles: ReactNode
  taskField: ReactNode
  actions: ReactNode
}) {
  return (
    <div className="orchestration-controlStack orchestration-dock">
      <PanelCard className="orchestration-inline-dock orchestration-dock__section" tone="muted">
        <div className="orchestration-inline-dock__selection">{enabledAgentToggles}</div>
        <div className="orchestration-controlForm">
          {taskField}
          {actions}
        </div>
      </PanelCard>
    </div>
  )
}

export function OrchestrationResultsPanel({
  sessionRunning,
  sessionHasResults,
  hint,
  cards,
}: {
  sessionRunning: boolean
  sessionHasResults: boolean
  hint: string
  cards: ReactNode
}) {
  if (!sessionHasResults) {
    return null
  }

  return (
    <PanelCard className="orchestration-live-panel orchestration-live-panel--stream">
      <SectionHeader
        title="결과"
        description={sessionRunning ? hint : undefined}
        actions={
          <StatusPill tone={sessionRunning ? 'accent' : 'muted'}>
            {sessionRunning ? '진행 중' : '최근 세션'}
          </StatusPill>
        }
      />
      {sessionHasResults ? (
        cards
      ) : (
        <EmptyState
          title="첫 응답을 기다리는 중입니다"
          description="실행이 시작되면 각 모델의 결과가 이 영역으로 바로 쌓입니다."
        />
      )}
    </PanelCard>
  )
}

export function OrchestrationResultCard({
  title,
  provider,
  statusLabel,
  model,
  startedAt,
  elapsedLabel,
  body,
  logs,
}: {
  title: string
  provider: string
  statusLabel: string
  model: string
  startedAt?: string
  elapsedLabel?: string
  body: string
  logs?: Array<{ id: string; createdAt: string; message: string; level: 'info' | 'success' | 'error' }>
}) {
  return (
    <article className="orchestration-run-card">
      <div className="orchestration-run-card__header">
        <div>
          <strong>{title}</strong>
          <span>{provider}</span>
        </div>
        <StatusPill tone={statusLabel === '실행 중' ? 'accent' : statusLabel === '응답 완료' ? 'success' : 'muted'}>
          {statusLabel}
        </StatusPill>
      </div>
      <div className="orchestration-run-card__meta">
        <StatusPill tone="muted">{formatFriendlyModelName(model)}</StatusPill>
        {startedAt ? <StatusPill tone="muted">{formatDate(startedAt)}</StatusPill> : null}
        {elapsedLabel ? <StatusPill tone="muted">{elapsedLabel}</StatusPill> : null}
      </div>
      <div className="orchestration-run-card__body">{body}</div>
      {logs?.length ? (
        <div className="orchestration-run-card__logs">
          {logs.map((log) => (
            <div key={log.id} className={`run-log run-log--${log.level}`}>
              <span>{formatDate(log.createdAt)}</span>
              <p>{log.message}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}

export function OrchestrationDetails({
  selectedAgents,
  signalCount,
  activeToolCount,
  sessionStatus,
  latestAgentExecution,
  latestChangedFiles,
  sessionRuns,
  statusTiles,
}: {
  selectedAgents: Array<{ id: string; name: string }>
  signalCount: number
  activeToolCount: number
  sessionStatus?: string
  latestAgentExecution: {
    provider: string
    model: string
    workspace: { changeDetectionLimited?: boolean }
  } | null
  latestChangedFiles: Array<{ changeType: 'created' | 'modified' | 'deleted'; relativePath: string }>
  sessionRuns: Array<{
    id: string
    task: string
    startedAt: string
    output: string
    logs: Array<{ id: string; createdAt: string; message: string; level: 'info' | 'success' | 'error' }>
  }>
  statusTiles: ReactNode
}) {
  return (
    <DisclosureSection className="disclosure--soft" title="상세 보기">
      <div className="orchestration-detail-grid">
        <section className="orchestration-detail-block">
          <SectionHeader title="선택 모델" actions={<StatusPill tone="muted">{selectedAgents.length}개</StatusPill>} />
          <div className="chip-wrap">
            {selectedAgents.length > 0 ? (
              selectedAgents.map((agent) => (
                <StatusPill key={agent.id} tone="muted">
                  {agent.name}
                </StatusPill>
              ))
            ) : (
              <StatusPill tone="muted">선택한 모델 없음</StatusPill>
            )}
          </div>
          <div className="stack-grid stack-grid--compact orchestration-detail-stats">
            <div className="summary-row">
              <span>구독 신호</span>
              <strong>{signalCount}개</strong>
            </div>
            <div className="summary-row">
              <span>활성 도구</span>
              <strong>{activeToolCount}개</strong>
            </div>
          </div>
        </section>

        <section className="orchestration-detail-block">
          <SectionHeader title="모델 상태" />
          {selectedAgents.length > 0 ? (
            <div className="orchestration-statusGrid orchestration-statusGrid--detail">{statusTiles}</div>
          ) : (
            <EmptyState
              title="상태를 볼 모델이 없습니다"
              description="오른쪽에서 모델을 고르면 연결 상태와 최근 실행 상태가 여기에 표시됩니다."
            />
          )}
        </section>

        <section className="orchestration-detail-block orchestration-detail-block--wide">
          <SectionHeader
            title="최근 실행"
            actions={sessionStatus ? <StatusPill tone="muted">{sessionStatus}</StatusPill> : undefined}
          />
          {latestAgentExecution ? (
            <>
              <div className="summary-row">
                <span>최근 실제 실행</span>
                <strong>
                  {executionProviderLabel(latestAgentExecution.provider)} ·{' '}
                  {formatFriendlyModelName(latestAgentExecution.model)}
                </strong>
              </div>
              <div className="chip-wrap">
                {latestChangedFiles.length > 0 ? (
                  latestChangedFiles.slice(0, 5).map((item) => (
                    <StatusPill key={`${item.changeType}:${item.relativePath}`} tone="muted">
                      {changeTypeLabel(item.changeType)} · {item.relativePath}
                    </StatusPill>
                  ))
                ) : (
                  <StatusPill tone="muted">변경 파일 없음</StatusPill>
                )}
                {latestAgentExecution.workspace.changeDetectionLimited ? (
                  <StatusPill tone="warning">일부 변경만 표시</StatusPill>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState
              title="아직 실제 실행 기록이 없습니다"
              description="병렬 실행을 한 번 돌리면 최근 실행 결과와 변경 파일이 여기에 모입니다."
            />
          )}

          {sessionRuns.length > 0 ? (
            <div className="stack-grid stack-grid--compact">
              {sessionRuns.slice(0, 3).map((run) => (
                <article key={run.id} className="run-card">
                  <Toolbar
                    left={<strong>{run.task}</strong>}
                    right={<small>{formatDate(run.startedAt)}</small>}
                    className="run-card__topline"
                  />
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
          ) : null}
        </section>
      </div>
    </DisclosureSection>
  )
}
