import { FormField, InputShell, PanelCard, StatusPill } from '../../components/ui/primitives'
import { useArtemisApp } from '../../state/context'

export function SettingsPreferencesPane() {
  const { resetAll, state, updateSettings } = useArtemisApp()

  return (
    <div className="stack-grid">
      <PanelCard
        title="화면 테마"
        description="앱 전체 화면에 같은 색 체계를 유지합니다."
      >
        <div className="chip-wrap">
          {(['light', 'dark', 'system'] as const).map((item) => (
            <button
              key={item}
              className={`chip ${state.settings.theme === item ? 'is-active' : 'chip--soft'}`}
              onClick={() => updateSettings({ theme: item })}
              type="button"
            >
              {item === 'light' ? '라이트' : item === 'dark' ? '다크' : '시스템'}
            </button>
          ))}
        </div>
      </PanelCard>

      <PanelCard
        title="실행 환경"
        description="언어, 시간대, 브리지 주소처럼 앱 전체에 적용되는 기준값입니다."
      >
        <div className="settings-grid">
          <FormField label="언어">
            <InputShell
              value={state.settings.language}
              onChange={(event) => updateSettings({ language: event.target.value })}
            />
          </FormField>
          <FormField label="시간대">
            <InputShell
              value={state.settings.timezone}
              onChange={(event) => updateSettings({ timezone: event.target.value })}
            />
          </FormField>
          <FormField
            className="field--full"
            hint="프런트가 연결할 로컬 브리지 주소입니다."
            label="브리지 URL"
          >
            <InputShell
              value={state.settings.bridgeUrl}
              onChange={(event) => updateSettings({ bridgeUrl: event.target.value })}
            />
          </FormField>
        </div>
      </PanelCard>

      <PanelCard
        title="로컬 상태 초기화"
        description="브라우저에 저장된 대화, 선택, 화면 상태만 초기화합니다."
        tone="muted"
      >
        <div className="settings-resetRow">
          <StatusPill tone="warning">로컬 브라우저 상태만 초기화</StatusPill>
          <button className="danger-button" onClick={resetAll} type="button">
            로컬 상태 초기화
          </button>
        </div>
      </PanelCard>
    </div>
  )
}

export default SettingsPreferencesPane
