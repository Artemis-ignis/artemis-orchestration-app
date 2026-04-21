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
    <PanelCard className="orchestration-stage orchestration-stage--premium">
      <SectionHeader
        title="실행 흐름"
        description="왼쪽에서 흐름을 보고, 오른쪽에서 선택과 지시만 바로 조정합니다."
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
  taskField,
  actions,
}: {
  enabledAgentToggles: ReactNode
  taskField: ReactNode
  actions: ReactNode
}) {
  return (
    <div className="orchestration-controlStack">
      <PanelCard className="orchestration-inline-dock" tone="muted">
        <SectionHeader
          title="지금 실행"
          description="모델을 고르고 지시를 넣으면 바로 병렬 실행합니다."
        />
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
  return (
    <PanelCard className="orchestration-live-panel">
      <SectionHeader
        title="실행 결과"
        description={hint}
        actions={
          <StatusPill tone={sessionRunning ? 'accent' : 'muted'}>
            {sessionRunning ? '진행 중' : sessionHasResults ? '최근 세션' : '대기 중'}
          </StatusPill>
        }
      />
      {sessionHasResults ? (
        cards
      ) : (
        <EmptyState
          title="결과는 여기로 모입니다"
          description="모델을 실행하면 각 결과와 최근 로그가 이 영역에 바로 쌓입니다."
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
    <DisclosureSection className="disclosure--soft" summary="모델 상태, 최근 결과, 변경 파일" title="자세히 보기">
      <div className="orchestration-detail-grid">
        <PanelCard>
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
        </PanelCard>

        <PanelCard>
          <SectionHeader title="모델 상태" description="첫 화면에서 뺀 상태 정보는 여기서 한 번에 확인합니다." />
          {selectedAgents.length > 0 ? (
            <div className="orchestration-statusGrid orchestration-statusGrid--detail">{statusTiles}</div>
          ) : (
            <EmptyState
              title="상태를 볼 모델이 없습니다"
              description="오른쪽 실행 도크에서 모델을 고르면 연결 상태와 최근 실행 상태가 여기로 모입니다."
            />
          )}
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
            <EmptyState
              title="아직 실제 실행 기록이 없습니다"
              description="병렬 실행을 한 번 돌리면 최근 실행 결과와 변경 파일이 여기로 모입니다."
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
          ) : (
            <EmptyState
              title="아직 실행 로그가 없습니다"
              description="모델을 병렬 실행하면 최근 로그가 이 영역에 간단히 쌓입니다."
            />
          )}
        </PanelCard>
      </div>
    </DisclosureSection>
  )
}
