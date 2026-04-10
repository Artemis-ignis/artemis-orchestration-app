import { buildAgentFromPreset } from '../lib/agentCatalog'
import type {
  ActivityItem,
  AgentItem,
  AgentPresetId,
  AgentRun,
  ApiKeyItem,
  ChatMessage,
  ChatThread,
  InsightItem,
  RuntimeState,
  SignalItem,
  StoredFile,
  ToolItem,
} from './types'
import { resetRuntimeState } from './storage'

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function nowIso() {
  return new Date().toISOString()
}

function maskKey(key: string) {
  const trimmed = key.trim()
  if (trimmed.length <= 8) {
    return '********'
  }

  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
}

export type Action =
  | { type: 'SET_COMPOSER'; text: string }
  | { type: 'RUN_PROMPT'; prompt: string; assistantText?: string; provider?: string; model?: string }
  | { type: 'APPEND_CHAT_ERROR'; prompt: string; error: string }
  | { type: 'CREATE_THREAD' }
  | { type: 'CREATE_FOLDER'; name: string; parentId: string | null }
  | { type: 'ADD_FILES'; files: Array<Pick<StoredFile, 'name' | 'mimeType' | 'content' | 'size' | 'source'>> }
  | { type: 'SET_ACTIVE_FOLDER'; folderId: string | null }
  | { type: 'TOGGLE_TOOL'; toolId: string }
  | { type: 'SYNC_TOOL_CATALOG'; items: ToolItem[] }
  | { type: 'MARK_INSIGHT'; insightId: string; status: InsightItem['status'] }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<RuntimeState['settings']> }
  | { type: 'SELECT_CHAT_MODEL'; provider: 'ollama' | 'codex'; model: string }
  | { type: 'ADD_API_KEY'; label: string; key: string }
  | { type: 'REMOVE_API_KEY'; keyId: string }
  | { type: 'ADD_SIGNAL'; title: string; category: string; description: string }
  | { type: 'TOGGLE_SIGNAL'; signalId: string }
  | { type: 'SET_ACTIVE_AGENT'; agentId: string }
  | { type: 'CREATE_AGENT'; presetId: AgentPresetId }
  | { type: 'UPDATE_AGENT'; agentId: string; patch: Partial<AgentItem> }
  | { type: 'DELETE_AGENT'; agentId: string }
  | { type: 'START_AGENT_RUN'; run: AgentRun }
  | {
      type: 'COMPLETE_AGENT_RUN'
      runId: string
      agentId: string
      task: string
      assistantText: string
      provider: string
      model: string
    }
  | { type: 'FAIL_AGENT_RUN'; runId: string; agentId: string; error: string }
  | { type: 'RESET_ALL' }

function pushActivity(items: ActivityItem[], entry: Omit<ActivityItem, 'id' | 'createdAt'>) {
  return [{ id: createId('activity'), createdAt: nowIso(), ...entry }, ...items].slice(0, 120)
}

function getRootFolderId(state: RuntimeState) {
  return state.files.items.find((item) => item.kind === 'folder' && item.parentId === null)?.id ?? null
}

export function getActiveThread(state: RuntimeState) {
  return state.chats.threads.find((thread) => thread.id === state.chats.activeThreadId) ?? state.chats.threads[0]
}

function updateActiveThread(state: RuntimeState, nextThread: ChatThread) {
  return state.chats.threads.map((thread) => (thread.id === nextThread.id ? nextThread : thread))
}

function appendChatMessage(
  state: RuntimeState,
  prompt: string,
  assistantText: string,
  provider?: string,
  model?: string,
) {
  const activeThread = getActiveThread(state)
  const createdAt = nowIso()
  const userMessage: ChatMessage = {
    id: createId('message'),
    role: 'master',
    speaker: '마스터',
    text: prompt,
    createdAt,
  }

  const assistantMessage: ChatMessage = {
    id: createId('message'),
    role: 'assistant',
    speaker: state.settings.agentName,
    text: assistantText,
    createdAt: nowIso(),
    provider,
    model,
  }

  const nextThread: ChatThread = {
    ...activeThread,
    title: activeThread.messages.length === 0 ? prompt.slice(0, 22) : activeThread.title,
    updatedAt: createdAt,
    messages: [...activeThread.messages, userMessage, assistantMessage],
  }

  return { nextThread }
}

