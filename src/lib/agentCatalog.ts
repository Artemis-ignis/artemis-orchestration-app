import type {
  AgentCapability,
  AgentItem,
  AgentPresetId,
  AgentProviderKind,
} from '../state/types'

export const OLLAMA_LOCAL_MODEL = 'gemma4-E4B-uncensored-q4fast:latest'

export type AgentPreset = {
  id: AgentPresetId
  label: string
  provider: AgentProviderKind
  baseUrl: string
  model: string
  description: string
  requiresApiKey: boolean
  officialUrl: string
  recommendedModels: string[]
  capabilities: AgentCapability[]
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: 'codex-cli',
    label: 'Codex CLI',
    provider: 'codex',
    baseUrl: '',
    model: 'gpt-5.4',
    description: '로컬 Codex CLI와 ChatGPT 로그인으로 코드 작업과 실전형 질의를 처리합니다.',
    requiresApiKey: false,
    officialUrl: 'https://developers.openai.com/codex/cli',
    recommendedModels: ['gpt-5.4', 'gpt-5.4-mini'],
    capabilities: ['chat', 'code', 'files'],
  },
  {
    id: 'official-router',
    label: '공식 무료 라우터',
    provider: 'official-router',
    baseUrl: '',
    model: 'auto-best-free',
    description:
      'OpenRouter, NVIDIA Build, Gemini Developer API의 무료 후보를 자동 선택하고 실패 시 다음 후보로 자동 폴백합니다.',
    requiresApiKey: false,
    officialUrl: '',
    recommendedModels: [
      'auto-best-free',
      'auto-best-free-coding',
      'auto-best-free-fast',
      'manual',
    ],
    capabilities: ['chat', 'code', 'files', 'web', 'automation'],
  },
  {
    id: 'openai-direct',
    label: 'OpenAI GPT',
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.4',
    description: 'OpenAI API로 실제 GPT 계열 모델을 직접 연결합니다.',
    requiresApiKey: true,
    officialUrl: 'https://platform.openai.com/docs/api-reference/chat',
    recommendedModels: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1-mini'],
    capabilities: ['chat', 'files', 'automation', 'code'],
  },
  {
    id: 'ollama-local',
    label: 'Ollama 로컬',
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: OLLAMA_LOCAL_MODEL,
    description: '내 PC의 Ollama 모델로 빠른 초안, 요약, 로컬 작업을 처리합니다.',
    requiresApiKey: false,
    officialUrl: 'https://ollama.com/library',
    recommendedModels: [OLLAMA_LOCAL_MODEL],
    capabilities: ['chat', 'files', 'code'],
  },
  {
    id: 'gemini-openai',
    label: 'Gemini API',
    provider: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    description: 'Gemini OpenAI 호환 인터페이스를 통해 실제 Gemini 모델을 연결합니다.',
    requiresApiKey: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    recommendedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    capabilities: ['chat', 'files', 'automation'],
  },
  {
    id: 'claude-anthropic',
    label: 'Claude API',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    description: 'Anthropic Messages API를 통해 실제 Claude 모델을 연결합니다.',
    requiresApiKey: true,
    officialUrl: 'https://docs.anthropic.com/en/api/messages',
    recommendedModels: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
    capabilities: ['chat', 'files', 'automation'],
  },
  {
    id: 'openrouter-free',
    label: 'OpenRouter 무료 모델',
    provider: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    description: 'OpenRouter 무료 라우터를 통해 공개 무료 모델을 연결합니다.',
    requiresApiKey: true,
    officialUrl: 'https://openrouter.ai/docs/guides/routing/routers/free-models-router',
    recommendedModels: [
      'openrouter/free',
      'qwen/qwen3-coder:free',
      'deepseek/deepseek-r1:free',
    ],
    capabilities: ['chat', 'web', 'automation'],
  },
  {
    id: 'aihubmix-free',
    label: 'AIHubMix 무료 모델',
    provider: 'openai-compatible',
    baseUrl: 'https://aihubmix.com/v1',
    model: 'coding-glm-4.7-free',
    description: 'AIHubMix의 OpenAI 호환 무료 모델을 연결합니다.',
    requiresApiKey: true,
    officialUrl: 'https://docs.aihubmix.com/en/api/Opencode',
    recommendedModels: [
      'coding-glm-4.7-free',
      'coding-minimax-m2.1-free',
      'Qwen/Qwen3-30B-A3B',
    ],
    capabilities: ['chat', 'code', 'automation'],
  },
  {
    id: 'nvidia-trial',
    label: 'NVIDIA NIM',
    provider: 'openai-compatible',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/llama3-chatqa-1.5-70b',
    description: 'NVIDIA의 OpenAI 호환 추론 API를 연결합니다.',
    requiresApiKey: true,
    officialUrl: 'https://docs.api.nvidia.com/nim/reference/llm-apis',
    recommendedModels: [
      'nvidia/llama3-chatqa-1.5-70b',
      'moonshotai/kimi-k2-5',
      'qwen/qwen2-7b-instruct',
    ],
    capabilities: ['chat', 'web'],
  },
  {
    id: 'custom-openai',
    label: '사용자 지정',
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    description: 'OpenAI 호환 규격이면 어떤 공급자든 직접 연결할 수 있습니다.',
    requiresApiKey: true,
    officialUrl: 'https://platform.openai.com/docs/api-reference/chat',
    recommendedModels: ['gpt-4.1-mini'],
    capabilities: ['chat', 'files', 'automation'],
  },
]

export function getAgentPreset(id: AgentPresetId) {
  return AGENT_PRESETS.find((preset) => preset.id === id) ?? AGENT_PRESETS[0]
}

export function buildAgentFromPreset(
  id: AgentPresetId,
  overrides?: Partial<Pick<AgentItem, 'id' | 'name' | 'role' | 'description' | 'systemPrompt'>>,
): AgentItem {
  const preset = getAgentPreset(id)
  const agentId = overrides?.id ?? `agent-${crypto.randomUUID()}`

  return {
    id: agentId,
    name: overrides?.name ?? preset.label,
    role: overrides?.role ?? '실행 에이전트',
    description: overrides?.description ?? preset.description,
    provider: preset.provider,
    preset: preset.id,
    model: preset.model,
    baseUrl: preset.baseUrl,
    apiKeyId: null,
    systemPrompt:
      overrides?.systemPrompt ??
      '항상 한국어로 답하고, 결론부터 간결하고 실무적으로 정리합니다. 필요하면 실행 결과와 다음 조치를 분리해서 제시합니다.',
    enabled: true,
    capabilities: preset.capabilities,
    status: 'idle',
    lastRunAt: null,
  }
}

export function getAgentProviderLabel(provider: AgentProviderKind) {
  switch (provider) {
    case 'codex':
      return 'Codex CLI'
    case 'ollama':
      return 'Ollama'
    case 'official-router':
      return '공식 무료 라우터'
    case 'anthropic':
      return 'Anthropic'
    default:
      return 'OpenAI 호환'
  }
}
