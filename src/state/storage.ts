import { OLLAMA_LOCAL_MODEL } from '../lib/agentCatalog'
import { buildInitialAgents, createDefaultState } from './defaultState'
import type { RuntimeState, ToolItem } from './types'

const STORAGE_KEY = 'artemis-runtime-state/v16'
const LEGACY_STORAGE_KEYS = [
  'artemis-runtime-state/v15',
  'artemis-runtime-state/v14',
  'artemis-runtime-state/v13',
]
const MAX_PERSISTED_FILE_CONTENT = 20_000
const LEGACY_CHAT_NOISE_PATTERNS = [
  '요청을 활동 로그와 인사이트에 기록했습니다.',
  '요청 내용을 작업 메모로 정리했습니다.',
  '필요하면 문서, 파일, 자동화 흐름 중 어느 방향으로 넘길지 더 구체화하겠습니다.',
] as const
const LEGACY_OLLAMA_MODELS = new Set([
  'gemma4:e2b',
  'gemma4-e2b',
  'gemma4 e2b',
  'gemma4:e4b',
  'gemma4-e4b',
  'gemma4 e4b',
  'gemma4-uncensored:latest',
  'gemma4-uncensored',
  'gemma4-uncensored-q4fast:latest',
  'gemma4-uncensored-q4fast',
  'gemma4-uncensored-fast:latest',
  'gemma4-uncensored-fast',
  'gemma4-e4b-fast:latest',
  'gemma4-e4b-fast',
])
const SUPPORTED_AGENT_PRESETS = new Set(['codex-cli', 'official-router', 'ollama-local'])
const LEGACY_CLOUD_AGENT_PRESETS = new Set([
  'openai-direct',
  'gemini-openai',
  'claude-anthropic',
  'openrouter-free',
  'aihubmix-free',
  'nvidia-trial',
  'custom-openai',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isLegacyChatNoise(message: RuntimeState['chats']['threads'][number]['messages'][number]) {
  if (message.role === 'tool') {
    return true
  }

  if (message.role !== 'assistant') {
    return false
  }

  return LEGACY_CHAT_NOISE_PATTERNS.some((pattern) => message.text.includes(pattern))
}

function isRealSkill(item: ToolItem) {
  return Boolean(item.path) && (item.source === 'local-skill' || item.source === 'plugin-skill')
}

function isLegacyOllamaModel(value: unknown) {
  return typeof value === 'string' && LEGACY_OLLAMA_MODELS.has(value.trim().toLowerCase())
}

function normalizeState(candidate: unknown): RuntimeState {
  const fallback = createDefaultState()

  if (!isRecord(candidate)) {
    return fallback
  }

  const chats = isRecord(candidate.chats) ? candidate.chats : null
  const files = isRecord(candidate.files) ? candidate.files : null
  const tools = isRecord(candidate.tools) ? candidate.tools : null
  const activity = isRecord(candidate.activity) ? candidate.activity : null
  const insights = isRecord(candidate.insights) ? candidate.insights : null
  const signals = isRecord(candidate.signals) ? candidate.signals : null
  const agents = isRecord(candidate.agents) ? candidate.agents : null
  const settings = isRecord(candidate.settings) ? candidate.settings : null

  const next: RuntimeState = {
    ...fallback,
    chats: {
      ...fallback.chats,
      ...(chats ?? {}),
      threads:
        Array.isArray(chats?.threads) && chats.threads.length > 0
          ? (chats.threads as RuntimeState['chats']['threads']).map((thread) => {
              const rawMessages = Array.isArray(thread.messages) ? thread.messages : []
              return {
                ...thread,
                messages: rawMessages.filter((message) => !isLegacyChatNoise(message)),
              }
            })
          : fallback.chats.threads,
    },
    files: {
      ...fallback.files,
      ...(files ?? {}),
      items: Array.isArray(files?.items)
        ? (files.items as RuntimeState['files']['items'])
        : fallback.files.items,
    },
    tools: {
      items: Array.isArray(tools?.items)
        ? (tools.items as RuntimeState['tools']['items']).filter(isRealSkill)
        : fallback.tools.items,
    },
    activity: {
      items: Array.isArray(activity?.items)
        ? (activity.items as RuntimeState['activity']['items']).filter(
            (item) => item.page !== 'mail' && item.page !== 'channels' && item.page !== 'marketplace',
          )
        : fallback.activity.items,
    },
    insights: {
      items: Array.isArray(insights?.items)
        ? (insights.items as RuntimeState['insights']['items'])
        : fallback.insights.items,
    },
    signals: {
      items: Array.isArray(signals?.items)
        ? (signals.items as RuntimeState['signals']['items']).filter(
            (item) => item.id !== 'signal-ai-daily',
          )
        : fallback.signals.items,
    },
    agents: {
      activeAgentId:
        typeof agents?.activeAgentId === 'string'
          ? agents.activeAgentId
          : fallback.agents.activeAgentId,
      items: Array.isArray(agents?.items)
        ? (agents.items as RuntimeState['agents']['items'])
        : fallback.agents.items,
      runs: Array.isArray(agents?.runs)
        ? (agents.runs as RuntimeState['agents']['runs'])
        : fallback.agents.runs,
    },
    settings: {
      ...fallback.settings,
      ...(settings ?? {}),
      activeTab:
        settings?.activeTab === 'profile' ||
        settings?.activeTab === 'models' ||
        settings?.activeTab === 'preferences'
          ? settings.activeTab
          : fallback.settings.activeTab,
    },
    apiKeys: [],
  }

  if (!next.chats.threads.some((thread) => thread.id === next.chats.activeThreadId)) {
    next.chats.activeThreadId = next.chats.threads[0]?.id ?? fallback.chats.activeThreadId
  }

  if (!next.files.items.some((item) => item.id === next.files.activeFolderId && item.kind === 'folder')) {
    next.files.activeFolderId = fallback.files.activeFolderId
  }

  if (!next.agents.items.some((item) => item.id === next.agents.activeAgentId)) {
    next.agents.activeAgentId = next.agents.items[0]?.id ?? fallback.agents.activeAgentId
  }

  const seedAgents = buildInitialAgents()
  const seedAgentMap = new Map(seedAgents.map((seed) => [seed.id, seed]))

  next.agents.items = next.agents.items
    .map((item) => {
      if (
        typeof item.preset !== 'string' ||
        LEGACY_CLOUD_AGENT_PRESETS.has(item.preset) ||
        !SUPPORTED_AGENT_PRESETS.has(item.preset)
      ) {
        return null
      }

    const seed = seedAgentMap.get(item.id)

      if (!seed) {
        return item
      }

      const merged = {
        ...item,
        name: item.name || seed.name,
        role: item.role || seed.role,
        description: item.description || seed.description,
        provider: item.provider || seed.provider,
        preset: item.preset || seed.preset,
        baseUrl: item.baseUrl || seed.baseUrl,
        model: item.model || seed.model,
        capabilities:
          Array.isArray(item.capabilities) && item.capabilities.length > 0
            ? item.capabilities
            : seed.capabilities,
      }

      if (
        item.id === 'agent-ollama' ||
        isLegacyOllamaModel(item.model) ||
        isLegacyOllamaModel(item.name)
      ) {
        return {
          ...merged,
          name: seed.name,
          role: seed.role,
          description: seed.description,
          provider: seed.provider,
          preset: seed.preset,
          baseUrl: seed.baseUrl,
          model: OLLAMA_LOCAL_MODEL,
          capabilities: seed.capabilities,
        }
      }

      return merged
    })
    .filter((item): item is RuntimeState['agents']['items'][number] => item !== null)

  const missingSeedAgents = seedAgents.filter(
    (seed) => !next.agents.items.some((item) => item.id === seed.id),
  )

  if (missingSeedAgents.length > 0) {
    next.agents.items = [...next.agents.items, ...missingSeedAgents]
  }

  if (isLegacyOllamaModel(next.settings.ollamaModel)) {
    next.settings.ollamaModel = OLLAMA_LOCAL_MODEL
  }

  return next
}

function sanitizeStateForPersist(state: RuntimeState): RuntimeState {
  return {
    ...state,
    files: {
      ...state.files,
      items: state.files.items.map((item) => ({
        ...item,
        content:
          item.content.length > MAX_PERSISTED_FILE_CONTENT
            ? `${item.content.slice(0, MAX_PERSISTED_FILE_CONTENT)}\n\n[내용이 길어 앞부분만 로컬 상태에 저장했습니다.]`
            : item.content,
      })),
    },
  }
}

export function loadRuntimeState(): RuntimeState {
  if (typeof window === 'undefined') {
    return createDefaultState()
  }

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean)

    if (!raw) {
      return createDefaultState()
    }

    return normalizeState(JSON.parse(raw))
  } catch {
    return createDefaultState()
  }
}

export function saveRuntimeState(state: RuntimeState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeStateForPersist(state)))
  } catch (error) {
    console.warn('Artemis 로컬 상태 저장에 실패했습니다.', error)
  }
}

export function resetRuntimeState() {
  if (typeof window === 'undefined') {
    return createDefaultState()
  }

  window.localStorage.removeItem(STORAGE_KEY)
  for (const key of LEGACY_STORAGE_KEYS) {
    window.localStorage.removeItem(key)
  }
  return createDefaultState()
}
