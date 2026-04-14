import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { chatPromptCards, type PageId } from './crewData'
import { getAgentPreset } from './lib/agentCatalog'
import {
  fetchAiProviders,
  fetchAiSettings,
  previewAiRoute,
  type AiProviderState,
  type AiRoutePreview,
  type AiRoutingAttemptLog,
  type AiRoutingMessageMeta,
  type AiStreamAttemptEvent,
  type AiStreamMetaEvent,
} from './lib/aiRoutingClient'
import { formatDate, formatFriendlyModelName, providerLabel } from './crewPageHelpers'
import { Icon } from './icons'
import { useArtemisApp } from './state/context'
import type { AgentItem } from './state/types'

const DeferredInsightsPage = lazy(async () => {
  const module = await import('./pages/InsightsPage')
  return { default: module.InsightsPage }
})

const DeferredSignalsPage = lazy(async () => {
  const module = await import('./pages/SignalsPage')
  return { default: module.SignalsPage }
})

const DeferredSkillsPage = lazy(async () => {
  const module = await import('./pages/SkillsPage')
  return { default: module.SkillsPage }
})

const DeferredActivityPage = lazy(async () => {
  const module = await import('./pages/ActivityPage')
  return { default: module.ActivityPage }
})

const DeferredSettingsPage = lazy(async () => {
  const module = await import('./pages/SettingsPage')
  return { default: module.SettingsPage }
})

const DeferredGuidePage = lazy(async () => {
  const module = await import('./pages/GuidePage')
  return { default: module.GuidePage }
})

const DeferredFilesPage = lazy(async () => {
  const module = await import('./pages/FilesPage')
  return { default: module.FilesPage }
})

const DeferredOrchestrationPage = lazy(async () => {
  const module = await import('./pages/OrchestrationPage')
  return { default: module.OrchestrationPage }
})

type LiveAttemptItem = AiRoutingAttemptLog | AiStreamAttemptEvent

function DeferredPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <section className="page page-loading">
          <div className="panel-card panel-card--muted page-loading__card">
            <strong>{title} 준비 중</strong>
            <p>필요한 화면 코드와 실제 로컬 상태를 불러오고 있습니다.</p>
          </div>
        </section>
      }
    >
      {children}
    </Suspense>
  )
}

