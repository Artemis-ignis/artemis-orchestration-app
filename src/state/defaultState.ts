import { buildAgentFromPreset } from '../lib/agentCatalog'
import type { RuntimeState } from './types'

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function nowMinus(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export function buildInitialAgents() {
  const codexAgent = buildAgentFromPreset('codex-cli', {
    id: 'agent-codex',
    name: 'GPT-5.4 (Codex CLI)',
    role: '코딩 에이전트',
    description: '로컬 Codex CLI로 코드 작성, 수정, 구조 분석을 처리합니다.',
  })

  const openAiAgent = buildAgentFromPreset('openai-direct', {
    id: 'agent-openai',
    name: 'GPT-5.4 (OpenAI API)',
    role: 'OpenAI 에이전트',
    description: 'OpenAI API로 실제 GPT 모델과 직접 연결합니다.',
  })

  const geminiAgent = buildAgentFromPreset('gemini-openai', {
    id: 'agent-gemini',
    name: 'Gemini 2.5 Flash (Google)',
    role: 'Gemini 에이전트',
    description: 'Gemini OpenAI 호환 API로 빠른 분석과 요약을 처리합니다.',
  })

  const claudeAgent = buildAgentFromPreset('claude-anthropic', {
    id: 'agent-claude',
    name: 'Claude Sonnet 4 (Anthropic)',
    role: 'Claude 에이전트',
    description: 'Anthropic Messages API로 실제 Claude 모델과 연결합니다.',
  })

  const ollamaAgent = buildAgentFromPreset('ollama-local', {
    id: 'agent-ollama',
    name: 'gemma4:e2b (Ollama)',
    role: '로컬 모델 에이전트',
    description: 'Ollama 로컬 모델로 빠른 초안, 요약, 정리 작업을 처리합니다.',
  })

  return [codexAgent, openAiAgent, geminiAgent, claudeAgent, ollamaAgent]
}

export function createDefaultState(): RuntimeState {
  const activeThreadId = createId('thread')
  const initialAgents = buildInitialAgents()

  return {
    chats: {
      activeThreadId,
      composerText: '',
      threads: [
        {
          id: activeThreadId,
          title: '새 채팅',
          createdAt: nowMinus(2),
          updatedAt: nowMinus(2),
          messages: [],
        },
      ],
    },
    files: {
      items: [],
      activeFolderId: null,
    },
    tools: {
      items: [],
    },
    activity: {
      items: [],
    },
    insights: {
      items: [],
    },
    signals: {
      items: [],
    },
    agents: {
      activeAgentId: initialAgents[0].id,
      items: initialAgents,
      runs: [],
    },
    settings: {
      activeTab: 'profile',
      agentName: '아르테미스',
      tone: '차분하고 실무적인 개인 비서',
      responseStyle: '결론부터 간결하게',
      userName: '마스터',
      userRole: '프로덕트 오너',
      organization: 'Artemis Workspace',
      interests: ['AI 오케스트레이션', '개발 자동화'],
      customInstructions:
        '항상 한국어로 답하고, 실행 가능한 결과와 다음 조치를 먼저 제시합니다.',
      theme: 'dark',
      language: '한국어',
      timezone: 'Asia/Seoul',
      locationSharing: false,
      modelProvider: 'codex',
      ollamaModel: 'gemma4:e2b',
      codexModel: 'gpt-5.4',
      bridgeUrl: 'http://127.0.0.1:4174',
    },
    apiKeys: [],
  }
}
