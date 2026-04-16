import { FormField, InputShell, PanelCard, TextareaShell } from '../../components/ui/primitives'
import { useArtemisApp } from '../../state/context'

export function SettingsProfilePane() {
  const { state, updateSettings } = useArtemisApp()

  return (
    <PanelCard
      title="에이전트 프로필"
      description="채팅과 결과 카드에 공통으로 보이는 이름, 말투, 응답 스타일, 추가 지시를 관리합니다."
    >
      <div className="settings-grid">
        <FormField
          className="field--full"
          hint="채팅과 결과 카드에 표시되는 기본 이름입니다."
          label="이름"
        >
          <InputShell
            value={state.settings.agentName}
            onChange={(event) => updateSettings({ agentName: event.target.value })}
          />
        </FormField>
        <FormField label="말투">
          <InputShell
            value={state.settings.tone}
            onChange={(event) => updateSettings({ tone: event.target.value })}
          />
        </FormField>
        <FormField label="응답 스타일">
          <InputShell
            value={state.settings.responseStyle}
            onChange={(event) => updateSettings({ responseStyle: event.target.value })}
          />
        </FormField>
        <FormField
          className="field--full"
          hint="항상 반영해야 하는 공통 지시를 적어 둡니다."
          label="사용자 지시"
        >
          <TextareaShell
            rows={5}
            value={state.settings.customInstructions}
            onChange={(event) => updateSettings({ customInstructions: event.target.value })}
          />
        </FormField>
      </div>
    </PanelCard>
  )
}

export default SettingsProfilePane
