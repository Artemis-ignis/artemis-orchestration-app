import type {
  AgentItem,
  ApiKeyItem,
  ChatMessage,
  SettingsState,
  ToolItem,
} from '../state/types'

export type ProviderStatus = {
  provider: 'ollama' | 'codex'
  available: boolean
  ready: boolean
  models: string[]
  detail: string
}

export type BridgeHealth = {
  ok: boolean
  defaultProvider: 'auto' | 'ollama' | 'codex'
  providers: ProviderStatus[]
}

export type ExecuteResponse = {
  ok: boolean
  provider: string
  model: string
  text: string
  workspace: ExecuteWorkspaceContext
}

export type ExecuteFileChange = {
  relativePath: string
  absolutePath: string
  changeType: 'created' | 'modified' | 'deleted'
  size: number
  updatedAt: string
}

export type ExecuteWorkspaceContext = {
  rootPath: string
  cwdPath: string
  cwdRelativePath: string
  changedAt: string
  changedFiles: ExecuteFileChange[]
  changeDetectionLimited: boolean
}

export type SignalFeedItem = {
  id: string
  title: string
  summary: string
  originalTitle?: string
  originalSummary?: string
  translationSource?: 'original' | 'codex' | 'ollama' | 'google-gtx'
  url: string
  source: string
  category: string
  publishedAt: string
}

export type SignalFeedResponse = {
  ok: boolean
  generatedAt: string
  items: SignalFeedItem[]
}

export type BridgeSkillItem = Pick<
  ToolItem,
  'id' | 'section' | 'title' | 'description' | 'example' | 'path' | 'source' | 'originLabel'
>

export type SkillsResponse = {
  ok: boolean
  generatedAt: string
  items: BridgeSkillItem[]
}

function describeEndpoint(input: string) {
  try {
    return new URL(input, window.location.origin).origin
  } catch {
    return '로컬 브리지'
  }
}

async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = 15_000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    const endpoint = describeEndpoint(input)

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`${endpoint} 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.`)
    }

    if (error instanceof TypeError) {
      throw new Error(`${endpoint}에 연결하지 못했습니다. 로컬 브리지 실행 상태를 확인해 주세요.`)
    }

    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

function resolveApiKeyValue(apiKeys: ApiKeyItem[], apiKeyId: string | null) {
  if (!apiKeyId) {
    return ''
  }

  return apiKeys.find((item) => item.id === apiKeyId)?.value ?? ''
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()

  if (!response.ok) {
    try {
      const parsed = JSON.parse(text) as { error?: string }
      throw new Error(parsed.error || `요청이 실패했습니다. (${response.status})`)
    } catch {
      throw new Error(text || `요청이 실패했습니다. (${response.status})`)
    }
  }

  return JSON.parse(text) as T
}

export async function fetchBridgeHealth(bridgeUrl: string) {
  const response = await fetchWithTimeout(`${bridgeUrl}/api/health`, undefined, 10_000)
  return readJson<BridgeHealth>(response)
}

export async function fetchSignalsFeed({
  bridgeUrl,
  category,
}: {
  bridgeUrl: string
  category?: string
}) {
  const query = new URLSearchParams()

  if (category && category !== '전체') {
    query.set('category', category)
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  const response = await fetchWithTimeout(`${bridgeUrl}/api/signals${suffix}`, undefined, 45_000)
  return readJson<SignalFeedResponse>(response)
}

export async function fetchSkillCatalog(bridgeUrl: string) {
  const response = await fetchWithTimeout(`${bridgeUrl}/api/skills`, undefined, 20_000)
  return readJson<SkillsResponse>(response)
}

export const fetchSkillsCatalog = fetchSkillCatalog

export async function executeModelPrompt({
  bridgeUrl,
  prompt,
  messages,
  settings,
  agent,
  apiKeys = [],
  enabledTools = [],
  rootPath,
  cwdPath,
}: {
  bridgeUrl: string
  prompt: string
  messages: Array<Pick<ChatMessage, 'role' | 'text'>>
  settings: SettingsState
  agent?: AgentItem
  apiKeys?: ApiKeyItem[]
  enabledTools?: ToolItem[]
  rootPath?: string
  cwdPath?: string
}) {
  const response = await fetchWithTimeout(
    `${bridgeUrl}/api/execute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        provider: agent?.provider ?? settings.modelProvider,
        prompt,
        messages,
        settings: {
          agentName: settings.agentName,
          tone: settings.tone,
          responseStyle: settings.responseStyle,
          customInstructions: settings.customInstructions,
          userName: settings.userName,
          userRole: settings.userRole,
          organization: settings.organization,
          interests: settings.interests,
          language: settings.language,
          timezone: settings.timezone,
          locationSharing: settings.locationSharing,
          modelProvider: settings.modelProvider,
          ollamaModel: settings.ollamaModel,
          codexModel: settings.codexModel,
        },
        enabledTools: enabledTools.map((item) => ({
          title: item.title,
          section: item.section,
          description: item.description,
          path: item.path,
          originLabel: item.originLabel,
        })),
        agent: agent
          ? {
              id: agent.id,
              name: agent.name,
              provider: agent.provider,
              preset: agent.preset,
              model: agent.model,
              baseUrl: agent.baseUrl,
              systemPrompt: agent.systemPrompt,
              apiKey: resolveApiKeyValue(apiKeys, agent.apiKeyId),
            }
          : undefined,
        rootPath,
        cwdPath,
      }),
    },
    260_000,
  )

  return readJson<ExecuteResponse>(response)
}