function MessageCard({
  role,
  speaker,
  text,
  createdAt,
  provider,
  model,
  routingMeta,
}: {
  role: 'master' | 'assistant'
  speaker: string
  text: string
  createdAt: string
  provider?: string
  model?: string
  routingMeta?: AiRoutingMessageMeta
}) {
  const [showMeta, setShowMeta] = useState(false)
  const hasRoutingFallback =
    role === 'assistant' &&
    Boolean(
      routingMeta?.attempts.some(
        (attempt) => !attempt.success || Boolean(attempt.fallback_reason) || Boolean(attempt.error_type),
      ),
    )
  const label =
      provider === 'codex'
      ? 'Codex CLI'
      : provider === 'ollama'
        ? 'Ollama'
        : provider === 'openrouter'
          ? 'OpenRouter'
          : provider === 'nvidia-build'
            ? 'NVIDIA Build'
            : provider === 'gemini'
              ? 'Gemini Developer API'
        : provider === 'anthropic'
          ? 'Claude API'
          : model && /^gpt-/i.test(model)
            ? 'OpenAI GPT'
            : model && /^gemini-/i.test(model)
              ? 'Gemini API'
              : model && /^claude-/i.test(model)
                ? 'Claude API'
                : model && /^openrouter\//i.test(model)
                  ? 'OpenRouter'
                  : model && /(coding-glm|minimax)/i.test(model)
                    ? 'AIHubMix'
                    : model && /^nvidia\//i.test(model)
                      ? 'NVIDIA NIM'
          : provider === 'openai-direct'
            ? 'OpenAI GPT'
            : provider === 'gemini-openai'
              ? 'Gemini API'
              : provider === 'claude-anthropic'
                ? 'Claude API'
                : provider === 'openrouter-free'
                  ? 'OpenRouter'
                  : provider === 'aihubmix-free'
                    ? 'AIHubMix'
                    : provider === 'nvidia-trial'
                      ? 'NVIDIA NIM'
            : provider === 'openai-compatible'
              ? 'OpenAI 호환 API'
              : provider

  return (
    <article className={`message-card message-card--${role}`}>
      {role === 'assistant' ? (
        <div className={`message-card__avatar message-card__avatar--${role}`} />
      ) : null}
      <div className="message-card__bubble">
        {role === 'assistant' ? (
          <div className="message-card__meta">
            <div className="message-card__badges">
              <strong>{speaker}</strong>
              {label || model ? (
                <span className="message-card__badge">
                  {[model ? formatFriendlyModelName(model) : '', label || '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              ) : null}
            </div>
            <span>{formatDate(createdAt)}</span>
          </div>
        ) : null}
        <p>{text}</p>
        {role === 'assistant' && routingMeta && hasRoutingFallback ? (
          <div className="message-routeMeta">
            <button
              className="message-routeMeta__toggle"
              onClick={() => setShowMeta((value) => !value)}
              type="button"
            >
              {showMeta ? '시도 로그 숨기기' : '라우팅 로그 보기'}
            </button>
            {showMeta ? (
              <div className="message-routeMeta__panel">
                <div className="message-routeMeta__attempts">
                  {routingMeta.attempts.map((attempt) => (
                    <article
                      key={`${attempt.attempt_index}-${attempt.provider}-${attempt.model}`}
                      className={`message-routeMeta__attempt ${
                        attempt.success ? 'is-success' : 'is-failed'
                      }`}
                    >
                      <strong>
                        {attempt.attempt_index}. {attempt.provider} ·{' '}
                        {formatFriendlyModelName(attempt.model)}
                      </strong>
                      <small>
                        {attempt.success
                          ? `성공 · ${attempt.latency_ms ?? '-'}ms`
                          : `${attempt.error_type ?? 'error'} · ${attempt.fallback_reason ?? '다음 후보로 이동'}`}
                      </small>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {role === 'master' ? (
          <small className="message-card__timestamp">{formatDate(createdAt)}</small>
        ) : null}
      </div>
    </article>
  )
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="typing-row" aria-live="polite">
      <div className="message-card__avatar message-card__avatar--assistant" />
      <div className="typing-indicator">
        <div className="typing-indicator__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="typing-indicator__label">{label}</span>
      </div>
    </div>
  )
}

function chatAgentRouteLabel(agent: AgentItem) {
  switch (agent.preset) {
    case 'codex-cli':
      return 'Codex CLI'
    case 'official-router':
      return '공식 무료 라우터'
    case 'openai-direct':
      return 'OpenAI API'
    case 'gemini-openai':
      return 'Gemini API'
    case 'claude-anthropic':
      return 'Anthropic API'
    case 'ollama-local':
      return 'Ollama'
    default:
      return getAgentPreset(agent.preset).label
  }
}

function chatAgentChoiceLabel(agent: AgentItem) {
  return formatFriendlyModelName(agent.model)
}

function chatAgentSecondaryLabel(agent: AgentItem) {
  return `${chatAgentRouteLabel(agent)} · ${agent.role}`
}

function ChatPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    activeThread,
    activeAgent,
    bridgeError,
    bridgeHealth,
    isGenerating,
    sendPrompt,
    setActiveAgent,
    setComposerText,
    state,
    uploadWorkspaceFiles,
  } = useArtemisApp()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const threadViewportRef = useRef<HTMLDivElement | null>(null)
  const [openModelMenu, setOpenModelMenu] = useState(false)
  const [aiProviders, setAiProviders] = useState<AiProviderState[]>([])
  const [aiRoutePreview, setAiRoutePreview] = useState<AiRoutePreview | null>(null)
  const [aiRouteError, setAiRouteError] = useState<string | null>(null)
  const [streamMeta, setStreamMeta] = useState<AiStreamMetaEvent | null>(null)
  const [streamAttempts, setStreamAttempts] = useState<LiveAttemptItem[]>([])
  const [streamedText, setStreamedText] = useState('')
  const [streamAbortController, setStreamAbortController] = useState<AbortController | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState<{
    prompt: string
    provider: string
    model: string
  } | null>(null)
  const modelMenuId = 'chat-model-menu'

  const composerText = state.chats.composerText
  const visibleMessages = activeThread.messages

  useEffect(() => {
    if (!openModelMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target

      if (!(target instanceof window.Node)) {
        return
      }

      if (menuRef.current && !menuRef.current.contains(target)) {
        setOpenModelMenu(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [openModelMenu])

  useEffect(() => {
    if (!openModelMenu) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenModelMenu(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openModelMenu])

  useEffect(() => {
    let active = true
    const hasOfficialRouter = state.agents.items.some((item) => item.provider === 'official-router')

    if (!hasOfficialRouter) {
      setAiProviders([])
      setAiRoutePreview(null)
      setAiRouteError(null)
      return
    }

    const loadAiRoutingState = async () => {
      try {
        const [providers, settings] = await Promise.all([
          fetchAiProviders(state.settings.bridgeUrl),
          fetchAiSettings(state.settings.bridgeUrl),
        ])
        if (!active) {
          return
        }
        setAiProviders(providers)
        const preview = await previewAiRoute(state.settings.bridgeUrl, {
          routing_mode: settings.routing_mode,
          manual_provider: settings.manual_provider,
          manual_model: settings.manual_model,
        })
        if (!active) {
          return
        }
        setAiRoutePreview(preview)
        setAiRouteError(null)
      } catch (error) {
        if (!active) {
          return
        }
        setAiRouteError(error instanceof Error ? error.message : '무료 후보 정보를 불러오지 못했습니다.')
      }
    }

    void loadAiRoutingState()
    return () => {
      active = false
    }
  }, [state.agents.items, state.settings.bridgeUrl])

  const chatAgents = useMemo(
    () => state.agents.items.filter((item) => item.enabled && item.capabilities.includes('chat')),
    [state.agents.items],
  )
  const localChatAgents = useMemo(
    () => chatAgents.filter((item) => item.provider === 'codex' || item.provider === 'ollama'),
    [chatAgents],
  )
  const officialChatAgents = useMemo(
    () => chatAgents.filter((item) => item.provider === 'official-router'),
    [chatAgents],
  )

  const selectedAgent =
    (activeAgent && activeAgent.capabilities.includes('chat') ? activeAgent : null) ??
    chatAgents[0] ??
    null

  const selectedProvider = selectedAgent?.provider ?? state.settings.modelProvider
  const selectedModel =
    selectedAgent?.model ??
    (selectedProvider === 'codex' ? state.settings.codexModel : state.settings.ollamaModel)
  const topPreviewCandidate = streamMeta?.top_candidate ?? aiRoutePreview?.candidates[0] ?? null
  const hasStreamFallback = streamAttempts.some(
    (attempt) =>
      ('success' in attempt && !attempt.success) ||
      Boolean(attempt.fallback_reason) ||
      Boolean(attempt.error_type),
  )
  const currentModelName =
    selectedAgent?.provider === 'official-router'
      ? topPreviewCandidate?.display_name ?? '자동 무료 최상'
      : formatFriendlyModelName(selectedModel || '모델 선택')
  const currentRouteLabel = selectedAgent
    ? chatAgentRouteLabel(selectedAgent)
    : providerLabel(selectedProvider as 'auto' | 'ollama' | 'codex')
  const selectedAgentSupportsWorkspaceWrite = selectedAgent?.provider === 'codex'
  const readyOfficialProviders = aiProviders.filter(
    (item) => item.enabled && item.configured && (item.status === 'ready' || item.available_count > 0),
  )
  const isEmpty = visibleMessages.length === 0
  const isIdleState = isEmpty && !isGenerating
  const selectedAgentNeedsKey =
    !!selectedAgent &&
    (selectedAgent.provider === 'openai-compatible' || selectedAgent.provider === 'anthropic') &&
    !selectedAgent.apiKeyId
  const selectedAgentUnavailable =
    selectedAgent?.provider === 'official-router'
      ? readyOfficialProviders.length === 0
      : selectedAgent?.provider === 'ollama'
      ? bridgeHealth?.providers.find((item) => item.provider === 'ollama')?.ready === false
      : selectedAgent?.provider === 'codex'
        ? bridgeHealth?.providers.find((item) => item.provider === 'codex')?.ready === false
        : false
  const canSubmit =
    !isGenerating &&
    !selectedAgentNeedsKey &&
    !selectedAgentUnavailable &&
    composerText.trim().length > 0
  const composerHint = selectedAgentNeedsKey
    ? '설정에서 API 키를 연결하세요.'
    : selectedAgent?.provider === 'official-router' && selectedAgentUnavailable
      ? '설정에서 OpenRouter, NVIDIA Build, Gemini 중 하나 이상을 연결하세요.'
    : selectedAgentUnavailable
      ? '선택한 실행기가 아직 준비되지 않았습니다.'
      : isGenerating
        ? '응답 생성 중'
        : ''

  useEffect(() => {
    const viewport = threadViewportRef.current

    if (!viewport) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
  }, [isGenerating, pendingPrompt, visibleMessages])

  const handleSubmit = async () => {
    const nextPrompt = composerText.trim()

    if (!nextPrompt || isGenerating || selectedAgentNeedsKey || selectedAgentUnavailable) {
      return
    }

    const pendingModel = selectedModel || '모델 선택'
    setPendingPrompt({
      prompt: nextPrompt,
      provider: selectedProvider,
      model: pendingModel,
    })
    setStreamMeta(null)
    setStreamAttempts([])
    setStreamedText('')
    setComposerText('')

    try {
      const controller = selectedAgent?.provider === 'official-router' ? new AbortController() : null
      setStreamAbortController(controller)
      await sendPrompt(nextPrompt, {
        agentId: selectedAgent?.id,
        provider:
          selectedProvider === 'codex' || selectedProvider === 'ollama'
            ? selectedProvider
            : undefined,
        model: selectedModel,
        signal: controller?.signal,
        onStreamMeta: (meta) => {
          setStreamMeta(meta)
        },
        onStreamAttempt: (attempt) => {
          setStreamAttempts((items) => {
            const rest = items.filter((item) => item.attempt_index !== attempt.attempt_index)
            return [...rest, attempt].sort((left, right) => left.attempt_index - right.attempt_index)
          })
        },
        onStreamAttemptFailed: (attempt) => {
          setStreamAttempts((items) => {
            const rest = items.filter((item) => item.attempt_index !== attempt.attempt_index)
            return [...rest, attempt].sort((left, right) => left.attempt_index - right.attempt_index)
          })
        },
        onStreamToken: (token) => {
          setStreamedText((value) => value + token)
        },
        onStreamFinal: (payload) => {
          setStreamAttempts(payload.attempts)
        },
      })
    } finally {
      setStreamAbortController(null)
      setPendingPrompt(null)
    }
  }

  return (
    <section className="page page--chat page--chat-modern">
      <header className="chat-topbar">
        <div className="chat-topbar__copy">
          <h1>채팅</h1>
          <p>질문을 남기면 바로 이어서 답합니다.</p>
        </div>
        <div className="chat-topbar__actions">
          <div className="model-menu" ref={menuRef}>
            <button
              aria-controls={modelMenuId}
              aria-expanded={openModelMenu}
              aria-haspopup="menu"
              aria-label="채팅 모델 선택"
              className="ghost-button ghost-button--compact model-menu__trigger"
              onClick={() => setOpenModelMenu((value) => !value)}
              title="채팅 모델 선택"
              type="button"
            >
              <span className="model-menu__summary">
                <strong>{currentModelName}</strong>
                <small>{currentRouteLabel}</small>
              </span>
              <Icon name="chevron-down" size={16} />
            </button>
            {openModelMenu ? (
              <div aria-label="채팅 모델 선택 메뉴" className="dropdown-menu" id={modelMenuId}>
                {officialChatAgents.length > 0 ? (
                  <div className="dropdown-menu__group">
                    <span className="dropdown-menu__title">공식 무료 API 라우터</span>
                    {officialChatAgents.map((agent) => {
                      const isSelected = selectedAgent?.id === agent.id

                      return (
                        <button
                          key={agent.id}
                          className="dropdown-menu__item dropdown-menu__item--stacked"
                          onClick={() => {
                            setActiveAgent(agent.id)
                            setOpenModelMenu(false)
                          }}
                          type="button"
                        >
                          <span>
                            <strong>{chatAgentChoiceLabel(agent)}</strong>
                            <small>
                              {chatAgentSecondaryLabel(agent)}
                              {readyOfficialProviders.length === 0 ? ' / 공급자 설정 필요' : ''}
                            </small>
                          </span>
                          {isSelected ? <Icon name="check" size={16} /> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {localChatAgents.length > 0 ? (
                  <div className="dropdown-menu__group">
                    <span className="dropdown-menu__title">로컬 실행기</span>
                    {localChatAgents.map((agent) => {
                      const isSelected = selectedAgent?.id === agent.id
                      const providerReady =
                        agent.provider === 'ollama'
                          ? bridgeHealth?.providers.find((item) => item.provider === 'ollama')
                              ?.ready !== false
                          : agent.provider === 'codex'
                            ? bridgeHealth?.providers.find((item) => item.provider === 'codex')
                                ?.ready !== false
                            : true

                      return (
                        <button
                          key={agent.id}
                          className="dropdown-menu__item dropdown-menu__item--stacked"
                          disabled={!providerReady}
                          onClick={() => {
                            setActiveAgent(agent.id)
                            setOpenModelMenu(false)
                          }}
                          type="button"
                        >
                          <span>
                            <strong>{chatAgentChoiceLabel(agent)}</strong>
                            <small>
                              {chatAgentSecondaryLabel(agent)}
                              {!providerReady ? ' / 실행기 연결 필요' : ''}
                            </small>
                          </span>
                          {isSelected ? <Icon name="check" size={16} /> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {chatAgents.length === 0 ? (
                  <div className="dropdown-menu__group">
                    <div className="dropdown-menu__empty">설정에 연결된 채팅 에이전트가 없습니다.</div>
                  </div>
                ) : null}

                <div className="dropdown-menu__group">
                  <button
                    className="dropdown-menu__item"
                    onClick={() => {
                      setOpenModelMenu(false)
                      onNavigate('settings')
                    }}
                    type="button"
                  >
                    <span>설정에서 에이전트·API 관리</span>
                    <Icon name="chevron-left" size={16} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {selectedAgentNeedsKey ? (
        <div className="status-banner status-banner--warning">
          <Icon name="warning" size={16} />
          <span>이 모델은 설정에서 API 키를 연결해야 바로 사용할 수 있습니다.</span>
          <button className="ghost-button" onClick={() => onNavigate('settings')} type="button">
            설정 열기
          </button>
        </div>
      ) : null}

      {selectedAgentUnavailable ? (
        <div className="status-banner status-banner--warning">
          <Icon name="warning" size={16} />
          <span>
            {selectedAgent?.provider === 'official-router'
              ? aiRouteError ?? '공식 공급자가 아직 준비되지 않았습니다. 설정에서 연결 테스트를 먼저 확인해 주세요.'
              : '선택한 로컬 실행기가 아직 준비되지 않았습니다. 설정에서 상태를 확인해 주세요.'}
          </span>
          <button className="ghost-button" onClick={() => onNavigate('settings')} type="button">
            상태 확인
          </button>
        </div>
      ) : null}

      {selectedAgent && !selectedAgentSupportsWorkspaceWrite ? (
        <div className="status-banner status-banner--warning">
          <Icon name="warning" size={16} />
          <span>실제 로컬 파일 수정이 목적이면 채팅 모델을 Codex CLI로 선택해 주세요.</span>
        </div>
      ) : null}

      {bridgeError ? (
        <div className="status-banner status-banner--error">
          <Icon name="warning" size={16} />
          <span>{bridgeError}</span>
        </div>
      ) : null}

      <div className="chat-surface">
        <div className={`chat-surface__body ${isIdleState ? 'chat-surface__body--idle' : ''}`}>
          {isIdleState ? (
            <div className="chat-empty-state">
              <h2>바로 시작하세요.</h2>
              <p>작업을 한 문장으로 적으면 바로 이어서 답합니다.</p>
              <div className="chat-empty-state__actions chat-empty-state__actions--compact chip-wrap">
                {chatPromptCards.map((item) => (
                  <button
                    key={item.title}
                    className="chip chat-empty-chip"
                    onClick={() => setComposerText(item.description)}
                    title={item.description}
                    type="button"
                  >
                    <span>{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            aria-busy={isGenerating}
            ref={threadViewportRef}
            className={`message-stack chat-thread ${isEmpty ? 'chat-thread--empty' : ''}`}
          >
            {visibleMessages.map((message) => (
              <MessageCard
                key={message.id}
                createdAt={message.createdAt}
                model={message.model}
                provider={message.provider}
                role={message.role === 'master' ? 'master' : 'assistant'}
                routingMeta={message.routingMeta}
                speaker={message.speaker}
                text={message.text}
              />
            ))}
            {isGenerating && pendingPrompt ? (
              <MessageCard
                createdAt={new Date().toISOString()}
                role="master"
                speaker={state.settings.userName || '마스터'}
                text={pendingPrompt.prompt}
              />
            ) : null}
            {isGenerating && selectedAgent?.provider === 'official-router' ? (
              <article className="message-card message-card--assistant">
                <div className="message-card__avatar message-card__avatar--assistant" />
                <div className="message-card__bubble">
                  <div className="message-card__meta">
                    <div className="message-card__badges">
                      <strong>{state.settings.agentName}</strong>
                      <span className="message-card__badge">
                        {streamMeta?.top_candidate
                          ? `${streamMeta.top_candidate.provider_label} · ${streamMeta.top_candidate.display_name}`
                          : '무료 후보 탐색 중'}
                      </span>
                    </div>
                    <span>실시간 스트리밍</span>
                  </div>
                  <p>{streamedText || '답변을 준비하고 있습니다.'}</p>
                  {streamMeta?.top_candidate || hasStreamFallback ? (
                    <div className="message-streamMeta">
                      {streamMeta?.top_candidate ? (
                        <span>
                          현재 후보 · {streamMeta.top_candidate.provider_label} ·{' '}
                          {streamMeta.top_candidate.display_name}
                        </span>
                      ) : null}
                      {hasStreamFallback ? (
                        <span>후보 전환 발생</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            ) : isGenerating ? (
              <TypingIndicator label={`${currentModelName} 응답 생성 중`} />
            ) : null}
          </div>
        </div>

        <form
          className="composer composer--chat chat-composer chat-composer--embedded"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <textarea
            aria-label="메시지 입력"
            rows={3}
            value={composerText}
            onChange={(event) => setComposerText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (!isGenerating && composerText.trim()) {
                  void handleSubmit()
                }
              }
            }}
            placeholder={
              selectedAgentNeedsKey
                ? '설정에서 API 키를 연결한 뒤 다시 시도하세요.'
                : selectedAgentUnavailable
                  ? '실행기 연결이 복구되면 바로 대화할 수 있습니다.'
                  : 'Artemis에게 메시지를 입력하세요.'
            }
          />
          <div className="composer__footer">
            <div className="composer__actions">
              <input
                hidden
                multiple
                onChange={(event) => {
                  if (event.target.files) {
                    void uploadWorkspaceFiles(event.target.files)
                  }
                  event.target.value = ''
                }}
                ref={fileInputRef}
                type="file"
              />
              <button
                aria-label="파일 업로드"
                className="ghost-button"
                onClick={() => fileInputRef.current?.click()}
                title="파일 업로드"
                type="button"
              >
                <Icon name="paperclip" size={16} />
                파일 업로드
              </button>
            </div>
            <div className="composer__submitRow">
              {composerHint ? <span className="composer__hint">{composerHint}</span> : null}
              {isGenerating && streamAbortController ? (
                <button
                  className="ghost-button ghost-button--compact"
                  onClick={() => streamAbortController.abort()}
                  type="button"
                >
                  중단
                </button>
              ) : null}
              <button
                aria-label="메시지 전송"
                className="primary-icon primary-icon--send"
                disabled={!canSubmit}
                title="메시지 전송"
                type="submit"
              >
                <Icon name="send" size={18} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}

export function CrewPage({
  page,
  onNavigate,
}: {
  page: PageId
  onNavigate: (page: PageId) => void
}) {
  switch (page) {
    case 'chat':
      return <ChatPage onNavigate={onNavigate} />
    case 'files':
      return (
        <DeferredPageShell title="내 파일">
          <DeferredFilesPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'insights':
      return (
        <DeferredPageShell title="인사이트">
          <DeferredInsightsPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'signals':
      return (
        <DeferredPageShell title="시그널">
          <DeferredSignalsPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'tools':
      return (
        <DeferredPageShell title="스킬">
          <DeferredSkillsPage />
        </DeferredPageShell>
      )
    case 'agents':
      return (
        <DeferredPageShell title="오케스트레이션">
          <DeferredOrchestrationPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'activity':
      return (
        <DeferredPageShell title="활동">
          <DeferredActivityPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'settings':
      return (
        <DeferredPageShell title="설정">
          <DeferredSettingsPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'guide':
      return (
        <DeferredPageShell title="가이드">
          <DeferredGuidePage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    default:
      return <ChatPage onNavigate={onNavigate} />
  }
}

