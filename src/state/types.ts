import type { AiRoutingMessageMeta } from '../lib/aiRoutingClient'
import type { SettingsTab } from '../crewData'

export type ChatRole = 'master' | 'assistant' | 'tool'

export type ChatMessage = {
  id: string
  role: ChatRole
  speaker: string
  text: string
  createdAt: string
  intent?: string
  provider?: string
  model?: string
  routingMeta?: AiRoutingMessageMeta
}

export type ChatThread = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

export type FileKind = 'file' | 'folder'

export type StoredFile = {
  id: string
  kind: FileKind
  name: string
  parentId: string | null
  mimeType: string
  content: string
  size: number
  createdAt: string
  updatedAt: string
  source: 'upload' | 'generated' | 'manual'
  tag?: string
}

export type ToolItem = {
  id: string
  section: string
  title: string
  description: string
  example: string
  enabled: boolean
  source: 'local-skill' | 'plugin-skill'
  path: string
  originLabel: string
}

export type AgentProviderKind =
  | 'ollama'
  | 'codex'
  | 'official-router'
  | 'openai-compatible'
  | 'anthropic'

export type AgentPresetId =
  | 'ollama-local'
  | 'codex-cli'
  | 'official-router'
  | 'openai-direct'
  | 'gemini-openai'
  | 'claude-anthropic'
  | 'openrouter-free'
  | 'aihubmix-free'
  | 'nvidia-trial'
  | 'custom-openai'

export type ApiKeyTargetPresetId =
  | 'openai-direct'
  | 'gemini-openai'
  | 'claude-anthropic'
  | 'openrouter-free'
  | 'aihubmix-free'
  | 'nvidia-trial'
  | 'custom-openai'

export type AgentStatus = 'idle' | 'running' | 'success' | 'error'

export type AgentCapability =
  | 'chat'
  | 'files'
  | 'web'
  | 'automation'
  | 'code'

export type AgentItem = {
  id: string
  name: string
  role: string
  description: string
  provider: AgentProviderKind
  preset: AgentPresetId
  model: string
  baseUrl: string
  apiKeyId: string | null
  systemPrompt: string
  enabled: boolean
  capabilities: AgentCapability[]
  status: AgentStatus
  lastRunAt: string | null
}

export type AgentRunLog = {
  id: string
  createdAt: string
  level: 'info' | 'success' | 'error'
  message: string
}

export type AgentRun = {
  id: string
  agentId: string
  task: string
  provider: string
  model: string
  status: AgentStatus
  startedAt: string
  finishedAt: string | null
  output: string
  logs: AgentRunLog[]
}

export type ActivityType =
  | 'chat'
  | 'file'
  | 'tool'
  | 'insight'
  | 'settings'
  | 'signal'
  | 'agent'

export type ActivityItem = {
  id: string
  type: ActivityType
  title: string
  detail: string
  page: string
  createdAt: string
}

export type InsightStatus = 'unread' | 'read' | 'archived'

export type InsightItem = {
  id: string
  title: string
  detail: string
  status: InsightStatus
  createdAt: string
  source: 'chat' | 'system' | 'signal'
}

export type SignalItem = {
  id: string
  title: string
  category: string
  description: string
  subscribed: boolean
  createdAt: string
}

export type ApiKeyItem = {
  id: string
  label: string
  presetId: ApiKeyTargetPresetId
  value: string
  maskedKey: string
  createdAt: string
}

export type SettingsState = {
  activeTab: SettingsTab
  agentName: string
  tone: string
  responseStyle: string
  userName: string
  userRole: string
  organization: string
  interests: string[]
  customInstructions: string
  theme: 'light' | 'dark' | 'system'
  language: string
  timezone: string
  locationSharing: boolean
  modelProvider: 'auto' | 'ollama' | 'codex'
  ollamaModel: string
  codexModel: string
  bridgeUrl: string
}

export type OrchestrationState = {
  draftTask: string
  selectedAgentIds: string[]
  sessionStartedAt: string | null
  sessionAgentIds: string[]
  sessionTask: string
}

export type RuntimeState = {
  chats: {
    activeThreadId: string
    threads: ChatThread[]
    composerText: string
  }
  files: {
    items: StoredFile[]
    activeFolderId: string | null
  }
  tools: {
    items: ToolItem[]
  }
  activity: {
    items: ActivityItem[]
  }
  insights: {
    items: InsightItem[]
  }
  signals: {
    items: SignalItem[]
  }
  agents: {
    activeAgentId: string
    items: AgentItem[]
    runs: AgentRun[]
  }
  settings: SettingsState
  apiKeys: ApiKeyItem[]
  orchestration: OrchestrationState
}

export type EngineArtifact = {
  files?: Array<Pick<StoredFile, 'name' | 'content' | 'mimeType' | 'source' | 'tag'>>
  insights?: Array<Pick<InsightItem, 'title' | 'detail' | 'source'>>
  activities?: Array<Pick<ActivityItem, 'type' | 'title' | 'detail' | 'page'>>
}

export type EngineResult = {
  intent: 'document' | 'automation' | 'coding' | 'translation' | 'files' | 'general'
  assistantText: string
  toolText?: string
  toolLabel?: string
  artifacts: EngineArtifact
}
