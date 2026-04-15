import type { ReactNode } from 'react'
import type { PageId } from '../../crewData'
import { EmptyState, DisclosureSection } from '../../crewPageShared'
import { changeTypeLabel, executionProviderLabel, formatDate, formatFriendlyModelName } from '../../crewPageHelpers'
import { NoticeBanner, PanelCard, SectionHeader, SplitPane, StatusPill, Toolbar } from '../../components/ui/primitives'

export function OrchestrationStage({
  summary,
  canvas,
  controls,
}: {
  summary: {
    selectedCount: number
    runnableCount: number
    workspaceStatusLabel: string
  }
  canvas: ReactNode
  controls: ReactNode
}) {
  return (
    <PanelCard className="orchestration-stage orchestration-stage--premium">
      <SectionHeader
        title="실행 결과 개요"
        description="캔버스가 전체 흐름을 보여주고, 오른쪽에서 이번 실행 조합과 지시를 바로 조정합니다."
        actions={
          <div className="orchestration-summary-bar">
            <StatusPill tone={summary.selectedCount > 0 ? 'accent' : 'muted'}>선택 {summary.selectedCount}개</StatusPill>
            <StatusPill tone={summary.runnableCount > 0 ? 'success' : 'warning'}>실행 {summary.runnableCount}개</StatusPill>
            <StatusPill tone={summary.workspaceStatusLabel === '폴더 연결' ? 'muted' : 'warning'}>
              {summary.workspaceStatusLabel}
            </StatusPill>
          </div>
        }
      />
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
  if (alerts.length === 0) {
    return null
  }

  return (
    <div className="orchestration-alertStack">
      {alerts.map((alert) => (
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
  statusTiles,
  taskField,
  actions,
}: {
  enabledAgentToggles: ReactNode
  statusTiles: ReactNode
  taskField: ReactNode
  actions: ReactNode
}) {
  return (
    <div className="orchestration-controlStack">
      <PanelCard tone="muted">
        <SectionHeader title="이번 실행" description="체크한 모델만 돌리고 결과는 아래 카드에 고정됩니다." />
        <div className="orchestration-inline-dock__selection">{enabledAgentToggles}</div>
      </PanelCard>
      <PanelCard tone="muted">
        <SectionHeader title="모델 상태" description="연결 상태와 최근 실행 요약을 함께 봅니다." />
        <div className="orchestration-statusGrid">{statusTiles}</div>
      </PanelCard>
      <PanelCard tone="muted">
        <SectionHeader title="작업 지시" description="같은 지시를 여러 모델에 동시에 보냅니다." />
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
  return (
    <PanelCard className="orchestration-live-panel">
      <SectionHeader
        title="실행 결과"
        description={hint}
        actions={
          <StatusPill tone={sessionRunning ? 'accent' : sessionHasResults ? 'muted' : 'muted'}>
            {sessionRunning ? '진행 중' : sessionHasResults ? '최근 세션' : '대기 중'}
          </StatusPill>
        }
      />
      {sessionHasResults ? cards : <EmptyState title="결과는 여기 쌓입니다" description="모델을 실행하면 각 결과와 최근 로그가 이 영역에 바로 추가됩니다." />}
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
}) {
  return (
    <DisclosureSection className="disclosure--soft" summary="최근 결과, 변경 파일, 병렬 실행 로그" title="더보기">
      <div className="orchestration-detail-grid">
        <PanelCard>
          <SectionHeader title="선택 모델" actions={<StatusPill tone="muted">{selectedAgents.length}개</StatusPill>} />
          <div className="chip-wrap">
            {selectedAgents.map((agent) => (
              <StatusPill key={agent.id} tone="muted">
                {agent.name}
              </StatusPill>
            ))}
          </div>
          <div className="stack-grid stack-grid--compact orchestration-detail-stats">
            <div className="summary-row">
              <span>구독 시그널</span>
              <strong>{signalCount}개</strong>
            </div>
            <div className="summary-row">
              <span>활성 도구</span>
              <strong>{activeToolCount}개</strong>
            </div>
          </div>
        </PanelCard>

        <PanelCard>
          <SectionHeader
            title="최근 결과와 로그"
            actions={sessionStatus ? <StatusPill tone="muted">{sessionStatus}</StatusPill> : undefined}
          />
          {latestAgentExecution ? (
            <>
              <div className="summary-row">
                <span>최근 실제 실행</span>
                <strong>
                  {executionProviderLabel(latestAgentExecution.provider)} · {formatFriendlyModelName(latestAgentExecution.model)}
                </strong>
              </div>
              <div className="chip-wrap">
                {latestChangedFiles.length > 0 ? (
                  latestChangedFiles.slice(0, 6).map((item) => (
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
            <EmptyState description="채팅이나 오케스트레이션을 한 번 실행하면 실제 결과와 변경 파일이 여기에 쌓입니다." title="아직 실제 실행 기록이 없습니다" />
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
          ) : (
            <EmptyState description="모델을 병렬 실행하면 최근 로그가 여기에 간단히 쌓입니다." title="아직 실행 로그가 없습니다" />
          )}
        </PanelCard>
      </div>
    </DisclosureSection>
  )
}