export function runtimeReducer(state: RuntimeState, action: Action): RuntimeState {
  switch (action.type) {
    case 'SET_COMPOSER':
      return {
        ...state,
        chats: { ...state.chats, composerText: action.text },
      }

    case 'CREATE_THREAD': {
      const createdAt = nowIso()
      const threadId = createId('thread')
      const thread: ChatThread = {
        id: threadId,
        title: '새 채팅',
        createdAt,
        updatedAt: createdAt,
        messages: [],
      }

      return {
        ...state,
        chats: {
          ...state.chats,
          activeThreadId: threadId,
          composerText: '',
          threads: [thread, ...state.chats.threads],
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'chat',
            title: '새 채팅 생성',
            detail: thread.title,
            page: 'chat',
          }),
        },
      }
    }

    case 'RUN_PROMPT': {
      const prompt = action.prompt.trim()
      if (!prompt) {
        return state
      }

      const { nextThread } = appendChatMessage(
        state,
        prompt,
        action.assistantText?.trim() || '모델 응답이 비어 있습니다.',
        action.provider,
        action.model,
      )

      return {
        ...state,
        chats: {
          ...state.chats,
          composerText: '',
          threads: updateActiveThread(state, nextThread),
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'chat',
            title: '채팅 요청 실행',
            detail: prompt,
            page: 'chat',
          }),
        },
      }
    }

    case 'APPEND_CHAT_ERROR': {
      const prompt = action.prompt.trim()
      if (!prompt) {
        return state
      }

      const { nextThread } = appendChatMessage(
        state,
        prompt,
        `요청 처리에 실패했습니다.\n\n${action.error}`,
      )

      return {
        ...state,
        chats: {
          ...state.chats,
          composerText: '',
          threads: updateActiveThread(state, nextThread),
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'chat',
            title: '채팅 실행 실패',
            detail: action.error,
            page: 'chat',
          }),
        },
      }
    }

    case 'CREATE_FOLDER': {
      const createdAt = nowIso()
      const folder: StoredFile = {
        id: createId('folder'),
        kind: 'folder',
        name: action.name.trim() || '새 폴더',
        parentId: action.parentId,
        mimeType: 'inode/directory',
        content: '',
        size: 0,
        createdAt,
        updatedAt: createdAt,
        source: 'manual',
      }

      return {
        ...state,
        files: {
          ...state.files,
          items: [...state.files.items, folder],
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'file',
            title: '폴더 생성',
            detail: folder.name,
            page: 'files',
          }),
        },
      }
    }

    case 'ADD_FILES': {
      const createdAt = nowIso()
      const files = action.files.map<StoredFile>((file) => ({
        id: createId('file'),
        kind: 'file',
        name: file.name,
        parentId: state.files.activeFolderId ?? getRootFolderId(state),
        mimeType: file.mimeType,
        content: file.content,
        size: file.size,
        createdAt,
        updatedAt: createdAt,
        source: file.source,
      }))

      return {
        ...state,
        files: {
          ...state.files,
          items: [...state.files.items, ...files],
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'file',
            title: '파일 업로드',
            detail: `${files.length}개 파일을 추가했습니다.`,
            page: 'files',
          }),
        },
      }
    }

    case 'SET_ACTIVE_FOLDER':
      return {
        ...state,
        files: { ...state.files, activeFolderId: action.folderId },
      }

    case 'TOGGLE_TOOL': {
      const nextTools = state.tools.items.map((item) =>
        item.id === action.toolId ? { ...item, enabled: !item.enabled } : item,
      )
      const target = nextTools.find((item) => item.id === action.toolId)
      if (!target) {
        return state
      }

      return {
        ...state,
        tools: { items: nextTools },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'tool',
            title: target.enabled ? '스킬 활성화' : '스킬 비활성화',
            detail: target.title,
            page: 'tools',
          }),
        },
      }
    }

    case 'SYNC_TOOL_CATALOG': {
      const previousEnabled = new Map(state.tools.items.map((item) => [item.id, item.enabled]))
      return {
        ...state,
        tools: {
          items: action.items.map((item) => ({
            ...item,
            enabled: previousEnabled.get(item.id) ?? item.enabled,
          })),
        },
      }
    }

    case 'MARK_INSIGHT':
      return {
        ...state,
        insights: {
          items: state.insights.items.map((item) =>
            item.id === action.insightId ? { ...item, status: action.status } : item,
          ),
        },
      }

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.patch },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'settings',
            title: '설정 업데이트',
            detail: '환경 설정을 변경했습니다.',
            page: 'settings',
          }),
        },
      }

    case 'SELECT_CHAT_MODEL':
      return {
        ...state,
        settings: {
          ...state.settings,
          modelProvider: action.provider,
          codexModel: action.provider === 'codex' ? action.model : state.settings.codexModel,
          ollamaModel: action.provider === 'ollama' ? action.model : state.settings.ollamaModel,
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'agent',
            title: '채팅 모델 전환',
            detail: `${action.provider} / ${action.model}`,
            page: 'chat',
          }),
        },
      }

    case 'ADD_API_KEY': {
      const item: ApiKeyItem = {
        id: createId('key'),
        label: action.label.trim() || '새 API 키',
        value: action.key.trim(),
        maskedKey: maskKey(action.key),
        createdAt: nowIso(),
      }

      return {
        ...state,
        apiKeys: [item, ...state.apiKeys],
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'settings',
            title: 'API 키 추가',
            detail: item.label,
            page: 'settings',
          }),
        },
      }
    }

    case 'REMOVE_API_KEY':
      return {
        ...state,
        agents: {
          ...state.agents,
          items: state.agents.items.map((agent) =>
            agent.apiKeyId === action.keyId ? { ...agent, apiKeyId: null } : agent,
          ),
        },
        apiKeys: state.apiKeys.filter((item) => item.id !== action.keyId),
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'settings',
            title: 'API 키 삭제',
            detail: '저장된 API 키를 제거했습니다.',
            page: 'settings',
          }),
        },
      }

    case 'ADD_SIGNAL': {
      const signal: SignalItem = {
        id: createId('signal'),
        title: action.title.trim() || '새 시그널',
        category: action.category.trim() || 'AI 및 기술',
        description: action.description.trim() || '직접 추가한 관심 시그널입니다.',
        subscribed: true,
        createdAt: nowIso(),
      }

      return {
        ...state,
        signals: { items: [signal, ...state.signals.items] },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'signal',
            title: '시그널 추가',
            detail: signal.title,
            page: 'signals',
          }),
        },
      }
    }

    case 'TOGGLE_SIGNAL':
      return {
        ...state,
        signals: {
          items: state.signals.items.map((item) =>
            item.id === action.signalId ? { ...item, subscribed: !item.subscribed } : item,
          ),
        },
      }

    case 'SET_ACTIVE_AGENT':
      return {
        ...state,
        agents: { ...state.agents, activeAgentId: action.agentId },
      }

    case 'CREATE_AGENT': {
      const nextAgent = buildAgentFromPreset(action.presetId)
      return {
        ...state,
        agents: {
          ...state.agents,
          activeAgentId: nextAgent.id,
          items: [nextAgent, ...state.agents.items],
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'agent',
            title: '에이전트 생성',
            detail: nextAgent.name,
            page: 'settings',
          }),
        },
      }
    }

    case 'UPDATE_AGENT':
      return {
        ...state,
        agents: {
          ...state.agents,
          items: state.agents.items.map((agent) =>
            agent.id === action.agentId ? { ...agent, ...action.patch } : agent,
          ),
        },
      }

    case 'DELETE_AGENT': {
      if (state.agents.items.length <= 1) {
        return state
      }

      const items = state.agents.items.filter((agent) => agent.id !== action.agentId)
      const activeAgentId =
        state.agents.activeAgentId === action.agentId
          ? items[0]?.id ?? state.agents.activeAgentId
          : state.agents.activeAgentId

      return {
        ...state,
        agents: {
          ...state.agents,
          activeAgentId,
          items,
          runs: state.agents.runs.filter((run) => run.agentId !== action.agentId),
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'agent',
            title: '에이전트 삭제',
            detail: action.agentId,
            page: 'settings',
          }),
        },
      }
    }

    case 'START_AGENT_RUN':
      return {
        ...state,
        agents: {
          ...state.agents,
          activeAgentId: action.run.agentId,
          items: state.agents.items.map((agent) =>
            agent.id === action.run.agentId
              ? { ...agent, status: 'running', lastRunAt: action.run.startedAt }
              : agent,
          ),
          runs: [action.run, ...state.agents.runs].slice(0, 40),
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'agent',
            title: '오케스트레이션 실행 시작',
            detail: action.run.task,
            page: 'agents',
          }),
        },
      }

    case 'COMPLETE_AGENT_RUN': {
      const createdAt = nowIso()
      return {
        ...state,
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'agent',
            title: '오케스트레이션 실행 완료',
            detail: action.task,
            page: 'agents',
          }),
        },
        agents: {
          ...state.agents,
          items: state.agents.items.map((agent) =>
            agent.id === action.agentId
              ? { ...agent, status: 'success', lastRunAt: createdAt }
              : agent,
          ),
          runs: state.agents.runs.map((run) =>
            run.id === action.runId
              ? {
                  ...run,
                  provider: action.provider,
                  model: action.model,
                  status: 'success',
                  finishedAt: createdAt,
                  output: action.assistantText,
                  logs: [
                    ...run.logs,
                    {
                      id: createId('log'),
                      createdAt,
                      level: 'success',
                      message: `${action.provider} 응답을 정상적으로 수신했습니다.`,
                    },
                  ],
                }
              : run,
          ),
        },
      }
    }

    case 'FAIL_AGENT_RUN': {
      const createdAt = nowIso()
      return {
        ...state,
        agents: {
          ...state.agents,
          items: state.agents.items.map((agent) =>
            agent.id === action.agentId
              ? { ...agent, status: 'error', lastRunAt: createdAt }
              : agent,
          ),
          runs: state.agents.runs.map((run) =>
            run.id === action.runId
              ? {
                  ...run,
                  status: 'error',
                  finishedAt: createdAt,
                  output: action.error,
                  logs: [
                    ...run.logs,
                    {
                      id: createId('log'),
                      createdAt,
                      level: 'error',
                      message: action.error,
                    },
                  ],
                }
              : run,
          ),
        },
        activity: {
          items: pushActivity(state.activity.items, {
            type: 'agent',
            title: '오케스트레이션 실행 실패',
            detail: action.error,
            page: 'agents',
          }),
        },
      }
    }

    case 'RESET_ALL':
      return resetRuntimeState()

    default:
      return state
  }
}

export function readFiles(files: FileList) {
  return Promise.all(
    Array.from(files).map(async (file) => {
      let content = ''

      if (
        file.type.startsWith('text/') ||
        ['.md', '.txt', '.json', '.csv'].some((suffix) => file.name.endsWith(suffix))
      ) {
        content = await file.text()
      }

      return {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        content,
        size: file.size,
        source: 'upload' as const,
      }
    }),
  )
}
