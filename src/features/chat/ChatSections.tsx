import { chatPromptCards } from '../../crewData'

export function ChatIdlePanel({
  onPickPrompt,
  currentModelName,
  currentRouteLabel,
}: {
  onPickPrompt: (value: string) => void
  currentModelName: string
  currentRouteLabel: string
}) {
  return (
    <div className="chat-empty-shell">
      <div className="chat-empty-shell__hero">
        <div className="chat-empty-shell__eyebrow">
          <span className="chat-empty-shell__route">{currentRouteLabel}</span>
          <span className="chat-empty-shell__route chat-empty-shell__route--model">{currentModelName}</span>
        </div>

        <div className="chat-empty-shell__headline">
          <h2>무엇을 도와드릴까요?</h2>
          <p>아래에 바로 입력하거나, 자주 쓰는 작업에서 시작하세요.</p>
        </div>

        <div className="chat-empty-shell__actions">
          {chatPromptCards.map((item) => (
            <button
              key={item.title}
              className="chat-empty-chip"
              onClick={() => onPickPrompt(item.description)}
              title={item.description}
              type="button"
            >
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
