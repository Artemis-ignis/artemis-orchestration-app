import type { PageId } from '../../crewData'
import { DisclosureSection, EmptyState, NoticeBanner } from '../../crewPageShared'
import { FormField, InputShell, TextareaShell } from '../../components/ui/primitives'
import { getAgentPreset } from '../../lib/agentCatalog'
import type { AiRoutingSettings } from '../../lib/aiRoutingClient'
import type { AgentItem } from '../../state/types'
import { capabilityLabel, MANAGED_AGENT_PRESETS, providerDescription } from './settingsModelsShared'

export function SettingsManagedAgentsSection({
  managedAgents,
  activeManagedAgent,
  aiSettings,
  onNavigate,
  onCreateAgent,
  onDeleteAgent,
  onSetActiveAgent,
  onUpdateAgent,
}: {
  managedAgents: AgentItem[]
  activeManagedAgent: AgentItem | null
  aiSettings: AiRoutingSettings | null
  onNavigate: (page: PageId) => void
  onCreateAgent: (presetId?: AgentItem['preset']) => void
  onDeleteAgent: (agentId: string) => void
  onSetActiveAgent: (agentId: string) => void
  onUpdateAgent: (agentId: string, patch: Partial<AgentItem>) => void
}) {
  return (
    <section className="settings-card settings-card--split">
      <DisclosureSection
        className="settings-disclosure"
        defaultOpen={false}
        summary="채팅과 오케스트레이션에서 실제로 호출되는 에이전트 구성"
        title="채팅 에이전트"
      >
        <div className="settings-card__side">
          <div className="panel-card__header">
            <h2>에이전트 추가</h2>
            <span className="chip chip--soft">{managedAgents.length}개</span>
          </div>

          <div className="settings-agentCreateGrid">
            {MANAGED_AGENT_PRESETS.map((presetId) => {
              const preset = getAgentPreset(presetId)
              const exists = managedAgents.some((agent) => agent.preset === presetId)

              return (
                <button
                  key={presetId}
                  className={`settings-presetOption ${exists ? 'is-selected' : ''}`}
                  disabled={exists}
                  onClick={() => onCreateAgent(presetId)}
                  type="button"
                >
                  <span className="settings-presetOption__copy">
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </span>
                  <span className="chip chip--soft">{exists ? '추가됨' : '추가'}</span>
                </button>
              )
            })}
          </div>

          <div className="entity-list">
            {managedAgents.map((agent) => (
              <button
                key={agent.id}
                className={`agent-list-item ${activeManagedAgent?.id === agent.id ? 'is-selected' : ''}`}
                onClick={() => onSetActiveAgent(agent.id)}
                type="button"
              >
                <div className="agent-list-item__copy">
                  <strong>{agent.name}</strong>
                  <small>{getAgentPreset(agent.preset).label}</small>
                  <small>{agent.model}</small>
                </div>
                <span className={`chip chip--status chip--${agent.status}`}>{agent.status}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-card__main">
          {activeManagedAgent ? (
            <>
              <div className="panel-card__header">
                <h2>선택한 에이전트</h2>
                <div className="settings-actionRow">
                  <button className="ghost-button" onClick={() => onNavigate('chat')} type="button">
                    채팅 열기
                  </button>
                  <button className="ghost-button" onClick={() => onNavigate('agents')} type="button">
                    오케스트레이션 보기
                  </button>
                  <button
                    className="danger-button"
                    disabled={managedAgents.length <= 1}
                    onClick={() => onDeleteAgent(activeManagedAgent.id)}
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              </div>

              {activeManagedAgent.provider === 'official-router' ? (
                <NoticeBanner tone="info">
                  공식 API 에이전트는 위에서 저장한 공급자와 모델을 그대로 사용합니다.
                  {aiSettings?.manual_provider && aiSettings.manual_model
                    ? ` 현재 대상은 ${providerDescription(aiSettings.manual_provider)} / ${aiSettings.manual_model} 입니다.`
                    : ''}
                </NoticeBanner>
              ) : null}

              <div className="settings-grid">
                <FormField label="이름">
                  <InputShell
                    value={activeManagedAgent.name}
                    onChange={(event) =>
                      onUpdateAgent(activeManagedAgent.id, { name: event.target.value })
                    }
                  />
                </FormField>

                <FormField label="역할">
                  <InputShell
                    value={activeManagedAgent.role}
                    onChange={(event) =>
                      onUpdateAgent(activeManagedAgent.id, { role: event.target.value })
                    }
                  />
                </FormField>

                <FormField className="field--full" label="설명">
                  <InputShell
                    value={activeManagedAgent.description}
                    onChange={(event) =>
                      onUpdateAgent(activeManagedAgent.id, { description: event.target.value })
                    }
                  />
                </FormField>

                <FormField label="프리셋">
                  <InputShell readOnly value={getAgentPreset(activeManagedAgent.preset).label} />
                </FormField>

                <FormField label="모델">
                  <InputShell
                    readOnly={activeManagedAgent.provider === 'official-router'}
                    value={activeManagedAgent.model}
                    onChange={(event) =>
                      onUpdateAgent(activeManagedAgent.id, { model: event.target.value })
                    }
                  />
                </FormField>

                <FormField className="field--full" label="기능">
                  <div className="chip-wrap">
                    {activeManagedAgent.capabilities.map((capability) => (
                      <span key={capability} className="chip chip--soft">
                        {capabilityLabel(capability)}
                      </span>
                    ))}
                  </div>
                </FormField>

                <FormField className="field--full" label="시스템 프롬프트">
                  <TextareaShell
                    rows={5}
                    value={activeManagedAgent.systemPrompt}
                    onChange={(event) =>
                      onUpdateAgent(activeManagedAgent.id, { systemPrompt: event.target.value })
                    }
                  />
                </FormField>
              </div>
            </>
          ) : (
            <EmptyState
              title="선택한 에이전트가 없습니다"
              description="왼쪽 목록에서 채팅 에이전트를 고르면 이름, 역할, 프롬프트를 바로 편집할 수 있습니다."
            />
          )}
        </div>
      </DisclosureSection>
    </section>
  )
}
