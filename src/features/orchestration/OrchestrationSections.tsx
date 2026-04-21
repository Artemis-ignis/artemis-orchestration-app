import type { ReactNode } from 'react'
import type { PageId } from '../../crewData'
import { FormattedText } from '../../components/ui/FormattedText'
import { NoticeBanner, PanelCard, SectionHeader, StatusPill, Toolbar } from '../../components/ui/primitives'
import { changeTypeLabel, executionProviderLabel, formatDate, formatFriendlyModelName } from '../../crewPageHelpers'
import { DisclosureSection, EmptyState } from '../../crewPageShared'

function prettifyRunBody(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return '아직 이 모델의 결과가 도착하지 않았습니다.'
  }

  try {
    const parsed = JSON.parse(trimmed) as { ok?: boolean; error?: string; message?: string }
    if (parsed && typeof parsed === 'object' && parsed.ok === false) {
      return parsed.error || parsed.message || '실행 중 오류가 발생했습니다.'
    }
  } catch {
    // plain text
  }

  return trimmed
}

export function OrchestrationStage({
  canvas,
  controls,
}: {
  canvas: ReactNode
  controls: ReactNode
}) {
  return (
    <section className="orchestration-stage orchestration-stage--workspace">
      <div className="orchestration-stage__commandPane">{controls}</div>
      <div className="orchestration-stage__canvasPane">{canvas}</div>
    </section>
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
  const visibleAlerts = alerts.filter((alert) => alert.tone !== 'info').slice(0, 1)

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
              ? { label: alert.actionLabel, onClick: () => onNavigate(alert.actionPage!) }
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
    <section className="orchestration-command-rail">
      <div className="orchestration-command-block orchestration-command-block--agents">
        <div className="orchestration-inline-dock__selectionHeader">
          <strong>실행 대상 모델</strong>
          <span>필요한 모델만 남겨서 바로 돌립니다.</span>
        </div>
        <div className="orchestration-inline-dock__selection">{enabledAgentToggles}</div>
      </div>

      <div className="orchestration-command-block orchestration-command-block--task">
        <div className="orchestration-inline-dock__selectionHeader">
          <strong>작업 지시</strong>
          <span>짧고 직접적인 문장 하나면 충분합니다.</span>
        </div>
        {taskField}
      </div>

      <PanelCard className="orchestration-inline-dock orchestration-command-block orchestration-command-block--action" tone="muted">
        <div className="orchestration-controlForm">{actions}</div>
      </PanelCard>
    </section>
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
    <PanelCard
      className="orchestration-live-panel orchestration-live-panel--stream"
      title="결과"
      description={sessionRunning ? hint : '최근 실행 결과를 모델별로 바로 확인합니다.'}
      actions={<StatusPill tone={sessionRunning ? 'accent' : 'muted'}>{sessionRunning ? '실행 중' : '최근 실행'}</StatusPill>}
    >
      {cards}
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
  const tone =
    statusLabel === '실행 중'
      ? 'accent'
      : statusLabel === '응답 완료'
        ? 'success'
        : statusLabel === '실행 오류'
          ? 'warning'
          : 'muted'

  return (
    <article className="orchestration-run-card">
      <div className="orchestration-run-card__rail">
        <div className="orchestration-run-card__header">
          <div>
            <strong>{title}</strong>
            <span>{provider}</span>
          </div>
          <StatusPill tone={tone}>{statusLabel}</StatusPill>
        </div>
        <div className="orchestration-run-card__meta">
          <StatusPill tone="muted">{formatFriendlyModelName(model)}</StatusPill>
          {startedAt ? <StatusPill tone="muted">{formatDate(startedAt)}</StatusPill> : null}
          {elapsedLabel ? <StatusPill tone="muted">{elapsedLabel}</StatusPill> : null}
        </div>
      </div>
      <div className="orchestration-run-card__content">
        <div className="orchestration-run-card__body">
          <FormattedText text={prettifyRunBody(body)} />
        </div>
        {logs?.length ? (
          <div className="orchestration-run-card__logs">
            {logs.map((log) => (
              <div key={log.id} className={`run-log run-log--${log.level}`}>
                <span>{formatDate(log.createdAt)}</span>
                <p>{prettifyRunBody(log.message)}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
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
    <DisclosureSection className="disclosure--soft orchestration-detail-disclosure" title="상세 상태" summary="모델 상태와 최근 변경">
      <div className="orchestration-detail-grid">
        <section className="orchestration-detail-block">
          <SectionHeader title="이번 실행 구성" actions={<StatusPill tone="muted">{selectedAgents.length}개</StatusPill>} />
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
              <span>구독 중 시그널</span>
              <strong>{signalCount}개</strong>
            </div>
            <div className="summary-row">
              <span>사용 중 스킬</span>
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
              title="아직 선택한 모델이 없습니다"
              description="위 실행 레일에서 모델을 고르면 여기서 바로 상태를 확인할 수 있습니다."
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
                <span>마지막 실행 모델</span>
                <strong>
                  {executionProviderLabel(latestAgentExecution.provider)} · {formatFriendlyModelName(latestAgentExecution.model)}
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
              title="아직 실행 기록이 없습니다"
              description="모델을 실행하면 여기서 최근 결과와 변경 파일을 바로 확인할 수 있습니다."
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
                  <FormattedText text={prettifyRunBody(run.output)} />
                  <div className="run-card__logs">
                    {run.logs.slice(-2).map((log) => (
                      <div key={log.id} className={`run-log run-log--${log.level}`}>
                        <span>{formatDate(log.createdAt)}</span>
                        <p>{prettifyRunBody(log.message)}</p>
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
