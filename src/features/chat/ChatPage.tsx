import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageId } from '../../crewData'
import { getAgentPreset } from '../../lib/agentCatalog'
import {
  fetchAiProviders,
  type AiProviderState,
  type AiRoutingAttemptLog,
  type AiRoutingMessageMeta,
  type AiStreamAttemptEvent,
  type AiStreamMetaEvent,
} from '../../lib/aiRoutingClient'
import { formatDate, formatFriendlyModelName, providerLabel } from '../../crewPageHelpers'
import { FormattedText } from '../../components/ui/FormattedText'
import { Icon } from '../../icons'
import { useArtemisApp } from '../../state/context'
import type { AgentItem } from '../../state/types'
import { ChatIdlePanel } from './ChatSections'

type LiveAttemptItem = AiRoutingAttemptLog | AiStreamAttemptEvent

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
                  {[model ? formatFriendlyModelName(model) : '', label || ''].filter(Boolean).join(' · ')}
                </span>
              ) : null}
            </div>
            <span>{formatDate(createdAt)}</span>
          </div>
        ) : null}
        {role === 'master' ? (
          <div className="message-card__meta message-card__meta--master">
            <div className="message-card__badges">
              <strong>{speaker}</strong>
            </div>
            <span>{formatDate(createdAt)}</span>
          </div>
        ) : null}
        <FormattedText className="message-card__content" text={text} />
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
                        {attempt.attempt_index}. {attempt.provider} · {formatFriendlyModelName(attempt.model)}
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
      return '공식 API'
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

function resolveOfficialProviderId(baseUrl: string) {
  const normalized = baseUrl.trim().toLowerCase()
  if (normalized === 'openrouter' || normalized === 'nvidia-build' || normalized === 'gemini') {
    return normalized
  }
  return 'openrouter'
}

function chatAgentChoiceLabel(agent: AgentItem) {
  return formatFriendlyModelName(agent.model)
}

function chatAgentSecondaryLabel(agent: AgentItem) {
  return `${chatAgentRouteLabel(agent)} · ${agent.role}`
}

