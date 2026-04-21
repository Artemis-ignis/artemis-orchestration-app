import { chatPromptCards } from '../../crewData'

const quickActionHints = [
  '오늘 흐름 빠르게 정리',
  '구조와 수정 포인트 점검',
  '다음 실행 단계 바로 제안',
]

export function ChatIdlePanel({
  onPickPrompt,
  currentModelName,
  currentRouteLabel,
}: {
  onPickPrompt: (value: string) => void
  currentModelName: string
  currentRouteLabel: string
}) {
  const visiblePromptCards = chatPromptCards.slice(0, 3)

  return (
    <div className="chat-empty-shell">
      <div className="chat-empty-shell__hero">
        <div className="chat-empty-shell__eyebrow">
          <span className="chat-empty-shell__route">{currentRouteLabel}</span>
          <span className="chat-empty-shell__route">{currentModelName}</span>
        </div>

        <div className="chat-empty-shell__headline">
          <h2>바로 질문하고 바로 진행합니다.</h2>
          <p>{currentModelName} 기준으로 대화, 코드 수정, 파일 검토를 한 흐름에서 이어갑니다.</p>
        </div>

        <div className="chat-empty-shell__actions">
          {visiblePromptCards.map((item, index) => (
            <button
              key={item.title}
              className="chip chat-empty-chip"
              onClick={() => onPickPrompt(item.description)}
              title={item.description}
              type="button"
            >
              <strong>{item.title}</strong>
              <small>{quickActionHints[index] ?? item.description}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
