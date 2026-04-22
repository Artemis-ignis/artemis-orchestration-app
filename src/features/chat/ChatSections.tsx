import { chatPromptCards } from '../../crewData'

const quickActionHints = [
  '오늘 들어온 흐름 빠르게 정리',
  '구조와 수정 포인트 점검',
  '다음 실행 순서 바로 제안',
]

const workspaceFacts = [
  {
    label: '대화',
    text: '질문을 정리하고 바로 다음 실행 단계까지 이어서 제안합니다.',
  },
  {
    label: '파일',
    text: '업로드한 자료를 기준으로 요약, 수정 포인트, 검토 순서를 좁힙니다.',
  },
  {
    label: '실행',
    text: '연결 상태와 막힌 지점을 먼저 드러내고 필요한 조치만 남깁니다.',
  },
]

export function ChatIdlePanel({
  onPickPrompt,
  currentModelName,
  currentRouteLabel,
  focusModelName,
  focusRouteLabel,
  heroDescription,
  blockedSelectionLabel,
  isBlocked = false,
  canPickPrompt = true,
  quickStartHint,
  statusLabel,
  statusTitle,
  statusDetail,
  inputPreviewTitle,
  inputPreviewDetail,
  inputPreviewPlaceholder,
  onOpenSettings,
  openSettingsLabel = '설정 및 연결',
  onRecoverRoute,
  recoverRouteLabel,
}: {
  onPickPrompt: (value: string) => void
  currentModelName: string
  currentRouteLabel: string
  focusModelName?: string
  focusRouteLabel?: string
  heroDescription?: string
  blockedSelectionLabel?: string
  isBlocked?: boolean
  canPickPrompt?: boolean
  quickStartHint?: string
  statusLabel: string
  statusTitle: string
  statusDetail: string
  inputPreviewTitle?: string
  inputPreviewDetail?: string
  inputPreviewPlaceholder?: string
  onOpenSettings?: () => void
  openSettingsLabel?: string
  onRecoverRoute?: () => void
  recoverRouteLabel?: string
}) {
  const visiblePromptCards = chatPromptCards.slice(0, 3)
  const primaryRouteLabel = focusRouteLabel ?? currentRouteLabel
  const primaryModelName = focusModelName ?? currentModelName
  const resolvedHeroDescription =
    heroDescription ??
    `${primaryModelName} 기준으로 채팅, 코드 수정, 파일 점검, 다음 작업 정리까지 한 흐름으로 이어갑니다.`
  const resolvedInputPreviewTitle =
    inputPreviewTitle ?? '연결이 복구되면 여기서 바로 이어서 대화합니다.'
  const resolvedInputPreviewDetail =
    inputPreviewDetail ?? `현재 선택: ${primaryRouteLabel} · ${primaryModelName}`
  const resolvedInputPreviewPlaceholder =
    inputPreviewPlaceholder ?? '실행기 복구 후 질문이나 작업 지시를 바로 입력할 수 있습니다.'

  return (
    <div className="chat-empty-shell">
      <div className="chat-empty-shell__hero">
        <div className="chat-empty-shell__main">
          <div className="chat-empty-shell__eyebrow">
            <span className="chat-empty-shell__route">Artemis Wide</span>
            <span className="chat-empty-shell__route">{primaryRouteLabel}</span>
            <span className="chat-empty-shell__route">{primaryModelName}</span>
          </div>
          {blockedSelectionLabel ? <p className="chat-empty-shell__contextNote">{blockedSelectionLabel}</p> : null}

          <div className="chat-empty-shell__headline">
            <h2>바로 묻고 바로 실행합니다.</h2>
            <p>{resolvedHeroDescription}</p>
          </div>

          <div className="chat-empty-shell__details">
            <span className="chat-empty-shell__sectionLabel">작업 범위</span>
            <ul className="chat-empty-shell__detailList">
              {workspaceFacts.map((item) => (
                <li className="chat-empty-shell__detailItem" key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {isBlocked ? (
            <div className="chat-empty-shell__inputPreview" aria-hidden="true">
              <span className="chat-empty-shell__sectionLabel">입력 준비</span>
              <strong>{resolvedInputPreviewTitle}</strong>
              <p>{resolvedInputPreviewDetail}</p>
              <div className="chat-empty-shell__inputShell">
                <span className="chat-empty-shell__inputPlaceholder">{resolvedInputPreviewPlaceholder}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="chat-empty-shell__rail">
          <section className="chat-empty-shell__section">
            <div className="chat-empty-shell__sectionHeader">
              <span className="chat-empty-shell__sectionLabel">빠른 시작</span>
              <strong>자주 쓰는 작업 흐름</strong>
            </div>
            {quickStartHint ? <p className="chat-empty-shell__sectionHint">{quickStartHint}</p> : null}

            <div className="chat-empty-shell__actions">
              {visiblePromptCards.map((item, index) => (
                <button
                  key={item.title}
                  className="chip chat-empty-chip"
                  disabled={!canPickPrompt}
                  onClick={() => onPickPrompt(item.description)}
                  title={item.description}
                  type="button"
                >
                  <strong>{item.title}</strong>
                  <small>{quickActionHints[index] ?? item.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={`chat-empty-shell__status ${isBlocked ? 'is-warning' : ''}`}>
            <div className="chat-empty-shell__statusCopy">
              <span className="chat-empty-shell__statusLabel">{statusLabel}</span>
              <strong>{statusTitle}</strong>
              <p>{statusDetail}</p>
            </div>
            {onRecoverRoute || onOpenSettings ? (
              <div className="chat-empty-shell__statusActions">
                {onRecoverRoute && recoverRouteLabel ? (
                  <button className="primary-button chat-empty-shell__recoverButton" onClick={onRecoverRoute} type="button">
                    {recoverRouteLabel}
                  </button>
                ) : null}
                {onOpenSettings ? (
                  <button className="ghost-button ghost-button--compact" onClick={onOpenSettings} type="button">
                    {openSettingsLabel}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
