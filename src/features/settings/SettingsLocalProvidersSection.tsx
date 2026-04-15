import { DisclosureSection } from '../../crewPageShared'
import { formatFriendlyModelName } from '../../crewPageHelpers'
import { Icon } from '../../icons'
import type { LocalProviderCard } from './settingsModelsShared'
import {
  formatLocalProviderTime,
  getCurrentLocalModelName,
  localProviderIconName,
  localProviderLabel,
  localProviderStatusLabel,
  localProviderSummary,
} from './settingsModelsShared'

export function SettingsLocalProvidersSection({
  localProviders,
  bridgeError,
  isRefreshingLocalProviders,
  onRefreshLocalProviders,
}: {
  localProviders: LocalProviderCard[]
  bridgeError: string | null
  isRefreshingLocalProviders: boolean
  onRefreshLocalProviders: () => void
}) {
  return (
    <section className="settings-card">
      <DisclosureSection
        className="settings-disclosure"
        defaultOpen
        summary="Ollama와 Codex의 준비 상태, 모델 수, 마지막 확인 시각"
        title="로컬 실행기 상태"
      >
        <div className="provider-grid provider-grid--local">
          {localProviders.map((provider) => {
            const effectiveWarning =
              provider.warning ?? (bridgeError ? '최근 상태 확인이 실패했습니다.' : null)
            const effectiveLastError = provider.lastError ?? bridgeError
            const statusMessage = effectiveWarning
              ? effectiveLastError
                ? `${effectiveWarning} (${effectiveLastError})`
                : effectiveWarning
              : effectiveLastError ?? '최근 경고 없음'
            const lastCheckedLabel = provider.lastSuccessAt
              ? `마지막 정상 확인 ${formatLocalProviderTime(provider.lastSuccessAt)}`
              : provider.lastCheckedAt
                ? `마지막 확인 ${formatLocalProviderTime(provider.lastCheckedAt)}`
                : '확인 기록 없음'

            return (
              <article key={provider.provider} className="provider-card provider-card--local">
                <div className="provider-card__head">
                  <div className="provider-card__identity">
                    <span className={`provider-card__icon provider-card__icon--${provider.provider}`}>
                      <Icon name={localProviderIconName(provider.provider)} size={16} />
                    </span>
                    <div>
                      <h3>{localProviderLabel(provider.provider)}</h3>
                      <p className="settings-card__lead">{localProviderSummary(provider)}</p>
                    </div>
                  </div>
                  <span
                    className={`chip ${provider.ready && !provider.stale ? 'is-active' : 'chip--soft'}`}
                  >
                    {localProviderStatusLabel(provider)}
                  </span>
                </div>

                <div className="settings-providerFlags chip-wrap">
                  <span className={`chip ${provider.ready ? 'is-active' : 'chip--soft'}`}>
                    {provider.ready ? '사용 가능' : '확인 필요'}
                  </span>
                  <span className="chip chip--soft">{provider.models.length}개 모델</span>
                </div>

                <p className="provider-card__summary">{provider.detail}</p>

                <div className="provider-card__surfaceGrid">
                  <div className="provider-card__surface">
                    <strong>준비 상태</strong>
                    <span>{localProviderStatusLabel(provider)}</span>
                  </div>
                  <div className="provider-card__surface">
                    <strong>현재 모델 수</strong>
                    <span>{provider.models.length}개</span>
                  </div>
                  <div className="provider-card__surface">
                    <strong>현재 모델명</strong>
                    <span>{formatFriendlyModelName(getCurrentLocalModelName(provider))}</span>
                  </div>
                  <div className="provider-card__surface">
                    <strong>마지막 오류 또는 경고</strong>
                    <span>{statusMessage}</span>
                  </div>
                </div>

                <p className="settings-inlineMeta">{lastCheckedLabel}</p>

                <div className="settings-actionRow">
                  <button
                    className="ghost-button ghost-button--compact"
                    disabled={isRefreshingLocalProviders}
                    onClick={onRefreshLocalProviders}
                    type="button"
                  >
                    {isRefreshingLocalProviders ? '상태 확인 중' : '로컬 상태 새로고침'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </DisclosureSection>
    </section>
  )
}
