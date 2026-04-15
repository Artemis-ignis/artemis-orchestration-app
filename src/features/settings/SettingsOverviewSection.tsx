import type { PageId } from '../../crewData'
import { NoticeBanner } from '../../crewPageShared'

export function SettingsOverviewSection({
  readyLocalProviders,
  localProviderCount,
  showingCachedLocalState,
  readyOfficialProviders,
  enabledOfficialProviders,
  officialProviderCount,
  currentOfficialTargetLabel,
  currentOfficialTargetDetail,
  aiError,
  bridgeError,
  isRefreshingLocalProviders,
  onNavigate,
  onRefreshLocalProviders,
}: {
  readyLocalProviders: number
  localProviderCount: number
  showingCachedLocalState: boolean
  readyOfficialProviders: number
  enabledOfficialProviders: number
  officialProviderCount: number
  currentOfficialTargetLabel: string
  currentOfficialTargetDetail: string
  aiError: string | null
  bridgeError: string | null
  isRefreshingLocalProviders: boolean
  onNavigate: (page: PageId) => void
  onRefreshLocalProviders: () => void
}) {
  return (
    <section className="settings-card settings-card--compact">
      <div className="panel-card__header">
        <h2>운영 개요</h2>
        <span className="chip is-active">서버 보조 상태</span>
      </div>
      <p className="settings-card__lead">
        자주 보는 상태만 먼저 보여주고, 연결과 세부 편집은 아래 섹션에서 차분하게 정리합니다.
      </p>

      <div className="settings-overviewGrid">
        <article className="settings-overviewCard">
          <span className="settings-overviewCard__label">로컬 실행기</span>
          <strong>
            {readyLocalProviders} / {localProviderCount} 준비
          </strong>
          <p>
            {showingCachedLocalState
              ? '최근 실패가 있어도 마지막 정상 상태를 유지합니다.'
              : 'Ollama와 Codex CLI 상태를 바로 확인하고 있습니다.'}
          </p>
        </article>
        <article className="settings-overviewCard">
          <span className="settings-overviewCard__label">공식 API</span>
          <strong>
            {readyOfficialProviders} / {enabledOfficialProviders || officialProviderCount} 연결
          </strong>
          <p>공급자 저장, 연결 테스트, 모델 갱신을 아래 카드에서 한 번에 처리합니다.</p>
        </article>
        <article className="settings-overviewCard">
          <span className="settings-overviewCard__label">기본 모델</span>
          <strong>{currentOfficialTargetLabel}</strong>
          <p>{currentOfficialTargetDetail}</p>
        </article>
      </div>

      <div className="settings-actionRow">
        <button className="primary-button" onClick={() => onNavigate('chat')} type="button">
          채팅 열기
        </button>
        <button className="ghost-button" onClick={() => onNavigate('agents')} type="button">
          오케스트레이션 보기
        </button>
        <button
          className="ghost-button"
          disabled={isRefreshingLocalProviders}
          onClick={onRefreshLocalProviders}
          type="button"
        >
          {isRefreshingLocalProviders ? '로컬 상태 확인 중' : '로컬 상태 새로고침'}
        </button>
      </div>

      {aiError ? <NoticeBanner tone="danger">{aiError}</NoticeBanner> : null}
      {bridgeError ? (
        <NoticeBanner tone="warning">
          {showingCachedLocalState
            ? `최근 로컬 상태 확인이 실패했습니다. 마지막 정상 상태를 표시 중입니다. ${bridgeError}`
            : bridgeError}
        </NoticeBanner>
      ) : null}
    </section>
  )
}
