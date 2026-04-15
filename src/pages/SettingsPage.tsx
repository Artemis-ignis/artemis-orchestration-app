import { settingsTabs, type PageId, type SettingsTab } from '../crewData'
import { PageIntro } from '../crewPageShared'
import { SettingsModelsPane } from '../features/settings/SettingsModelsPane'
import { SettingsPreferencesPane } from '../features/settings/SettingsPreferencesPane'
import { SettingsProfilePane } from '../features/settings/SettingsProfilePane'
import { useArtemisApp } from '../state/context'

export function SettingsPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { state, updateSettings } = useArtemisApp()

  return (
    <section className="page">
      <PageIntro
        title="설정"
        icon="settings"
        description="자주 보는 상태와 핵심 제어는 먼저 보여주고, 세부 연결과 프롬프트 편집은 필요한 순간에만 펼칠 수 있게 정리했습니다."
      />

      <div className="tab-row">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${state.settings.activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => updateSettings({ activeTab: tab.id as SettingsTab })}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {state.settings.activeTab === 'profile' ? <SettingsProfilePane /> : null}
      {state.settings.activeTab === 'models' ? <SettingsModelsPane onNavigate={onNavigate} /> : null}
      {state.settings.activeTab === 'preferences' ? <SettingsPreferencesPane /> : null}
    </section>
  )
}

export default SettingsPage