export function ChatPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
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
  const [aiProviderError, setAiProviderError] = useState<string | null>(null)
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
      setAiProviderError(null)
      return
    }

    const loadAiProviderState = async () => {
      try {
        const providers = await fetchAiProviders(state.settings.bridgeUrl)
        if (!active) {
          return
        }
        setAiProviders(providers)
        setAiProviderError(null)
      } catch (error) {
        if (!active) {
          return
        }
        setAiProviderError(error instanceof Error ? error.message : '공식 API 공급자 정보를 불러오지 못했습니다.')
      }
    }

    void loadAiProviderState()
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
    (activeAgent && activeAgent.capabilities.includes('chat') ? activeAgent : null) ?? chatAgents[0] ?? null

  const selectedProvider = selectedAgent?.provider ?? state.settings.modelProvider
  const selectedModel =
    selectedAgent?.model ??
    (selectedProvider === 'codex' ? state.settings.codexModel : state.settings.ollamaModel)
  const hasStreamFallback = streamAttempts.some(
    (attempt) =>
      ('success' in attempt && !attempt.success) ||
      Boolean(attempt.fallback_reason) ||
      Boolean(attempt.error_type),
  )
  const currentModelName = formatFriendlyModelName(selectedModel || '모델 선택')
  const currentRouteLabel = selectedAgent
    ? chatAgentRouteLabel(selectedAgent)
    : providerLabel(selectedProvider as 'auto' | 'ollama' | 'codex')
  const selectedOfficialProviderId =
    selectedAgent?.provider === 'official-router' ? resolveOfficialProviderId(selectedAgent.baseUrl) : null
  const selectedOfficialProviderStatus =
    selectedOfficialProviderId ? aiProviders.find((item) => item.provider === selectedOfficialProviderId) ?? null : null
  const isEmpty = visibleMessages.length === 0
  const isIdleState = isEmpty && !isGenerating
  const liveMessageCount = visibleMessages.length + (isGenerating && pendingPrompt ? 1 : 0)
  const selectedAgentNeedsKey =
    !!selectedAgent &&
    (selectedAgent.provider === 'openai-compatible' || selectedAgent.provider === 'anthropic') &&
    !selectedAgent.apiKeyId
  const selectedAgentUnavailable =
    selectedAgent?.provider === 'official-router'
      ? !selectedOfficialProviderStatus?.enabled ||
        !selectedOfficialProviderStatus?.configured ||
        !selectedModel?.trim()
      : selectedAgent?.provider === 'ollama'
        ? bridgeHealth?.providers.find((item) => item.provider === 'ollama')?.ready === false
        : selectedAgent?.provider === 'codex'
          ? bridgeHealth?.providers.find((item) => item.provider === 'codex')?.ready === false
          : false
  const compactComposerMode =
    isIdleState && !isGenerating && (selectedAgentNeedsKey || selectedAgentUnavailable)
  const blockedComposerTitle = () =>
    selectedAgentNeedsKey
      ? 'API 연결 필요'
      : selectedAgent?.provider === 'official-router'
        ? '모델 설정 확인 필요'
        : '실행기 연결 필요'
  const blockedComposerDetail = () =>
    selectedAgentNeedsKey
      ? '설정에서 키를 연결하면 바로 시작할 수 있습니다.'
      : selectedAgent?.provider === 'official-router'
        ? '모델 설정만 확인하면 바로 시작할 수 있습니다.'
        : '실행기만 복구하면 바로 시작할 수 있습니다.'
  const canSubmit =
    !isGenerating &&
    !selectedAgentNeedsKey &&
    !selectedAgentUnavailable &&
    composerText.trim().length > 0
  const composerHint = bridgeError
    ? bridgeError
    : selectedAgentNeedsKey
      ? 'API 키 연결 필요'
      : selectedAgent?.provider === 'official-router' && selectedAgentUnavailable
        ? aiProviderError ?? '공식 API 설정 확인'
        : selectedAgentUnavailable
          ? '실행기 준비 안 됨'
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
          selectedProvider === 'codex' || selectedProvider === 'ollama' ? selectedProvider : undefined,
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
      <header className="chat-topbar chat-topbar--minimal chat-topbar--bare">
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
                    <span className="dropdown-menu__title">공식 API</span>
                    {officialChatAgents.map((agent) => {
                      const isSelected = selectedAgent?.id === agent.id
                      const providerStatus = aiProviders.find(
                        (item) => item.provider === resolveOfficialProviderId(agent.baseUrl),
                      )

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
                              {!providerStatus?.enabled || !providerStatus?.configured
                                ? ' / 공급자 설정 필요'
                                : ''}
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
                          ? bridgeHealth?.providers.find((item) => item.provider === 'ollama')?.ready !== false
                          : agent.provider === 'codex'
                            ? bridgeHealth?.providers.find((item) => item.provider === 'codex')?.ready !== false
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

      <div className={`chat-surface ${isIdleState ? 'chat-surface--idle' : 'chat-surface--live'}`}>
        <div className={`chat-surface__body ${isIdleState ? 'chat-surface__body--idle' : ''}`}>
          {isIdleState ? (
            <div className="chat-idle-stage">
              <ChatIdlePanel
                currentModelName={currentModelName}
                currentRouteLabel={currentRouteLabel}
                onPickPrompt={setComposerText}
              />
            </div>
          ) : (
            <div aria-busy={isGenerating} ref={threadViewportRef} className="message-stack chat-thread">
              <div className="chat-thread__intro">
                <span className="chat-thread__status">{isGenerating ? '응답 생성 중' : '대화 진행 중'}</span>
                <div className="chat-thread__summary">
                  <strong>{currentModelName}</strong>
                  <span>
                    {currentRouteLabel} · 메시지 {liveMessageCount}개
                  </span>
                </div>
              </div>
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
                            ? `${streamMeta.top_candidate.provider_label} 쨌 ${streamMeta.top_candidate.display_name}`
                            : `${selectedOfficialProviderStatus?.label ?? '공식 API'} 쨌 ${selectedModel || '모델 확인 중'}`}
                        </span>
                      </div>
                      <span>실시간 스트리밍</span>
                    </div>
                    <p>{streamedText || '응답을 준비하고 있습니다.'}</p>
                    {streamMeta?.top_candidate || hasStreamFallback ? (
                      <div className="message-streamMeta">
                        {streamMeta?.top_candidate ? (
                          <span>
                            현재 후보 쨌 {streamMeta.top_candidate.provider_label} 쨌{' '}
                            {streamMeta.top_candidate.display_name}
                          </span>
                        ) : null}
                        {hasStreamFallback ? <span>재시도 발생</span> : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              ) : isGenerating ? (
                <TypingIndicator label={`${currentModelName} 응답 생성 중`} />
              ) : null}
            </div>
          )}
        </div>

        <form
          className={`composer composer--chat chat-composer chat-composer--embedded ${
            compactComposerMode ? 'chat-composer--blocked' : ''
          }`}
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          {compactComposerMode ? (
            <div className="chat-composer__status">
              <div className="chat-composer__statusCopy">
                <span className="chat-composer__statusLabel">{blockedComposerTitle()}</span>
                <strong>{currentModelName}</strong>
                <p>{blockedComposerDetail()}</p>
              </div>
              <button
                className="ghost-button ghost-button--compact"
                onClick={() => onNavigate('settings')}
                type="button"
              >
                설정 및 연결
              </button>
            </div>
          ) : (
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
          )}
          <div className="composer__footer">
            {compactComposerMode ? null : (
              <div className="composer__actions">
                <>
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
                </>
              </div>
            )}
            <div className="composer__submitRow">
              {compactComposerMode ? null : composerHint ? (
                <span className="composer__hint">{composerHint}</span>
              ) : null}
              {isGenerating && streamAbortController ? (
                <button
                  className="ghost-button ghost-button--compact"
                  onClick={() => streamAbortController.abort()}
                  type="button"
                >
                  중단
                </button>
              ) : null}
              {compactComposerMode ? null : (
                <button
                  aria-label="메시지 전송"
                  className="primary-icon primary-icon--send"
                  disabled={!canSubmit}
                  title="메시지 전송"
                  type="submit"
                >
                  <Icon name="send" size={18} />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}
