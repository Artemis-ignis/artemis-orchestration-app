import { chatPromptCards, type PageId } from '../../crewData'
import { NoticeBanner, PanelCard, StatCard, StatusPill } from '../../components/ui/primitives'

export function ChatStatusSummary({
  readyCount,
  currentModelName,
  currentRouteLabel,
  threadCount,
}: {
  readyCount: number
  currentModelName: string
  currentRouteLabel: string
  threadCount: number
}) {
  return (
    <div className="chat-contextGrid">
      <StatCard
        label="현재 실행기"
        meta={currentRouteLabel}
        tone={readyCount > 0 ? 'success' : 'warning'}
        value={currentModelName}
      />
      <StatCard
        label="준비 상태"
        meta={readyCount > 0 ? '로컬 연결 확인 완료' : '설정 또는 연결 확인 필요'}
        value={`${readyCount}개 준비`}
      />
      <StatCard
        label="대화 흐름"
        meta="브라우저 세션 기준"
        value={`${threadCount}개 스레드`}
      />
    </div>
  )
}

export function ChatAlertStack({
  items,
  onNavigate,
}: {
  items: Array<{
    key: string
    tone: 'info' | 'warning' | 'error'
    text: string
    actionLabel?: string
    actionPage?: PageId
  }>
  onNavigate: (page: PageId) => void
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="chat-alertStack">
      {items.map((item) => (
        <NoticeBanner
          key={item.key}
          action={
            item.actionLabel && item.actionPage
              ? { label: item.actionLabel, onClick: () => onNavigate(item.actionPage as PageId) }
              : undefined
          }
          tone={item.tone}
        >
          {item.text}
        </NoticeBanner>
      ))}
    </div>
  )
}

export function ChatIdlePanel({
  onPickPrompt,
  currentRouteLabel,
  currentModelName,
  workspaceLabel,
  workspaceMeta,
}: {
  onPickPrompt: (value: string) => void
  currentRouteLabel: string
  currentModelName: string
  workspaceLabel: string
  workspaceMeta: string
}) {
  return (
    <div className="chat-empty-shell">
      <div className="chat-empty-shell__hero">
        <StatusPill tone="muted">대화 작업면 준비 완료</StatusPill>
        <h2>바로 작업을 시작할 수 있습니다.</h2>
        <p>
          한 문장으로 지시를 보내면 현재 선택한 모델, 연결된 작업 기준, 최근 상태 정보를 바탕으로 바로 응답과 후속 작업이 이어집니다.
        </p>
        <div className="chat-empty-state__actions chat-empty-state__actions--compact chip-wrap">
          {chatPromptCards.map((item) => (
            <button
              key={item.title}
              className="chip chat-empty-chip"
              onClick={() => onPickPrompt(item.description)}
              title={item.description}
              type="button"
            >
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      </div>
      <PanelCard className="chat-empty-shell__side" tone="muted">
        <div className="chat-empty-shell__meta">
          <div>
            <strong>현재 모델</strong>
            <span>{currentModelName}</span>
            <small>{currentRouteLabel}</small>
          </div>
          <div>
            <strong>작업 기준</strong>
            <span>{workspaceLabel}</span>
            <small>{workspaceMeta}</small>
          </div>
        </div>
      </PanelCard>
    </div>
  )
}
