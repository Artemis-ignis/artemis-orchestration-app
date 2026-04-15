import type {
  AiProviderId,
  AiProviderState,
} from '../../lib/aiRoutingClient'
import { DisclosureSection } from '../../crewPageShared'
import { FormField, InputShell, TextareaShell } from '../../components/ui/primitives'
import { Icon } from '../../icons'
import type { ProviderDraft } from './settingsModelsShared'
import {
  OFFICIAL_PROVIDER_ORDER,
  providerAutoSummary,
  providerDescription,
  providerIconName,
  providerInputHint,
  providerRecentCheckedLabel,
  providerRecentStatus,
  providerStatusLabel,
} from './settingsModelsShared'

export function SettingsOfficialProvidersSection({
  providers,
  providerDrafts,
  busyKey,
  onUpdateDraft,
  onSaveProviderConfig,
  onRunProviderTest,
  onRefreshProviderCatalog,
}: {
  providers: AiProviderState[]
  providerDrafts: Record<string, ProviderDraft>
  busyKey: string | null
  onUpdateDraft: (provider: AiProviderId, patch: Partial<ProviderDraft>) => void
  onSaveProviderConfig: (provider: AiProviderId) => Promise<void>
  onRunProviderTest: (provider: AiProviderId) => Promise<void>
  onRefreshProviderCatalog: (provider?: AiProviderId) => Promise<void>
}) {
  return (
    <section className="settings-card">
      <DisclosureSection
        className="settings-disclosure"
        defaultOpen={false}
        summary="공급자 저장, 연결 테스트, 카탈로그 갱신"
        title="공식 API 연결"
      >
        <div className="panel-card__header">
          <p className="settings-card__lead">
            공급자별 키를 저장하고 직접 호출 가능한 모델인지 테스트합니다. 화면에는 최근 상태와
            마지막 확인만 남겨 둡니다.
          </p>
          <button
            className="ghost-button ghost-button--compact"
            disabled={busyKey === 'all:refresh'}
            onClick={() => void onRefreshProviderCatalog()}
            type="button"
          >
            전체 모델 새로고침
          </button>
        </div>

        <div className="provider-grid provider-grid--official">
          {OFFICIAL_PROVIDER_ORDER.map((providerId) => {
            const provider = providers.find((item) => item.provider === providerId)
            const draft = providerDrafts[providerId] ?? {
              enabled: false,
              apiKey: '',
              candidateModelsText: '',
            }

            if (!provider) {
              return null
            }

            return (
              <article key={provider.provider} className="provider-card provider-card--official">
                <div className="provider-card__head">
                  <div className="provider-card__identity">
                    <span className={`provider-card__icon provider-card__icon--${provider.provider}`}>
                      <Icon name={providerIconName(provider.provider)} size={18} />
                    </span>
                    <div>
                      <h3>{provider.label}</h3>
                      <p className="settings-card__lead">{providerDescription(provider.provider)}</p>
                    </div>
                  </div>
                  <span
                    className={`chip ${
                      provider.status === 'ready' || provider.available_count > 0
                        ? 'is-active'
                        : 'chip--soft'
                    }`}
                  >
                    {providerStatusLabel(provider)}
                  </span>
                </div>

                <p className="provider-card__summary">{providerAutoSummary(provider.provider)}</p>

                <label className="settings-toggle">
                  <span>이 공급자 사용</span>
                  <input
                    checked={draft.enabled}
                    onChange={(event) =>
                      onUpdateDraft(provider.provider, { enabled: event.target.checked })
                    }
                    type="checkbox"
                  />
                </label>

                <div className="settings-providerFlags chip-wrap">
                  <span className="chip chip--soft">
                    확인된 모델 {provider.available_count}/{provider.candidate_count}
                  </span>
                  <span className="chip chip--soft">저장된 키 {provider.masked_key || '없음'}</span>
                </div>

                <div className="provider-card__surface">
                  <strong>최근 상태</strong>
                  <span>{providerRecentStatus(provider)}</span>
                </div>
                <p className="settings-inlineMeta">{providerRecentCheckedLabel(provider)}</p>

                <form
                  className="settings-providerForm"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void onSaveProviderConfig(provider.provider)
                  }}
                >
                  <div className="settings-grid">
                    <FormField
                      className="field--full"
                      hint={`${providerInputHint(provider.provider)} 브라우저에는 마스킹된 값만 보입니다.`}
                      label={`${provider.label} API 키`}
                    >
                      <InputShell
                        autoComplete="off"
                        placeholder={
                          provider.masked_key
                            ? '새 키를 입력하면 기존 키를 교체합니다.'
                            : '공식 사이트에서 받은 키를 입력하세요.'
                        }
                        type="password"
                        value={draft.apiKey}
                        onChange={(event) =>
                          onUpdateDraft(provider.provider, { apiKey: event.target.value })
                        }
                      />
                    </FormField>

                    <FormField className="field--full" label="자주 쓰는 모델 ID">
                      <TextareaShell
                        placeholder="자주 쓰는 모델 ID를 줄바꿈으로 입력하거나 비워 두세요."
                        rows={4}
                        value={draft.candidateModelsText}
                        onChange={(event) =>
                          onUpdateDraft(provider.provider, {
                            candidateModelsText: event.target.value,
                          })
                        }
                      />
                    </FormField>
                  </div>

                  <div className="settings-actionRow">
                    <button
                      className="primary-button"
                      disabled={busyKey === `${provider.provider}:save`}
                      type="submit"
                    >
                      저장
                    </button>
                    <button
                      className="ghost-button"
                      disabled={busyKey === `${provider.provider}:test`}
                      onClick={() => void onRunProviderTest(provider.provider)}
                      type="button"
                    >
                      연결 테스트
                    </button>
                    <button
                      className="ghost-button"
                      disabled={busyKey === `${provider.provider}:refresh`}
                      onClick={() => void onRefreshProviderCatalog(provider.provider)}
                      type="button"
                    >
                      이 공급자만 새로고침
                    </button>
                  </div>
                </form>
              </article>
            )
          })}
        </div>
      </DisclosureSection>
    </section>
  )
}
