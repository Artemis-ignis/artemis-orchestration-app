import type {
  AiModelCatalogEntry,
  AiProviderId,
  AiProviderState,
  AiRoutingSettings,
} from '../../lib/aiRoutingClient'
import { DisclosureSection, EmptyState } from '../../crewPageShared'
import { FormField, InputShell, SelectShell } from '../../components/ui/primitives'
import { formatFriendlyModelName } from '../../crewPageHelpers'
import {
  OFFICIAL_PROVIDER_ORDER,
  providerDescription,
  providerRecentCheckedLabel,
  providerRecentStatus,
} from './settingsModelsShared'

export function SettingsOfficialTargetSection({
  providers,
  aiSettings,
  officialProviderDraft,
  officialModelDraft,
  selectedOfficialModelChoices,
  busyKey,
  onOfficialProviderChange,
  onOfficialModelChange,
  onSaveOfficialTarget,
  onRefreshProviderCatalog,
}: {
  providers: AiProviderState[]
  aiSettings: AiRoutingSettings | null
  officialProviderDraft: AiProviderId
  officialModelDraft: string
  selectedOfficialModelChoices: AiModelCatalogEntry[]
  busyKey: string | null
  onOfficialProviderChange: (provider: AiProviderId) => void
  onOfficialModelChange: (modelId: string) => void
  onSaveOfficialTarget: (provider: AiProviderId, modelId: string) => Promise<void>
  onRefreshProviderCatalog: (provider?: AiProviderId) => Promise<void>
}) {
  const selectedOfficialProviderState =
    providers.find((item) => item.provider === officialProviderDraft) ?? null

  return (
    <section className="settings-card">
      <DisclosureSection
        className="settings-disclosure"
        defaultOpen
        summary="채팅과 오케스트레이션이 함께 쓰는 기본 대상"
        title="기본 공식 모델"
      >
        <div className="panel-card__header">
          <p className="settings-card__lead">
            채팅과 오케스트레이션에서 공식 API를 선택하면 여기서 지정한 공급자와 모델을 그대로
            사용합니다.
          </p>
          <span
            className={`chip ${
              selectedOfficialProviderState?.enabled && selectedOfficialProviderState?.configured
                ? 'is-active'
                : 'chip--soft'
            }`}
          >
            {selectedOfficialProviderState?.label ?? '공급자 선택 필요'}
          </span>
        </div>

        <div className="settings-grid">
          <FormField label="공급자">
            <SelectShell
              value={officialProviderDraft}
              onChange={(event) => onOfficialProviderChange(event.target.value as AiProviderId)}
            >
              {OFFICIAL_PROVIDER_ORDER.map((provider) => (
                <option key={provider} value={provider}>
                  {providerDescription(provider)}
                </option>
              ))}
            </SelectShell>
          </FormField>

          <FormField
            className="field--full"
            hint="저장하면 공식 API 에이전트와 오케스트레이션이 이 모델을 기본값으로 사용합니다."
            label="모델 ID"
          >
            <InputShell
              placeholder="예: openai/gpt-4.1-mini"
              value={officialModelDraft}
              onChange={(event) => onOfficialModelChange(event.target.value)}
            />
          </FormField>
        </div>

        <div className="settings-providerFlags chip-wrap">
          <span className={`chip ${selectedOfficialProviderState?.enabled ? 'is-active' : 'chip--soft'}`}>
            공급자 {selectedOfficialProviderState?.enabled ? '활성' : '비활성'}
          </span>
          <span
            className={`chip ${
              selectedOfficialProviderState?.configured ? 'is-active' : 'chip--soft'
            }`}
          >
            키 {selectedOfficialProviderState?.configured ? '연결됨' : '미설정'}
          </span>
          <span className="chip chip--soft">
            현재 기본 {aiSettings?.manual_model ? formatFriendlyModelName(aiSettings.manual_model) : '없음'}
          </span>
        </div>

        <div className="provider-card__surface">
          <strong>최근 상태</strong>
          <span>
            {selectedOfficialProviderState
              ? providerRecentStatus(selectedOfficialProviderState)
              : '공급자 정보를 아직 불러오지 못했습니다.'}
          </span>
        </div>
        <p className="settings-inlineMeta">
          {selectedOfficialProviderState
            ? providerRecentCheckedLabel(selectedOfficialProviderState)
            : '공급자 확인 기록 없음'}
        </p>

        <div className="settings-actionRow">
          <button
            className="primary-button"
            disabled={busyKey === 'official-target'}
            onClick={() => void onSaveOfficialTarget(officialProviderDraft, officialModelDraft)}
            type="button"
          >
            기본 대상 저장
          </button>
          <button
            className="ghost-button"
            disabled={busyKey === `${officialProviderDraft}:refresh`}
            onClick={() => void onRefreshProviderCatalog(officialProviderDraft)}
            type="button"
          >
            선택 공급자 모델 새로고침
          </button>
        </div>

        {selectedOfficialModelChoices.length > 0 ? (
          <div className="settings-apiTargetGrid">
            {selectedOfficialModelChoices.map((candidate) => (
              <button
                key={`${candidate.provider}:${candidate.model_id}`}
                className={`settings-apiTarget ${
                  officialProviderDraft === candidate.provider &&
                  officialModelDraft === candidate.model_id
                    ? 'is-selected'
                    : ''
                }`}
                onClick={() => {
                  onOfficialProviderChange(candidate.provider)
                  onOfficialModelChange(candidate.model_id)
                }}
                type="button"
              >
                <strong>{formatFriendlyModelName(candidate.display_name)}</strong>
                <small>{candidate.model_id}</small>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="바로 고를 모델이 아직 없습니다"
            description="공식 API 카드에서 연결 테스트나 모델 새로고침을 실행하면 빠른 선택 목록이 채워집니다."
          />
        )}
      </DisclosureSection>
    </section>
  )
}
