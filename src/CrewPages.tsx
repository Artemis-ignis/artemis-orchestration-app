import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import {
  chatPromptCards,
  settingsTabs,
  signalCategories,
  type PageId,
  type SettingsTab,
} from './crewData'
import {
  AGENT_PRESETS,
  getAgentPreset,
  getAgentProviderLabel,
} from './lib/agentCatalog'
import { fetchSignalsFeed, type SignalFeedItem } from './lib/modelClient'
import { Icon } from './icons'
import { useArtemisApp } from './state/context'
import type { AgentItem, InsightStatus, ToolItem } from './state/types'

function formatDate(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelative(value: string) {
  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000),
  )

  if (diffMinutes < 1) return '방금 전'
  if (diffMinutes < 60) return `${diffMinutes}분 전`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}시간 전`

  return `${Math.round(diffHours / 24)}일 전`
}

function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function pageLabel(value: string) {
  switch (value) {
    case 'chat':
      return '채팅'
    case 'files':
      return '내 파일'
    case 'signals':
      return '시그널'
    case 'tools':
      return '스킬'
    case 'settings':
      return '설정'
    case 'agents':
      return '오케스트레이션'
    case 'activity':
      return '활동'
    case 'insights':
      return '인사이트'
    default:
      return value
  }
}

function sourceLabel(value: ToolItem['source']) {
  switch (value) {
    case 'local-skill':
      return '로컬 스킬'
    case 'plugin-skill':
      return '플러그인 스킬'
    default:
      return value
  }
}

function providerLabel(value: 'auto' | 'ollama' | 'codex') {
  if (value === 'ollama') return 'Ollama'
  if (value === 'codex') return 'Codex CLI'
  return '자동'
}

function signalSourceLabel(value: string) {
  switch (value.toLowerCase()) {
    case 'github':
      return 'GitHub'
    case 'hacker news':
      return '해커 뉴스'
    case 'arxiv':
      return 'arXiv'
    default:
      return value
  }
}

function PageIntro({
  title,
  description,
  icon,
  trailing,
}: {
  title: string
  description: string
  icon?: 'insights' | 'settings' | 'agent' | 'signals' | 'tools' | 'files'
  trailing?: ReactNode
}) {
  return (
    <div className="page-intro">
      <div className="page-intro__main">
        {icon ? (
          <span className="page-intro__icon">
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {trailing ? <div className="page-intro__trailing">{trailing}</div> : null}
    </div>
  )
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="search-field">
      <Icon name="search" size={16} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      aria-pressed={on}
      className={`toggle ${on ? 'is-on' : ''}`}
      onClick={onToggle}
      type="button"
    />
  )
}

function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string
  description: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="empty-state">
      <div aria-hidden="true" className="empty-state__mark" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? (
        <button className="primary-button" onClick={onAction} type="button">
          {action}
        </button>
      ) : null}
    </div>
  )
}

function MessageCard({
  role,
  speaker,
  text,
  createdAt,
  provider,
  model,
}: {
  role: 'master' | 'assistant'
  speaker: string
  text: string
  createdAt: string
  provider?: string
  model?: string
}) {
  const label =
    provider === 'codex'
      ? 'Codex CLI'
      : provider === 'ollama'
        ? 'Ollama'
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

function formatFriendlyModelName(model: string) {
  const normalized = model.trim()

  if (!normalized) {
    return '모델 선택'
  }

  if (/^gpt-/i.test(normalized)) {
    return normalized
      .replace(/^gpt-/i, 'GPT-')
      .replace(/-mini$/i, ' Mini')
      .replace(/-nano$/i, ' Nano')
  }

  if (/^gemini-/i.test(normalized)) {
    return normalized
      .replace(/^gemini-/i, 'Gemini ')
      .replace(/-/g, ' ')
      .replace(/\bflash\b/i, 'Flash')
      .replace(/\bpro\b/i, 'Pro')
  }

  if (/claude-sonnet-4/i.test(normalized)) {
    return 'Claude Sonnet 4'
  }

  if (/claude-opus-4/i.test(normalized)) {
    return 'Claude Opus 4'
  }

  return normalized
}

function chatAgentRouteLabel(agent: AgentItem) {
  switch (agent.preset) {
    case 'codex-cli':
      return 'Codex CLI'
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

type FlowNodeData = {
  title: string
  subtitle: string
  tone: 'trigger' | 'agent' | 'model' | 'skill' | 'output' | 'router' | 'memory'
  badge?: string
  page?: PageId
  agentId?: string
}

function FlowCardNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`flow-card flow-card--${data.tone}`}>
      <Handle position={Position.Left} type="target" />
      <div className="flow-card__header">
        <strong>{data.title}</strong>
        {data.badge ? <span>{data.badge}</span> : null}
      </div>
      <p>{data.subtitle}</p>
      <Handle position={Position.Right} type="source" />
    </div>
  )
}

const orchestrationNodeTypes = {
  orchestration: FlowCardNode,
}

function ChatPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    activeThread,
    activeAgent,
    bridgeError,
    bridgeHealth,
    createThread,
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
  const [pendingPrompt, setPendingPrompt] = useState<{
    prompt: string
    provider: string
    model: string
  } | null>(null)

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

  const chatAgents = useMemo(
    () => state.agents.items.filter((item) => item.enabled && item.capabilities.includes('chat')),
    [state.agents.items],
  )
  const localChatAgents = useMemo(
    () => chatAgents.filter((item) => item.provider === 'codex' || item.provider === 'ollama'),
    [chatAgents],
  )
  const officialChatAgents = useMemo(
    () =>
      chatAgents.filter(
        (item) => item.provider === 'openai-compatible' || item.provider === 'anthropic',
      ),
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
  const currentModelName = formatFriendlyModelName(selectedModel || '모델 선택')
  const currentRouteLabel = selectedAgent
    ? chatAgentRouteLabel(selectedAgent)
    : providerLabel(selectedProvider as 'auto' | 'ollama' | 'codex')
  const isEmpty = visibleMessages.length === 0
  const isIdleState = isEmpty && !isGenerating
  const selectedAgentNeedsKey =
    !!selectedAgent &&
    (selectedAgent.provider === 'openai-compatible' || selectedAgent.provider === 'anthropic') &&
    !selectedAgent.apiKeyId
  const selectedAgentUnavailable =
    selectedAgent?.provider === 'ollama'
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
    setComposerText('')

    try {
      await sendPrompt(nextPrompt, {
        agentId: selectedAgent?.id,
        provider:
          selectedProvider === 'codex' || selectedProvider === 'ollama'
            ? selectedProvider
            : undefined,
        model: selectedModel,
      })
    } finally {
      setPendingPrompt(null)
    }
  }

  return (
    <section className="page page--chat page--chat-modern">
      <header className="chat-topbar">
        <div className="chat-topbar__copy">
          <h1>{activeThread.title === '새 채팅' ? '채팅' : activeThread.title}</h1>
        </div>
        <div className="chat-topbar__actions">
          <div className="model-menu" ref={menuRef}>
            <button
              className="ghost-button ghost-button--compact model-menu__trigger"
              onClick={() => setOpenModelMenu((value) => !value)}
              type="button"
            >
              <span className="model-menu__summary">
                <strong>{currentModelName}</strong>
                <small>{currentRouteLabel}</small>
              </span>
              <Icon name="chevron-down" size={16} />
            </button>
            {openModelMenu ? (
              <div className="dropdown-menu">
                {officialChatAgents.length > 0 ? (
                  <div className="dropdown-menu__group">
                    <span className="dropdown-menu__title">OpenAI · Gemini · Claude</span>
                    {officialChatAgents.map((agent) => {
                      const isSelected = selectedAgent?.id === agent.id
                      const needsKey =
                        (agent.provider === 'openai-compatible' ||
                          agent.provider === 'anthropic') &&
                        !agent.apiKeyId

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
                              {needsKey ? ' / API 키 필요' : ''}
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

          <button
            className="ghost-button"
            onClick={() => {
              createThread()
              setOpenModelMenu(false)
            }}
            type="button"
          >
            새 채팅
          </button>
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
          <span>선택한 로컬 실행기가 아직 준비되지 않았습니다. 설정에서 상태를 확인해 주세요.</span>
          <button className="ghost-button" onClick={() => onNavigate('settings')} type="button">
            상태 확인
          </button>
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
              <h2>무엇을 도와드릴까요?</h2>
              <p>예시를 누르거나 바로 메시지를 보내세요.</p>
              <div className="chat-empty-state__actions chat-empty-state__actions--compact chip-wrap">
                {chatPromptCards.map((item) => (
                  <button
                    key={item.title}
                    className="chip chat-empty-chip"
                    onClick={() => setComposerText(item.description)}
                    type="button"
                  >
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
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
            {isGenerating ? (
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
                className="ghost-button"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Icon name="paperclip" size={16} />
                파일 업로드
              </button>
            </div>
            <div className="composer__submitRow">
              {composerHint ? <span className="composer__hint">{composerHint}</span> : null}
              <button className="primary-icon primary-icon--send" disabled={!canSubmit} type="submit">
                <Icon name="send" size={18} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}

function FilesPage() {
  const {
    connectWorkspace,
    createWorkspaceFolder,
    deleteWorkspaceEntry,
    openWorkspaceFolder,
    readWorkspaceFile,
    refreshWorkspace,
    revealWorkspacePath,
    saveWorkspaceFile,
    uploadWorkspaceFiles,
    workspaceAbsolutePath,
    workspaceCurrentPath,
    workspaceEntries,
    workspaceError,
    workspaceLoading,
    workspaceParentPath,
    workspaceRootPath,
    workspaceSummary,
  } = useArtemisApp()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [folderName, setFolderName] = useState('')
  const [rootInput, setRootInput] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedFileContent, setSelectedFileContent] = useState('')
  const [selectedFileOriginalContent, setSelectedFileOriginalContent] = useState('')
  const [selectedFileMeta, setSelectedFileMeta] = useState<{
    path: string
    name: string
    mimeType: string
    size: number
    updatedAt: string
    editable: boolean
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewSaving, setPreviewSaving] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    setRootInput(workspaceRootPath)
  }, [workspaceRootPath])

  useEffect(() => {
    if (!selectedPath) {
      return
    }

    if (workspaceEntries.some((item) => item.relativePath === selectedPath)) {
      return
    }

    setSelectedPath(null)
    setSelectedFileMeta(null)
    setSelectedFileContent('')
    setSelectedFileOriginalContent('')
    setPreviewError(null)
  }, [selectedPath, workspaceEntries])

  const visibleItems = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()

    return [...workspaceEntries]
      .filter((item) => {
        if (!keyword) return true
        return (
          item.name.toLowerCase().includes(keyword) ||
          item.relativePath.toLowerCase().includes(keyword) ||
          item.mimeType.toLowerCase().includes(keyword)
        )
      })
      .sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === 'folder' ? -1 : 1
        }

        return left.name.localeCompare(right.name, 'ko-KR', {
          numeric: true,
          sensitivity: 'base',
        })
      })
  }, [deferredQuery, workspaceEntries])

  const selectedEntry = selectedPath
    ? workspaceEntries.find((item) => item.relativePath === selectedPath) ?? null
    : null

  const handleOpenFile = useCallback(
    async (relativePath: string) => {
      setSelectedPath(relativePath)
      setPreviewError(null)
      setPreviewLoading(true)

      try {
        const file = await readWorkspaceFile(relativePath)
        setSelectedFileMeta({
          path: file.relativePath,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          updatedAt: file.updatedAt,
          editable: file.editable,
        })
        setSelectedFileContent(file.content)
        setSelectedFileOriginalContent(file.content)
      } catch (error) {
        setSelectedFileMeta(null)
        setSelectedFileContent('')
        setSelectedFileOriginalContent('')
        setPreviewError(error instanceof Error ? error.message : '파일을 열지 못했습니다.')
      } finally {
        setPreviewLoading(false)
      }
    },
    [readWorkspaceFile],
  )

  const handleOpenEntry = useCallback(
    async (relativePath: string, kind: 'file' | 'folder') => {
      if (kind === 'folder') {
        setSelectedPath(null)
        setSelectedFileMeta(null)
        setSelectedFileContent('')
        setSelectedFileOriginalContent('')
        setPreviewError(null)
        await openWorkspaceFolder(relativePath)
        return
      }

      await handleOpenFile(relativePath)
    },
    [handleOpenFile, openWorkspaceFolder],
  )

  const currentFolderLabel = workspaceCurrentPath || '루트'
  const currentFolderPath = workspaceAbsolutePath || workspaceRootPath
  const hasFileSelection = Boolean(selectedFileMeta && selectedEntry?.kind === 'file')
  const isFileDirty =
    Boolean(selectedFileMeta?.editable) &&
    selectedFileMeta != null &&
    selectedFileContent !== selectedFileOriginalContent

  return (
    <section className="page">
      <PageIntro
        description="실제 로컬 작업 폴더를 탐색하고, 파일을 열어 수정하고, 업로드와 폴더 생성을 바로 처리합니다."
        icon="files"
        title="내 파일"
      />

      <div className="panel-card files-shell__summary">
        <div className="files-shell__summaryHead">
          <div>
            <strong>현재 작업 폴더</strong>
            <p>{currentFolderPath || '작업 폴더를 아직 불러오지 못했습니다.'}</p>
          </div>
          <div className="badge-row">
            <span className="chip chip--soft">폴더 {workspaceSummary.folderCount}개</span>
            <span className="chip chip--soft">파일 {workspaceSummary.fileCount}개</span>
            <span className="chip chip--soft">{bytesLabel(workspaceSummary.totalBytes)}</span>
          </div>
        </div>
        <div className="files-shell__summaryActions">
          <button className="ghost-button" onClick={() => void refreshWorkspace()} type="button">
            새로고침
          </button>
          {workspaceParentPath !== null ? (
            <button
              className="ghost-button"
              onClick={() => void openWorkspaceFolder(workspaceParentPath)}
              type="button"
            >
              상위 폴더
            </button>
          ) : null}
          <button className="ghost-button" onClick={() => void revealWorkspacePath()} type="button">
            탐색기에서 열기
          </button>
        </div>
      </div>

      {workspaceError ? (
        <div className="status-banner status-banner--error">
          <Icon name="warning" size={16} />
          <span>{workspaceError}</span>
        </div>
      ) : null}

      <form
        className="files-connect"
        onSubmit={(event) => {
          event.preventDefault()
          if (!rootInput.trim()) {
            return
          }
          void connectWorkspace(rootInput.trim())
        }}
      >
        <label className="inline-input files-connect__input">
          <input
            onChange={(event) => setRootInput(event.target.value)}
            placeholder="작업 루트 경로를 입력하세요. 예: C:\\Projects\\Artemis"
            value={rootInput}
          />
        </label>
        <button className="outline-button" disabled={!rootInput.trim()} type="submit">
          경로 연결
        </button>
      </form>

      <div className="files-toolbar">
        <SearchField onChange={setQuery} placeholder="현재 폴더 검색..." value={query} />
        <div className="files-toolbar__actions">
          <label className="inline-input">
            <input
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="새 폴더 이름"
              value={folderName}
            />
          </label>

          <button
            className="outline-button"
            disabled={!folderName.trim()}
            onClick={async () => {
              await createWorkspaceFolder(folderName)
              setFolderName('')
            }}
            type="button"
          >
            새 폴더
          </button>

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
          <button className="primary-button" onClick={() => fileInputRef.current?.click()} type="button">
            업로드
          </button>
        </div>
      </div>

      <div className="chip-wrap">
        <span className="chip is-active">{currentFolderLabel}</span>
        {workspaceLoading ? <span className="chip chip--soft">불러오는 중</span> : null}
      </div>

      <div className="files-layout">
        <div className="panel-card">
          {visibleItems.length > 0 ? (
            <div className="entity-list">
              {visibleItems.map((item) => (
                <div
                  key={item.relativePath}
                  className={`file-row ${selectedPath === item.relativePath ? 'is-selected' : ''}`}
                >
                  <button
                    className="file-row__open"
                    onClick={() => void handleOpenEntry(item.relativePath, item.kind)}
                    type="button"
                  >
                    <span className="file-row__icon">
                      <Icon name={item.kind === 'folder' ? 'folder' : 'files'} size={16} />
                    </span>
                    <div className="file-row__main">
                      <strong>{item.name}</strong>
                      <small>
                        {item.kind === 'folder'
                          ? `폴더 · ${formatRelative(item.updatedAt)}`
                          : `${item.mimeType} · ${bytesLabel(item.size)} · ${formatRelative(item.updatedAt)}`}
                      </small>
                    </div>
                  </button>
                  <div className="file-row__actions">
                    {item.kind === 'file' ? (
                      <button
                        className="ghost-button"
                        onClick={() => void handleOpenFile(item.relativePath)}
                        type="button"
                      >
                        열기
                      </button>
                    ) : (
                      <button
                        className="ghost-button"
                        onClick={() => void openWorkspaceFolder(item.relativePath)}
                        type="button"
                      >
                        열기
                      </button>
                    )}
                    <button
                      className="ghost-button"
                      onClick={async () => {
                        if (!window.confirm(`${item.name}을(를) 삭제하시겠습니까?`)) {
                          return
                        }
                        await deleteWorkspaceEntry(item.relativePath)
                        if (selectedPath === item.relativePath) {
                          setSelectedPath(null)
                          setSelectedFileMeta(null)
                          setSelectedFileContent('')
                          setSelectedFileOriginalContent('')
                          setPreviewError(null)
                        }
                      }}
                      type="button"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              action="업로드"
              description="현재 폴더에 아직 파일이 없습니다. 로컬 파일을 올리거나 새 폴더를 만들어 주세요."
              onAction={() => fileInputRef.current?.click()}
              title="비어 있는 작업 폴더"
            />
          )}
        </div>

        <div className="panel-card preview-card">
          {previewError ? (
            <div className="status-banner status-banner--error">
              <Icon name="warning" size={16} />
              <span>{previewError}</span>
            </div>
          ) : null}

          {previewLoading ? (
            <EmptyState
              description="선택한 파일 내용을 불러오는 중입니다."
              title="파일 미리보기 준비 중"
            />
          ) : hasFileSelection && selectedFileMeta ? (
            <>
              <div className="preview-card__header">
                <div>
                  <strong>{selectedFileMeta.name}</strong>
                  <small>
                    {selectedFileMeta.mimeType} · {bytesLabel(selectedFileMeta.size)} ·{' '}
                    {formatRelative(selectedFileMeta.updatedAt)}
                  </small>
                </div>
                <div className="badge-row">
                  <span className="chip chip--soft">
                    {selectedFileMeta.editable ? '텍스트 편집 가능' : '미리보기 전용'}
                  </span>
                  <button
                    className="ghost-button"
                    onClick={() => void revealWorkspacePath(selectedFileMeta.path)}
                    type="button"
                  >
                    위치 열기
                  </button>
                  <button
                    className="ghost-button"
                    onClick={async () => {
                      if (!window.confirm(`${selectedFileMeta.name}을(를) 삭제하시겠습니까?`)) {
                        return
                      }
                      await deleteWorkspaceEntry(selectedFileMeta.path)
                      setSelectedPath(null)
                      setSelectedFileMeta(null)
                      setSelectedFileContent('')
                      setSelectedFileOriginalContent('')
                      setPreviewError(null)
                    }}
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              </div>

              {selectedFileMeta.editable ? (
                <div className="preview-editor">
                  <textarea
                    className="preview-editor__textarea"
                    onChange={(event) => setSelectedFileContent(event.target.value)}
                    spellCheck={false}
                    value={selectedFileContent}
                  />
                  <div className="preview-editor__footer">
                    <span className="composer__hint">
                      {previewSaving ? '저장 중' : '이 파일은 로컬 경로에 바로 저장됩니다.'}
                    </span>
                    <button
                      className="primary-button"
                      disabled={
                        previewSaving ||
                        !selectedFileMeta.editable ||
                        !isFileDirty
                      }
                      onClick={async () => {
                        setPreviewSaving(true)
                        setPreviewError(null)

                        try {
                          const saved = await saveWorkspaceFile(
                            selectedFileMeta.path,
                            selectedFileContent,
                          )
                          setSelectedFileMeta({
                            path: saved.relativePath,
                            name: saved.name,
                            mimeType: saved.mimeType,
                            size: saved.size,
                            updatedAt: saved.updatedAt,
                            editable: saved.editable,
                          })
                          setSelectedFileContent(saved.content)
                          setSelectedFileOriginalContent(saved.content)
                        } catch (error) {
                          setPreviewError(
                            error instanceof Error ? error.message : '파일 저장에 실패했습니다.',
                          )
                        } finally {
                          setPreviewSaving(false)
                        }
                      }}
                      type="button"
                    >
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <pre className="preview-card__content">
                  이 파일 형식은 브라우저 안에서 직접 편집하지 않습니다. 위치 열기를 눌러 로컬 경로에서
                  확인하거나, 채팅에서 이 파일을 대상으로 작업 지시를 보내세요.
                </pre>
              )}
            </>
          ) : (
            <EmptyState
              description="왼쪽 목록에서 파일을 열면 여기서 바로 내용을 보고 저장할 수 있습니다."
              title="파일을 선택해 주세요"
            />
          )}
        </div>
      </div>
    </section>
  )
}

function InsightsPage() {
  const { markInsight, state } = useArtemisApp()
  const [filter, setFilter] = useState<'all' | InsightStatus>('all')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const items = useMemo(
    () =>
      state.insights.items.filter((item) => {
        if (filter !== 'all' && item.status !== filter) {
          return false
        }

        const keyword = deferredQuery.trim().toLowerCase()
        if (!keyword) {
          return true
        }

        return (
          item.title.toLowerCase().includes(keyword) ||
          item.detail.toLowerCase().includes(keyword)
        )
      }),
    [deferredQuery, filter, state.insights.items],
  )

  return (
    <section className="page">
      <PageIntro
        description="채팅과 오케스트레이션, 시그널 실행 결과에서 남겨 둔 핵심 메모를 모아 봅니다."
        icon="insights"
        title="인사이트"
      />

      <div className="page-toolbar">
        <div className="chip-wrap">
          {[
            ['all', '전체'],
            ['unread', '읽지 않음'],
            ['read', '읽음'],
            ['archived', '보관됨'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`chip ${filter === id ? 'is-active' : ''}`}
              onClick={() => setFilter(id as typeof filter)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <SearchField onChange={setQuery} placeholder="인사이트 검색..." value={query} />
      </div>

      {items.length > 0 ? (
        <div className="stack-grid">
          {items.map((item) => (
            <article key={item.id} className="panel-card insight-card">
              <div className="card-topline">
                <span className="chip">{item.source}</span>
                <small>{formatDate(item.createdAt)}</small>
              </div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <div className="badge-row">
                <button className="ghost-button" onClick={() => markInsight(item.id, 'unread')} type="button">
                  읽지 않음
                </button>
                <button className="ghost-button" onClick={() => markInsight(item.id, 'read')} type="button">
                  읽음
                </button>
                <button className="ghost-button" onClick={() => markInsight(item.id, 'archived')} type="button">
                  보관
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="채팅이나 오케스트레이션을 실행하면 중요한 결과가 여기에 쌓입니다."
          title="아직 인사이트가 없습니다"
        />
      )}
    </section>
  )
}

function buildSignalChatPrompt(item: SignalFeedItem) {
  const lines = [
    '다음 시그널을 바탕으로 핵심 내용과 바로 쓸 수 있는 다음 조치를 정리해줘.',
    `분류: ${item.category}`,
    `출처: ${item.source}`,
    `제목: ${item.title}`,
  ]

  if (item.originalTitle && item.originalTitle !== item.title) {
    lines.push(`원문 제목: ${item.originalTitle}`)
  }

  lines.push(`요약: ${item.summary}`)
  lines.push(`원문 링크: ${item.url}`)

  return lines.join('\n')
}

function SignalsPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { setComposerText, state } = useArtemisApp()
  const [category, setCategory] = useState<(typeof signalCategories)[number]>('AI 및 기술')
  const [query, setQuery] = useState('')
  const [feed, setFeed] = useState<SignalFeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const loadFeed = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }

      try {
        const response = await fetchSignalsFeed({
          bridgeUrl: state.settings.bridgeUrl,
          category,
        })
        setFeed(response.items)
        setGeneratedAt(response.generatedAt)
      } catch (nextError) {
        if (!silent) {
          setError(
            nextError instanceof Error ? nextError.message : '시그널을 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [category, state.settings.bridgeUrl],
  )

  useEffect(() => {
    void loadFeed()
  }, [loadFeed])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadFeed({ silent: true })
    }, 90_000)

    return () => window.clearInterval(timer)
  }, [loadFeed])

  const filteredFeed = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    if (!keyword) {
      return feed
    }

    return feed.filter((item) =>
      `${item.title} ${item.summary} ${item.source} ${item.originalTitle ?? ''} ${item.originalSummary ?? ''}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [deferredQuery, feed])

  const hasPendingTranslations = useMemo(
    () => filteredFeed.some((item) => item.translationSource === 'original'),
    [filteredFeed],
  )
  const sourceSummary = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of feed) {
      const label = signalSourceLabel(item.source)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }

    return Array.from(counts.entries())
  }, [feed])

  return (
    <section className="page">
      <PageIntro
        description="Hacker News, GitHub, arXiv 공개 원문을 직접 읽어와 한국어로 정리합니다. 새로고침 시 최신 공개 피드를 다시 불러옵니다."
        icon="signals"
        title="시그널"
        trailing={
          <div className="header-actions">
            <span className="subtle-label">
              {hasPendingTranslations
                ? '일부 항목은 원문 우선으로 표시됩니다.'
                : generatedAt
                  ? `마지막 갱신 ${formatDate(generatedAt)}`
                  : '실시간 피드를 준비하는 중입니다.'}
            </span>
            <button className="ghost-button" onClick={() => void loadFeed()} type="button">
              새로고침
            </button>
          </div>
        }
      />

      <div className="signals-toolbar">
        <div className="chip-wrap">
          {signalCategories.map((item) => (
            <button
              key={item}
              className={`chip ${category === item ? 'is-active' : ''}`}
              onClick={() => setCategory(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="signals-toolbar__actions">
          <SearchField onChange={setQuery} placeholder="시그널 검색..." value={query} />
        </div>
      </div>

      <section className="panel-card panel-card--muted signals-source-strip">
        <div className="badge-row">
          {sourceSummary.map(([label, count]) => (
            <span key={label} className="chip chip--soft">
              {label} {count}건
            </span>
          ))}
        </div>
        <p>임의 카드가 아니라 공개 원문 피드만 사용합니다. 한국어 번역이 준비되지 않으면 원문 요약을 그대로 표시합니다.</p>
      </section>

      {error ? (
        <div className="status-banner status-banner--error">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && feed.length === 0 ? (
        <div className="panel-card panel-card--muted">실시간 시그널을 불러오는 중입니다...</div>
      ) : filteredFeed.length > 0 ? (
        <div className="signals-feed signals-feed--single">
          {filteredFeed.map((item) => {
            const translationLabel =
              item.translationSource === 'codex'
                ? 'Codex 번역'
                : item.translationSource === 'ollama'
                  ? '로컬 번역'
                  : item.translationSource === 'google-gtx'
                    ? '실시간 번역'
                  : '원문'

            return (
              <article key={item.id} className="signal-card signal-card--feed">
                <div className="signal-card__meta">
                  <div className="badge-row">
                    <span className="chip chip--soft">{item.category}</span>
                    <span className="chip">{signalSourceLabel(item.source)}</span>
                    <span className="chip">{formatRelative(item.publishedAt)}</span>
                    <span
                      className={`chip ${
                        item.translationSource === 'original' ? 'chip--soft' : ''
                      }`}
                    >
                      {translationLabel}
                    </span>
                  </div>
                  <small>{formatDate(item.publishedAt)}</small>
                </div>

                <strong>{item.title}</strong>
                {item.originalTitle && item.originalTitle !== item.title ? (
                  <small className="signal-card__original">원문 제목: {item.originalTitle}</small>
                ) : null}
                <p>{item.summary}</p>

                <div className="badge-row">
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setComposerText(buildSignalChatPrompt(item))
                      onNavigate('chat')
                    }}
                    type="button"
                  >
                    채팅으로 보내기
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                    type="button"
                  >
                    원문 열기
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          description="현재 조건으로 보여줄 실시간 시그널이 없습니다."
          title="빈 피드"
        />
      )}
    </section>
  )
}

function SkillsPage() {
  const { syncSkills, toggleTool, state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | ToolItem['source']>('all')
  const deferredQuery = useDeferredValue(query)

  const items = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()

    return state.tools.items.filter((item) => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) {
        return false
      }

      if (!keyword) {
        return true
      }

      return (
        item.title.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword) ||
        item.path.toLowerCase().includes(keyword)
      )
    })
  }, [deferredQuery, sourceFilter, state.tools.items])

  return (
    <section className="page">
      <PageIntro
        description="브리지에서 실제로 발견한 로컬 스킬만 표시합니다. 켜 둔 스킬만 채팅과 오케스트레이션에 전달됩니다."
        icon="tools"
        title="스킬"
        trailing={
          <button className="primary-button" onClick={() => void syncSkills()} type="button">
            스킬 새로 읽기
          </button>
        }
      />

      <div className="page-toolbar">
        <div className="chip-wrap">
          {['all', 'local-skill', 'plugin-skill'].map((item) => (
            <button
              key={item}
              className={`chip ${sourceFilter === item ? 'is-active' : ''}`}
              onClick={() => setSourceFilter(item as typeof sourceFilter)}
              type="button"
            >
              {item === 'all' ? '전체' : sourceLabel(item as ToolItem['source'])}
            </button>
          ))}
        </div>
        <SearchField onChange={setQuery} placeholder="스킬 검색..." value={query} />
      </div>

      {items.length > 0 ? (
        <div className="stack-grid">
          {items.map((item) => (
            <article key={item.id} className="panel-card">
              <div className="panel-card__header">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <Toggle on={item.enabled} onToggle={() => toggleTool(item.id)} />
              </div>
              <div className="badge-row">
                <span className="chip">{item.section}</span>
                <span className="chip">{sourceLabel(item.source)}</span>
              </div>
              <small className="mono">{item.path}</small>
              <p className="example-text">{item.example}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          action="스킬 새로 읽기"
          description="현재 발견된 로컬 스킬이 없습니다."
          onAction={() => void syncSkills()}
          title="스킬이 아직 없습니다"
        />
      )}
    </section>
  )
}

function buildOrchestrationGraph({
  activeAgent,
  tools,
  runs,
  filesCount,
  insightsCount,
  signalCount,
  activityCount,
  recentPrompt,
  messageCount,
}: {
  activeAgent: AgentItem | null
  tools: ToolItem[]
  runs: ReturnType<typeof useArtemisApp>['activeAgentRuns']
  filesCount: number
  insightsCount: number
  signalCount: number
  activityCount: number
  recentPrompt: string
  messageCount: number
}) {
  const activeTools = tools.filter((item) => item.enabled).slice(0, 3)
  const latestRun = runs[0]

  const nodes: Array<Node<FlowNodeData>> = [
    {
      id: 'trigger',
      type: 'orchestration',
      position: { x: 28, y: 128 },
      data: {
        title: '작업 입력',
        subtitle:
          latestRun?.task ||
          recentPrompt ||
          '채팅에서 넘긴 요청 또는 오른쪽 실행 패널에서 입력한 작업',
        tone: 'trigger',
        badge: '입력',
        page: 'chat',
      },
    },
    {
      id: 'signals',
      type: 'orchestration',
      position: { x: 38, y: 344 },
      data: {
        title: '시그널 입력',
        subtitle: `워치리스트 ${signalCount}개 · 공개 피드 흐름을 컨텍스트로 보강`,
        tone: 'memory',
        badge: '시그널',
        page: 'signals',
      },
    },
    {
      id: 'agent',
      type: 'orchestration',
      position: { x: 312, y: 116 },
      data: {
        title: activeAgent?.name || '에이전트 없음',
        subtitle: activeAgent?.role || '설정에서 모델과 API를 먼저 연결해 주세요.',
        tone: 'agent',
        badge: activeAgent?.status || 'idle',
        page: 'settings',
        agentId: activeAgent?.id,
      },
    },
    {
      id: 'router',
      type: 'orchestration',
      position: { x: 640, y: 118 },
      data: {
        title: '실행 라우터',
        subtitle:
          latestRun?.status === 'running'
            ? '현재 모델 응답과 스킬 출력을 정리하고 있습니다.'
            : '실행 결과를 파일 · 인사이트 · 활동으로 분기합니다.',
        tone: 'router',
        badge: latestRun?.status || '대기',
      },
    },
    {
      id: 'model',
      type: 'orchestration',
      position: { x: 274, y: 362 },
      data: {
        title: activeAgent ? getAgentProviderLabel(activeAgent.provider) : '모델 연결',
        subtitle: activeAgent?.model || '설정에서 모델을 지정해 주세요.',
        tone: 'model',
        badge: activeAgent ? getAgentProviderLabel(activeAgent.provider) : undefined,
        page: 'settings',
      },
    },
    {
      id: 'memory',
      type: 'orchestration',
      position: { x: 496, y: 362 },
      data: {
        title: '컨텍스트 메모리',
        subtitle: `최근 대화 ${messageCount}개 · 인사이트 ${insightsCount}개`,
        tone: 'memory',
        badge: '메모리',
        page: 'insights',
      },
    },
    {
      id: 'files',
      type: 'orchestration',
      position: { x: 948, y: 28 },
      data: {
        title: '내 파일',
        subtitle: `산출물 ${filesCount}개를 로컬 저장소에 보관합니다.`,
        tone: 'output',
        badge: `${filesCount}개`,
        page: 'files',
      },
    },
    {
      id: 'insights',
      type: 'orchestration',
      position: { x: 948, y: 176 },
      data: {
        title: '인사이트',
        subtitle: `핵심 메모 ${insightsCount}개를 유지합니다.`,
        tone: 'output',
        badge: `${insightsCount}개`,
        page: 'insights',
      },
    },
    {
      id: 'activity',
      type: 'orchestration',
      position: { x: 948, y: 324 },
      data: {
        title: '활동',
        subtitle: `실행 기록 ${activityCount}건을 남깁니다.`,
        tone: 'output',
        badge: `${activityCount}건`,
        page: 'activity',
      },
    },
  ]

  activeTools.forEach((tool, index) => {
    nodes.push({
      id: `tool-${tool.id}`,
      type: 'orchestration',
      position: { x: 720 + index * 174, y: 404 },
      data: {
        title: tool.title,
        subtitle: tool.section,
        tone: 'skill',
        badge: sourceLabel(tool.source),
        page: 'tools',
      },
    })
  })

  const edges: Edge[] = [
    { id: 'trigger-agent', source: 'trigger', target: 'agent' },
    {
      id: 'signals-agent',
      source: 'signals',
      target: 'agent',
      style: { strokeDasharray: '6 6', opacity: 0.7 },
    },
    {
      id: 'model-agent',
      source: 'model',
      target: 'agent',
      style: { strokeDasharray: '6 6', opacity: 0.7 },
    },
    {
      id: 'memory-agent',
      source: 'memory',
      target: 'agent',
      style: { strokeDasharray: '6 6', opacity: 0.7 },
    },
    { id: 'agent-router', source: 'agent', target: 'router' },
    { id: 'router-files', source: 'router', target: 'files' },
    { id: 'router-insights', source: 'router', target: 'insights' },
    { id: 'router-activity', source: 'router', target: 'activity' },
    ...activeTools.map((tool) => ({
      id: `tool-edge-${tool.id}`,
      source: `tool-${tool.id}`,
      target: 'agent',
      style: { strokeDasharray: '6 6', opacity: 0.7 },
    })),
  ]

  return { nodes, edges }
}

function OrchestrationPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    activeAgent,
    activeAgentRuns,
    activeThread,
    bridgeHealth,
    runAgentTask,
    setActiveAgent,
    state,
    workspaceSummary,
  } = useArtemisApp()
  const [task, setTask] = useState('')
  const activeTools = state.tools.items.filter((item) => item.enabled)
  const latestMasterMessage = [...activeThread.messages]
    .reverse()
    .find((message) => message.role === 'master')
  const latestRun = activeAgentRuns[0]
  const requiresApiKey =
    (activeAgent?.provider === 'openai-compatible' || activeAgent?.provider === 'anthropic') &&
    !state.apiKeys.some((item) => item.id === activeAgent.apiKeyId)

  const graph = useMemo(
    () =>
      buildOrchestrationGraph({
        activeAgent,
        runs: activeAgentRuns,
        tools: state.tools.items,
        filesCount: workspaceSummary.fileCount,
        insightsCount: state.insights.items.length,
        signalCount: state.signals.items.filter((item) => item.subscribed).length,
        activityCount: state.activity.items.length,
        recentPrompt: latestMasterMessage?.text ?? '',
        messageCount: activeThread.messages.length,
      }),
    [
      activeAgent,
      activeAgentRuns,
      activeThread.messages,
      latestMasterMessage?.text,
      state.activity.items.length,
      state.insights.items.length,
      state.signals.items,
      state.tools.items,
      workspaceSummary.fileCount,
    ],
  )

  return (
    <section className="page">
      <PageIntro
        description="설정에 저장된 에이전트와 스킬을 실제 실행 흐름으로 엮어 보고, 바로 실행 결과까지 확인합니다."
        icon="agent"
        title="오케스트레이션"
      />

      <div className="orchestration-layout">
        <div className="panel-card orchestration-canvas">
          <ReactFlow
            edges={graph.edges}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodes={graph.nodes}
            nodeTypes={orchestrationNodeTypes}
            nodesDraggable={false}
            nodesFocusable={false}
            onNodeClick={(_, node) => {
              const data = node.data as FlowNodeData
              if (data.agentId) {
                setActiveAgent(data.agentId)
              }
              if (data.page) {
                onNavigate(data.page)
              }
            }}
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap />
            <Controls showInteractive={false} />
            <Background gap={22} size={1} />
          </ReactFlow>
        </div>

        <aside className="orchestration-side">
          <section className="panel-card">
            <div className="panel-card__header">
              <h2>실행</h2>
              {activeAgent ? <span className="chip">{activeAgent.name}</span> : null}
            </div>
            <div className="badge-row">
              <span className="chip chip--soft">
                {activeAgent ? `${getAgentProviderLabel(activeAgent.provider)} · ${activeAgent.model}` : '에이전트 없음'}
              </span>
              <span className="chip chip--soft">활성 스킬 {activeTools.length}개</span>
              <span className="chip chip--soft">
                연결 상태{' '}
                {bridgeHealth?.providers.filter((item) => item.ready).length ?? 0}개
              </span>
            </div>
            <label className="field field--full">
              <span>작업 지시</span>
              <textarea
                onChange={(event) => setTask(event.target.value)}
                placeholder="예: 오늘 시그널을 요약해서 개발팀용 브리핑 문서로 정리해줘"
                rows={5}
                value={task}
              />
            </label>
            <div className="chip-wrap">
              {[
                '오늘 시그널을 한국어 브리핑으로 정리해줘',
                '최근 파일 산출물을 바탕으로 다음 작업을 정리해줘',
                '현재 활성 스킬로 처리 가능한 자동화 흐름을 설계해줘',
              ].map((template) => (
                <button
                  key={template}
                  className="chip"
                  onClick={() => setTask(template)}
                  type="button"
                >
                  {template}
                </button>
              ))}
            </div>
            {requiresApiKey ? (
              <div className="status-banner status-banner--error">
                <Icon name="warning" size={16} />
                <span>이 에이전트는 API 키가 필요합니다. 설정에서 먼저 연결해 주세요.</span>
              </div>
            ) : null}
            <button
              className="primary-button"
              disabled={
                !activeAgent ||
                !task.trim() ||
                activeAgent.status === 'running' ||
                Boolean(requiresApiKey)
              }
              onClick={async () => {
                if (activeAgent) {
                  await runAgentTask(activeAgent.id, task)
                  setTask('')
                }
              }}
              type="button"
            >
              {activeAgent?.status === 'running' ? '실행 중...' : '오케스트레이션 실행'}
            </button>
          </section>

          <section className="panel-card">
            <div className="panel-card__header">
              <h2>활성 에이전트</h2>
              <span className="chip">{state.agents.items.length}개</span>
            </div>
            <div className="chip-wrap">
              {state.agents.items.map((agent) => (
                <button
                  key={agent.id}
                  className={`chip ${activeAgent?.id === agent.id ? 'is-active' : ''}`}
                  onClick={() => setActiveAgent(agent.id)}
                  type="button"
                >
                  {agent.name}
                </button>
              ))}
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-card__header">
              <h2>현재 연결 요약</h2>
              {latestRun ? <span className="chip chip--soft">{latestRun.status}</span> : null}
            </div>
            <div className="stack-grid stack-grid--compact">
              <div className="summary-row">
                <span>최근 입력</span>
                <strong>{latestMasterMessage?.text || '아직 없습니다'}</strong>
              </div>
              <div className="summary-row">
                <span>시그널 구독</span>
                <strong>{state.signals.items.filter((item) => item.subscribed).length}개</strong>
              </div>
              <div className="summary-row">
                <span>활성 스킬</span>
                <strong>{activeTools.length}개</strong>
              </div>
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-card__header">
              <h2>실행 로그</h2>
              {activeAgentRuns[0] ? <span className="chip">{activeAgentRuns[0].status}</span> : null}
            </div>
            {activeAgentRuns.length > 0 ? (
              <div className="stack-grid stack-grid--compact">
                {activeAgentRuns.slice(0, 4).map((run) => (
                  <article key={run.id} className="run-card">
                    <div className="card-topline">
                      <strong>{run.task}</strong>
                      <small>{formatDate(run.startedAt)}</small>
                    </div>
                    <p>{run.output || '아직 결과가 기록되지 않았습니다.'}</p>
                    <div className="run-card__logs">
                      {run.logs.slice(-3).map((log) => (
                        <div key={log.id} className={`run-log run-log--${log.level}`}>
                          <span>{formatDate(log.createdAt)}</span>
                          <p>{log.message}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                description="오른쪽 작업 지시를 실행하면 실제 모델 로그가 여기에 쌓입니다."
                title="아직 실행 기록이 없습니다"
              />
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}

function ActivityPage() {
  const { state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const items = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    if (!keyword) {
      return state.activity.items
    }

    return state.activity.items.filter((item) =>
      `${item.title} ${item.detail} ${item.page}`.toLowerCase().includes(keyword),
    )
  }, [deferredQuery, state.activity.items])

  return (
    <section className="page">
      <PageIntro
        description="실제로 실행된 채팅, 스킬, 오케스트레이션, 저장 작업 기록만 보여줍니다."
        icon="insights"
        title="활동"
      />

      <div className="page-toolbar">
        <SearchField onChange={setQuery} placeholder="활동 검색..." value={query} />
      </div>

      {items.length > 0 ? (
        <div className="stack-grid">
          {items.map((item) => (
            <article key={item.id} className="panel-card">
              <div className="card-topline">
                <span className="chip">{pageLabel(item.page)}</span>
                <small>{formatDate(item.createdAt)}</small>
              </div>
              <strong>{item.detail}</strong>
              <p>{item.title}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="채팅이나 오케스트레이션을 실행하면 실제 기록이 여기 남습니다."
          title="활동 기록이 없습니다"
        />
      )}
    </section>
  )
}

function SettingsProfilePane() {
  const { state, updateSettings } = useArtemisApp()

  return (
    <div className="stack-grid">
      <section className="settings-card">
        <h2>에이전트 프로필</h2>
        <div className="settings-grid">
          <label className="field field--full">
            <span>이름</span>
            <input
              onChange={(event) => updateSettings({ agentName: event.target.value })}
              value={state.settings.agentName}
            />
          </label>
          <label className="field">
            <span>말투</span>
            <input
              onChange={(event) => updateSettings({ tone: event.target.value })}
              value={state.settings.tone}
            />
          </label>
          <label className="field">
            <span>응답 형식</span>
            <input
              onChange={(event) => updateSettings({ responseStyle: event.target.value })}
              value={state.settings.responseStyle}
            />
          </label>
          <label className="field field--full">
            <span>사용자 지침</span>
            <textarea
              onChange={(event) => updateSettings({ customInstructions: event.target.value })}
              rows={4}
              value={state.settings.customInstructions}
            />
          </label>
        </div>
      </section>

      <section className="settings-card">
        <h2>사용자 정보</h2>
        <div className="settings-grid">
          <label className="field">
            <span>이름</span>
            <input
              onChange={(event) => updateSettings({ userName: event.target.value })}
              value={state.settings.userName}
            />
          </label>
          <label className="field">
            <span>역할</span>
            <input
              onChange={(event) => updateSettings({ userRole: event.target.value })}
              value={state.settings.userRole}
            />
          </label>
          <label className="field field--full">
            <span>조직</span>
            <input
              onChange={(event) => updateSettings({ organization: event.target.value })}
              value={state.settings.organization}
            />
          </label>
          <label className="field field--full">
            <span>관심사</span>
            <input
              onChange={(event) =>
                updateSettings({
                  interests: event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              value={state.settings.interests.join(', ')}
            />
          </label>
        </div>
      </section>
    </div>
  )
}

function SettingsModelsPane() {
  const {
    activeAgent,
    addApiKey,
    bridgeHealth,
    createAgent,
    deleteAgent,
    refreshBridgeHealth,
    removeApiKey,
    setActiveAgent,
    state,
    updateAgent,
    updateSettings,
  } = useArtemisApp()
  const [presetId, setPresetId] = useState<string>('codex-cli')
  const [apiLabel, setApiLabel] = useState('')
  const [apiKey, setApiKey] = useState('')

  return (
    <div className="stack-grid">
      <section className="settings-card">
        <div className="panel-card__header">
          <h2>실행기 연결 상태</h2>
          <button className="ghost-button" onClick={() => void refreshBridgeHealth()} type="button">
            상태 새로고침
          </button>
        </div>

        <div className="provider-grid">
          {(bridgeHealth?.providers ?? []).map((provider) => (
            <article
              key={provider.provider}
              className={`provider-card ${provider.ready ? 'is-ready' : ''}`}
            >
              <div className="card-topline">
                <strong>{providerLabel(provider.provider)}</strong>
                <span className="chip">{provider.ready ? '준비됨' : '확인 필요'}</span>
              </div>
              <p>{provider.detail}</p>
              <div className="chip-wrap">
                {provider.models.map((model) => (
                  <span key={model} className="chip">
                    {model}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="badge-row">
          {(['auto', 'ollama', 'codex'] as const).map((item) => (
            <button
              key={item}
              className={`chip ${state.settings.modelProvider === item ? 'is-active' : ''}`}
              onClick={() => updateSettings({ modelProvider: item })}
              type="button"
            >
              기본 채팅 공급자: {providerLabel(item)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <h2>에이전트 추가</h2>
        <div className="settings-dual">
          <label className="field">
            <span>프리셋</span>
            <select onChange={(event) => setPresetId(event.target.value)} value={presetId}>
              {AGENT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field field--action">
            <span>생성</span>
            <button className="primary-button" onClick={() => createAgent(presetId as never)} type="button">
              선택한 프리셋으로 추가
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card settings-card--split">
        <div className="settings-card__side">
          <div className="panel-card__header">
            <h2>에이전트 목록</h2>
            <span className="chip">{state.agents.items.length}개</span>
          </div>
          <div className="entity-list">
            {state.agents.items.map((agent) => (
              <button
                key={agent.id}
                className={`agent-list-item ${activeAgent?.id === agent.id ? 'is-selected' : ''}`}
                onClick={() => setActiveAgent(agent.id)}
                type="button"
              >
                <div>
                  <strong>{agent.name}</strong>
                  <small>
                    {getAgentProviderLabel(agent.provider)} · {agent.model}
                  </small>
                </div>
                <span className={`chip chip--status chip--${agent.status}`}>{agent.status}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-card__main">
          {activeAgent ? (
            <>
              <div className="panel-card__header">
                <h2>선택된 에이전트 설정</h2>
                <button
                  className="danger-button"
                  disabled={state.agents.items.length <= 1}
                  onClick={() => deleteAgent(activeAgent.id)}
                  type="button"
                >
                  삭제
                </button>
              </div>
              <div className="settings-grid">
                <label className="field">
                  <span>이름</span>
                  <input
                    onChange={(event) => updateAgent(activeAgent.id, { name: event.target.value })}
                    value={activeAgent.name}
                  />
                </label>
                <label className="field">
                  <span>역할</span>
                  <input
                    onChange={(event) => updateAgent(activeAgent.id, { role: event.target.value })}
                    value={activeAgent.role}
                  />
                </label>
                <label className="field field--full">
                  <span>설명</span>
                  <input
                    onChange={(event) =>
                      updateAgent(activeAgent.id, { description: event.target.value })
                    }
                    value={activeAgent.description}
                  />
                </label>
                <label className="field">
                  <span>프리셋</span>
                  <input readOnly value={getAgentPreset(activeAgent.preset).label} />
                </label>
                <label className="field">
                  <span>공급자</span>
                  <input readOnly value={getAgentProviderLabel(activeAgent.provider)} />
                </label>
                <label className="field">
                  <span>모델</span>
                  <input
                    onChange={(event) => updateAgent(activeAgent.id, { model: event.target.value })}
                    value={activeAgent.model}
                  />
                </label>
                <label className="field">
                  <span>API 키</span>
                  <select
                    onChange={(event) =>
                      updateAgent(activeAgent.id, {
                        apiKeyId: event.target.value || null,
                      })
                    }
                    value={activeAgent.apiKeyId ?? ''}
                  >
                    <option value="">필요 없음</option>
                    {state.apiKeys.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field field--full">
                  <span>기본 URL</span>
                  <input
                    onChange={(event) =>
                      updateAgent(activeAgent.id, { baseUrl: event.target.value })
                    }
                    value={activeAgent.baseUrl}
                  />
                </label>
                <label className="field field--full">
                  <span>시스템 프롬프트</span>
                  <textarea
                    onChange={(event) =>
                      updateAgent(activeAgent.id, { systemPrompt: event.target.value })
                    }
                    rows={5}
                    value={activeAgent.systemPrompt}
                  />
                </label>
              </div>
            </>
          ) : (
            <EmptyState
              description="왼쪽 목록에서 에이전트를 선택하면 상세 설정을 편집할 수 있습니다."
              title="선택된 에이전트가 없습니다"
            />
          )}
        </div>
      </section>

      <section className="settings-card">
        <h2>API 키</h2>
        <div className="settings-dual">
          <label className="field">
            <span>라벨</span>
            <input onChange={(event) => setApiLabel(event.target.value)} value={apiLabel} />
          </label>
          <label className="field">
            <span>키</span>
            <input onChange={(event) => setApiKey(event.target.value)} value={apiKey} />
          </label>
        </div>
        <div className="badge-row">
          <button
            className="primary-button"
            onClick={() => {
              if (!apiKey.trim()) return
              addApiKey(apiLabel, apiKey)
              setApiLabel('')
              setApiKey('')
            }}
            type="button"
          >
            API 키 저장
          </button>
        </div>
        <div className="entity-list">
          {state.apiKeys.length > 0 ? (
            state.apiKeys.map((item) => (
              <div key={item.id} className="api-key-row">
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.maskedKey}</small>
                </div>
                <button className="ghost-button" onClick={() => removeApiKey(item.id)} type="button">
                  삭제
                </button>
              </div>
            ))
          ) : (
            <div className="panel-card panel-card--muted">저장된 API 키가 없습니다.</div>
          )}
        </div>
      </section>
    </div>
  )
}

function SettingsPreferencesPane() {
  const { resetAll, state, updateSettings } = useArtemisApp()

  return (
    <div className="stack-grid">
      <section className="settings-card">
        <h2>화면 환경</h2>
        <div className="chip-wrap">
          {(['light', 'dark', 'system'] as const).map((item) => (
            <button
              key={item}
              className={`chip ${state.settings.theme === item ? 'is-active' : ''}`}
              onClick={() => updateSettings({ theme: item })}
              type="button"
            >
              {item === 'light' ? '라이트' : item === 'dark' ? '다크' : '시스템'}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <h2>실행 환경</h2>
        <div className="settings-grid">
          <label className="field">
            <span>언어</span>
            <input
              onChange={(event) => updateSettings({ language: event.target.value })}
              value={state.settings.language}
            />
          </label>
          <label className="field">
            <span>시간대</span>
            <input
              onChange={(event) => updateSettings({ timezone: event.target.value })}
              value={state.settings.timezone}
            />
          </label>
          <label className="field field--full">
            <span>브리지 URL</span>
            <input
              onChange={(event) => updateSettings({ bridgeUrl: event.target.value })}
              value={state.settings.bridgeUrl}
            />
          </label>
        </div>
      </section>

      <section className="settings-card settings-card--danger">
        <h2>초기화</h2>
        <p>현재 브라우저에 저장된 로컬 상태를 초기화합니다. 오래된 예시 데이터도 함께 정리됩니다.</p>
        <button className="danger-button" onClick={resetAll} type="button">
          로컬 상태 초기화
        </button>
      </section>
    </div>
  )
}

function SettingsPage() {
  const { state, updateSettings } = useArtemisApp()

  return (
    <section className="page">
      <PageIntro
        description="프로필, 실행기, 에이전트, API 키를 한곳에서 실제 로컬 상태로 관리합니다."
        icon="settings"
        title="설정"
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
      {state.settings.activeTab === 'models' ? <SettingsModelsPane /> : null}
      {state.settings.activeTab === 'preferences' ? <SettingsPreferencesPane /> : null}
    </section>
  )
}

function GuidePage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <section className="page">
      <PageIntro
        description="현재 남아 있는 메뉴만 실제 동작 중심으로 사용합니다."
        icon="settings"
        title="가이드"
      />
      <div className="stack-grid">
        {[
          {
            title: '채팅',
            body: '실제 연결된 로컬 모델과 외부 에이전트로 대화를 실행합니다.',
            page: 'chat' as PageId,
          },
          {
            title: '내 파일',
            body: '업로드와 생성 산출물을 같은 로컬 저장소에서 관리합니다.',
            page: 'files' as PageId,
          },
          {
            title: '시그널',
            body: '실시간 공개 피드를 읽고 워치리스트를 관리합니다.',
            page: 'signals' as PageId,
          },
          {
            title: '오케스트레이션',
            body: '에이전트, 모델, 스킬, 출력 흐름을 시각화하고 직접 실행합니다.',
            page: 'agents' as PageId,
          },
          {
            title: '설정',
            body: '에이전트, API 키, 모델, 환경 설정을 한곳에서 관리합니다.',
            page: 'settings' as PageId,
          },
        ].map((item) => (
          <article key={item.title} className="guide-card">
            <strong>{item.title}</strong>
            <p>{item.body}</p>
            <button className="ghost-button" onClick={() => onNavigate(item.page)} type="button">
              열기
            </button>
          </article>
        ))}
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
      return <FilesPage />
    case 'insights':
      return <InsightsPage />
    case 'signals':
      return <SignalsPage onNavigate={onNavigate} />
    case 'tools':
      return <SkillsPage />
    case 'agents':
      return <OrchestrationPage onNavigate={onNavigate} />
    case 'activity':
      return <ActivityPage />
    case 'settings':
      return <SettingsPage />
    case 'guide':
      return <GuidePage onNavigate={onNavigate} />
    default:
      return <ChatPage onNavigate={onNavigate} />
  }
}

