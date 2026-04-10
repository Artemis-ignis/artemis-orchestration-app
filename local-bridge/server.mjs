import http from 'node:http'
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createWorkspaceFolder,
  deleteWorkspaceEntry,
  getDefaultWorkspace,
  listWorkspace,
  readWorkspaceFileContent,
  resolveWorkspaceRoot,
  resolveWorkspaceTarget,
  revealWorkspacePath,
  uploadWorkspaceFiles,
  writeWorkspaceFileContent,
} from './workspace.mjs'

const HOST = '127.0.0.1'
const PORT = Number(process.env.ARTEMIS_BRIDGE_PORT ?? 4174)
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const USER_HOME = process.env.USERPROFILE ?? os.homedir()
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(USER_HOME, '.codex')
const DEFAULT_CODEX_PATH =
  process.env.ARTEMIS_CODEX_PATH ??
  path.join(USER_HOME, '.codex', '.sandbox-bin', 'codex.exe')

const CATEGORY_TO_CODE = {
  전체: 'all',
  'AI 및 기술': 'ai',
  연구: 'research',
  오픈소스: 'opensource',
  비즈니스: 'business',
}

const CODE_TO_CATEGORY = {
  all: '전체',
  ai: 'AI 및 기술',
  research: '연구',
  opensource: '오픈소스',
  business: '비즈니스',
}

const SOURCE_LABELS = {
  'Hacker News': '해커 뉴스',
  GitHub: 'GitHub',
  arXiv: 'arXiv',
}

const SIGNAL_QUERIES = {
  ai: {
    hackerNews: ['AI agent LLM', 'open source model'],
    github: ['agent llm in:name,description', 'ai tooling in:name,description'],
    arxiv: ['cat:cs.AI OR cat:cs.CL'],
  },
  research: {
    hackerNews: ['ML research'],
    github: ['research agent in:name,description'],
    arxiv: ['cat:cs.LG OR cat:cs.AI'],
  },
  opensource: {
    hackerNews: ['open source AI'],
    github: ['open source ai agent in:name,description'],
    arxiv: [],
  },
  business: {
    hackerNews: ['AI startup funding', 'enterprise AI'],
    github: ['enterprise ai in:name,description'],
    arxiv: [],
  },
}

const signalTranslationCache = new Map()
const signalTranslationInFlight = new Set()
const signalFeedCache = new Map()
let cachedSkillCatalog = { generatedAt: '', items: [] }
let cachedSkillCatalogExpiresAt = 0
const SIGNAL_FETCH_TIMEOUT_MS = 8_000
const SIGNAL_TRANSLATION_TIMEOUT_MS = 28_000
const PER_SIGNAL_TRANSLATION_TIMEOUT_MS = 15_000
const SIGNAL_RESULT_LIMIT = 6
const SIGNAL_CACHE_TTL_MS = 45_000
const EXECUTION_TIMEOUT_MS = 240_000
const SIGNAL_CODEX_TRANSLATION_MODEL = 'gpt-5.4-mini'

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

function getErrorStatus(error) {
  if (!(error instanceof Error)) {
    return 500
  }

  const message = error.message.toLowerCase()

  if (
    message.includes('api key') ||
    message.includes('base url') ||
    message.includes('ollama') ||
    message.includes('작업 폴더') ||
    message.includes('경로') ||
    message.includes('지원하지 않는')
  ) {
    return 400
  }

  return 500
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []

    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    request.on('end', () => {
      const raw = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : ''

      if (!raw) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })

    request.on('error', reject)
  })
}

function stripTrailingSlash(value = '') {
  return value.replace(/\/+$/, '')
}

function joinUrl(baseUrl, suffix) {
  if (!baseUrl) {
    return suffix
  }

  if (baseUrl.endsWith('/chat/completions')) {
    return baseUrl
  }

  return `${stripTrailingSlash(baseUrl)}${suffix}`
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('응답 대기 시간이 초과되었습니다.')
    }

    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, options = {}, timeoutMs = 12_000) {
  const response = await fetchWithTimeout(url, options, timeoutMs)

  if (!response.ok) {
    throw new Error(`요청이 실패했습니다. (${response.status})`)
  }

  return response.json()
}

async function raceWithTimeout(promise, timeoutMs, message) {
  let timer

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function decodeHtml(value = '') {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripHtml(value = '') {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function executionProviderLabel(provider) {
  switch (provider) {
    case 'codex':
      return 'Codex CLI'
    case 'ollama':
      return 'Ollama'
    case 'anthropic':
      return 'Anthropic API'
    case 'openai-compatible':
      return 'OpenAI 호환 API'
    default:
      return provider || '알 수 없음'
  }
}

function escapePowerShellLiteral(value = '') {
  return String(value).replace(/'/g, "''")
}

function extractXmlValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function extractXmlLink(block) {
  const atomMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i)

  if (atomMatch?.[1]) {
    return atomMatch[1]
  }

  return stripHtml(extractXmlValue(block, 'link'))
}

function normalizeCategory(value = '전체') {
  return CATEGORY_TO_CODE[value] ?? 'all'
}

function localizeSignalMeta(item) {
  return {
    ...item,
    source: SOURCE_LABELS[item.source] ?? item.source,
    category: CODE_TO_CATEGORY[item.category] ?? item.category,
  }
}

function hasKoreanText(value = '') {
  return /[가-힣]/.test(value)
}

function buildSignalFallback(item) {
  const originalSummary = stripHtml(item.summary || '').replace(/\s+/g, ' ').trim()
  const looksLikePlainUrl = /^https?:\/\//i.test(originalSummary)

  return {
    title: item.title,
    summary: originalSummary
      ? looksLikePlainUrl
        ? '원문 링크 중심 게시물입니다. 아래 원문 열기에서 자세한 내용을 확인할 수 있습니다.'
        : `원문 요약: ${originalSummary.slice(0, 220)}`
      : '원문 링크에서 자세한 내용을 확인할 수 있습니다.',
    translationSource: 'original',
  }
}

function finalizeSignalCopy(item, translated) {
  const fallback = buildSignalFallback(item)
  const title = typeof translated?.title === 'string' ? translated.title.trim() : ''
  const summary = typeof translated?.summary === 'string' ? translated.summary.trim() : ''

  return localizeSignalMeta({
    ...item,
    originalTitle: item.title,
    originalSummary: item.summary,
    title: title && hasKoreanText(title) ? title : fallback.title,
    summary: summary && hasKoreanText(summary) ? summary : fallback.summary,
    translationSource:
      title && hasKoreanText(title)
        ? translated?.translationSource || 'original'
        : fallback.translationSource,
  })
}

function parseLabeledSignalTranslation(text) {
  const normalized = text.trim()
  const title = normalized.match(/제목\s*:\s*(.+)/)?.[1]?.trim() ?? ''
  const summary = normalized.match(/요약\s*:\s*([\s\S]+)/)?.[1]?.trim() ?? ''

  if (!title && !summary) {
    return null
  }

  return { title, summary, translationSource: 'ollama' }
}

async function translateSignalItem(item, translationModel) {
  const originalSummary = stripHtml(item.summary || '').replace(/\s+/g, ' ').trim().slice(0, 220)

  const translateViaWeb = async (value) => {
    if (!value.trim()) {
      return ''
    }

    const query = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: 'ko',
      dt: 't',
      q: value,
    })

    const response = await fetchWithTimeout(
      `https://translate.googleapis.com/translate_a/single?${query.toString()}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      },
      6_000,
    )

    if (!response.ok) {
      throw new Error('실시간 번역 요청이 실패했습니다.')
    }

    const payload = await response.json()
    const segments = Array.isArray(payload?.[0]) ? payload[0] : []

    return segments
      .map((entry) => (Array.isArray(entry) && typeof entry[0] === 'string' ? entry[0] : ''))
      .join('')
      .trim()
  }

  try {
    const [title, summary] = await Promise.all([
      translateViaWeb(item.title),
      translateViaWeb(originalSummary),
    ])

    if (hasKoreanText(title) || hasKoreanText(summary)) {
      return {
        title: title || item.title,
        summary: summary || originalSummary,
        translationSource: 'google-gtx',
      }
    }
  } catch {
    // 웹 번역이 실패하면 로컬 모델 번역으로 넘어갑니다.
  }

  if (!translationModel) {
    return null
  }

  const prompt = [
    '다음 공개 피드 항목의 제목과 요약을 한국어로만 번역하세요.',
    '입력에 없는 사실을 추가하거나 추측하지 마세요.',
    '아래 형식 그대로만 답하세요.',
    '제목: ...',
    '요약: ...',
    `출처: ${SOURCE_LABELS[item.source] ?? item.source}`,
    `분류: ${CODE_TO_CATEGORY[item.category] ?? item.category}`,
    `원문 제목: ${item.title}`,
    `원문 요약: ${originalSummary}`,
  ].join('\n')

  try {
    const response = await raceWithTimeout(
      fetchWithTimeout(
        `${stripTrailingSlash(OLLAMA_URL)}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: translationModel,
            stream: false,
            options: {
              temperature: 0.1,
            },
            messages: [
              {
                role: 'system',
                content:
                  '당신은 공개 기술 피드 번역기입니다. 제목과 요약만 한국어로 번역하고, 반드시 `제목:`과 `요약:` 형식으로만 답하세요. 없는 정보는 만들지 마세요.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        },
        PER_SIGNAL_TRANSLATION_TIMEOUT_MS,
      ),
      PER_SIGNAL_TRANSLATION_TIMEOUT_MS + 1_000,
      '로컬 시그널 번역 시간이 초과되었습니다.',
    )

    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    const translatedText = payload?.message?.content?.trim() ?? ''
    return parseLabeledSignalTranslation(translatedText)
  } catch {
    return null
  }
}

async function getOllamaTags() {
  const response = await fetch(`${OLLAMA_URL}/api/tags`)

  if (!response.ok) {
    throw new Error(`Ollama 연결에 실패했습니다. (${response.status})`)
  }

  const data = await response.json()
  return Array.isArray(data.models) ? data.models.map((item) => item.name) : []
}

function spawnProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeoutMs = 0, input = null, ...spawnOptions } = options
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...spawnOptions,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let timer = null

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    if (typeof input === 'string') {
      child.stdin.write(input, 'utf8')
    }

    child.stdin.end()

    child.on('error', reject)
    child.on('close', (code) => {
      if (timer) {
        clearTimeout(timer)
      }

      resolve({ code, stdout, stderr, timedOut })
    })

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        stderr += '\n프로세스 응답 시간이 초과되었습니다.'
        child.kill()

        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 1500)
      }, timeoutMs)
    }
  })
}

async function getCodexStatus() {
  try {
    const result = await spawnProcess(DEFAULT_CODEX_PATH, ['login', 'status'])
    return {
      available: true,
      ready: result.code === 0 && /Logged in/i.test(result.stderr + result.stdout),
      detail: (result.stderr || result.stdout || 'Codex 로그인 상태를 확인하지 못했습니다.').trim(),
    }
  } catch (error) {
    return {
      available: false,
      ready: false,
      detail: error instanceof Error ? error.message : 'Codex CLI 실행에 실패했습니다.',
    }
  }
}

function normalizeMessages(messages = []) {
  return messages
    .filter((item) => item && typeof item.text === 'string')
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.text,
    }))
}

function buildSystemPrompt({ settings, agent, enabledTools = [], execution }) {
  const blocks = []

  if (agent?.systemPrompt) {
    blocks.push(agent.systemPrompt)
  } else {
    blocks.push('항상 한국어로 답하고, 결론부터 짧고 실무적으로 정리하세요.')
  }

  if (settings?.tone) {
    blocks.push(`말투: ${settings.tone}`)
  }

  if (settings?.responseStyle) {
    blocks.push(`응답 형식: ${settings.responseStyle}`)
  }

  if (settings?.customInstructions) {
    blocks.push(`추가 지침: ${settings.customInstructions}`)
  }

  if (settings?.userName) {
    blocks.push(`사용자 이름: ${settings.userName}`)
  }

  if (settings?.userRole) {
    blocks.push(`사용자 역할: ${settings.userRole}`)
  }

  if (settings?.organization) {
    blocks.push(`조직: ${settings.organization}`)
  }

  if (Array.isArray(settings?.interests) && settings.interests.length > 0) {
    blocks.push(`관심사: ${settings.interests.join(', ')}`)
  }

  if (settings?.language) {
    blocks.push(`선호 언어: ${settings.language}`)
  }

  if (settings?.timezone) {
    blocks.push(`시간대: ${settings.timezone}`)
  }

  if (execution?.provider || execution?.model) {
    blocks.push(`현재 실행 공급자: ${executionProviderLabel(execution.provider)}`)
    blocks.push(`현재 실행 모델 식별자: ${execution.model || '알 수 없음'}`)
    blocks.push('사용자가 현재 모델이나 공급자를 물으면 위 값을 그대로 답하고, 추측하거나 숨기지 마세요.')
  }

  if (enabledTools.length > 0) {
    const visibleTools = enabledTools.slice(0, 6)
    blocks.push(
      `활성 스킬 목록:\n${visibleTools
        .map(
          (item) =>
            `- ${item.title} (${item.originLabel} / ${item.section}): ${item.description}${item.path ? ` [${item.path}]` : ''}`,
        )
        .join('\n')}`,
    )
  }

  return blocks.join('\n')
}

async function runOllama({ prompt, messages, model, settings, agent, baseUrl, enabledTools }) {
  const endpoint = `${stripTrailingSlash(baseUrl || OLLAMA_URL)}/api/chat`
  const payload = {
    model,
    stream: false,
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt({
          settings,
          agent,
          enabledTools,
          execution: { provider: 'ollama', model },
        }),
      },
      ...messages,
      {
        role: 'user',
        content: prompt,
      },
    ],
  }

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    EXECUTION_TIMEOUT_MS,
  )

  if (!response.ok) {
    throw new Error(`Ollama 실행에 실패했습니다. (${response.status})`)
  }

  const data = await response.json()
  return {
    provider: 'ollama',
    model,
    text: data.message?.content?.trim() || '모델이 비어 있는 응답을 반환했습니다.',
  }
}

function buildCodexPrompt({ prompt, messages, settings, agent, enabledTools, workspaceRoot, workspaceCwd }) {
  const assistantName = agent?.name || settings?.agentName || 'Artemis'
  const userName = settings?.userName || '마스터'
  const model = agent?.model || settings?.codexModel || 'gpt-5.4'
  const recent = messages
    .slice(-8)
    .map((item) => `${item.role === 'assistant' ? assistantName : userName}: ${item.text}`)
    .join('\n')

  return [
    `시스템 에이전트: ${assistantName}`,
    buildSystemPrompt({
      settings,
      agent,
      enabledTools,
      execution: { provider: 'codex', model },
    }),
    workspaceRoot ? `작업 루트 경로: ${workspaceRoot}` : '',
    workspaceCwd ? `현재 작업 폴더 경로: ${workspaceCwd}` : '',
    '파일이나 코드를 수정해야 하면 현재 작업 폴더 기준으로 실제 파일을 읽고 수정하세요.',
    '불필요한 경로는 건드리지 말고, 수정했다면 어떤 파일을 바꿨는지 짧게 보고하세요.',
    recent ? `최근 대화:\n${recent}` : '',
    `새 요청:\n${prompt}`,
    '반드시 한국어로 답하고, 결론부터 간결하게 정리하세요.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function runCodex({ prompt, messages, settings, agent, cwd, workspaceRoot, enabledTools }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'artemis-codex-'))
  const outputPath = path.join(tempDir, 'last-message.txt')
  const promptPath = path.join(tempDir, 'prompt.txt')
  const model = agent?.model || settings?.codexModel || 'gpt-5.4'
  const fullPrompt = buildCodexPrompt({
    prompt,
    messages,
    settings,
    agent,
    enabledTools,
    workspaceRoot,
    workspaceCwd: cwd,
  })
  const script = [
    `$prompt = Get-Content -LiteralPath '${escapePowerShellLiteral(promptPath)}' -Raw -Encoding UTF8`,
    `$prompt | & '${escapePowerShellLiteral(DEFAULT_CODEX_PATH)}' exec --skip-git-repo-check --full-auto -s workspace-write -C '${escapePowerShellLiteral(
      cwd,
    )}' -o '${escapePowerShellLiteral(outputPath)}' --model '${escapePowerShellLiteral(model)}' -`,
    'exit $LASTEXITCODE',
  ].join('; ')

  try {
    await writeFile(promptPath, fullPrompt, 'utf8')
    const result = await spawnProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      cwd,
      timeoutMs: EXECUTION_TIMEOUT_MS,
    })
    const rawText = await readFile(outputPath, 'utf8').catch(() => '')

    if (result.timedOut) {
      throw new Error('Codex 응답 시간이 초과되었습니다. 모델 상태나 로그인 상태를 확인해 주세요.')
    }

    if (result.code !== 0) {
      throw new Error((result.stderr || result.stdout || 'Codex 실행에 실패했습니다.').trim())
    }

    return {
      provider: 'codex',
      model,
      text: rawText.trim() || result.stdout.trim() || '모델이 비어 있는 응답을 반환했습니다.',
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

function extractTextFromOpenAiResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && typeof item.text === 'string') return item.text
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

function extractTextFromAnthropicResponse(payload) {
  if (!Array.isArray(payload?.content)) {
    return ''
  }

  return payload.content
    .map((item) => {
      if (item?.type === 'text' && typeof item.text === 'string') {
        return item.text
      }

      return ''
    })
    .join('\n')
    .trim()
}

async function runAnthropic({ prompt, messages, settings, agent, enabledTools }) {
  if (!agent?.baseUrl) {
    throw new Error('Anthropic 공급자의 Base URL이 없습니다.')
  }

  if (!agent.apiKey) {
    throw new Error('Claude 에이전트는 API 키가 필요합니다. 설정에서 먼저 추가해 주세요.')
  }

  const endpoint = joinUrl(agent.baseUrl, '/messages')
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': agent.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: agent.model,
        max_tokens: 2048,
        system: buildSystemPrompt({
          settings,
          agent,
          enabledTools,
          execution: {
            provider: 'anthropic',
            model: agent.model,
          },
        }),
        messages: [
          ...messages.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    },
    EXECUTION_TIMEOUT_MS,
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Anthropic 호출이 실패했습니다. (${response.status})`)
  }

  const payload = await response.json()
  const text = extractTextFromAnthropicResponse(payload)

  return {
    provider: 'anthropic',
    model: agent.model,
    text: text || '모델이 비어 있는 응답을 반환했습니다.',
  }
}

async function runOpenAiCompatible({ prompt, messages, settings, agent, enabledTools }) {
  if (!agent?.baseUrl) {
    throw new Error('OpenAI 호환 공급자의 Base URL이 없습니다.')
  }

  if (!agent.apiKey) {
    throw new Error('이 에이전트는 API 키가 필요합니다. 설정에서 먼저 추가해 주세요.')
  }

  const endpoint = joinUrl(agent.baseUrl, '/chat/completions')
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${agent.apiKey}`,
  }

  if (endpoint.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'http://127.0.0.1:4173'
    headers['X-Title'] = 'Artemis'
  }

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: agent.model,
        messages: [
        {
          role: 'system',
          content: buildSystemPrompt({
            settings,
            agent,
            enabledTools,
            execution: {
              provider: 'openai-compatible',
              model: agent.model,
            },
          }),
        },
          ...messages,
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    },
    EXECUTION_TIMEOUT_MS,
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `OpenAI 호환 공급자 호출이 실패했습니다. (${response.status})`)
  }

  const payload = await response.json()
  const text = extractTextFromOpenAiResponse(payload)

  return {
    provider: agent.preset || 'openai-compatible',
    model: agent.model,
    text: text || '모델이 비어 있는 응답을 반환했습니다.',
  }
}

async function getHealth() {
  const [ollamaModelsResult, codexStatusResult] = await Promise.allSettled([
    getOllamaTags(),
    getCodexStatus(),
  ])

  const ollamaModels =
    ollamaModelsResult.status === 'fulfilled' ? ollamaModelsResult.value : []
  const codex =
    codexStatusResult.status === 'fulfilled'
      ? codexStatusResult.value
      : { available: false, ready: false, detail: 'Codex 상태를 확인하지 못했습니다.' }

  return {
    ok: true,
    defaultProvider: 'auto',
    providers: [
      {
        provider: 'ollama',
        available: ollamaModels.length > 0,
        ready: ollamaModels.length > 0,
        models: ollamaModels,
        detail:
          ollamaModels.length > 0
            ? `${ollamaModels.length}개의 로컬 모델을 사용할 수 있습니다.`
            : '사용 가능한 Ollama 모델이 없습니다.',
      },
      {
        provider: 'codex',
        available: codex.available,
        ready: codex.ready,
        models: ['gpt-5.4', 'gpt-5.4-mini'],
        detail: codex.detail,
      },
    ],
  }
}

async function execute(body) {
  const provider = body.agent?.provider ?? body.provider ?? 'auto'
  const settings = body.settings ?? {}
  const agent = body.agent ?? null
  const messages = normalizeMessages(body.messages)
  const enabledTools = Array.isArray(body.enabledTools) ? body.enabledTools : []
  const health = await getHealth()
  const ollamaReady = health.providers.find((item) => item.provider === 'ollama')?.ready
  const codexReady = health.providers.find((item) => item.provider === 'codex')?.ready
  const chosenProvider =
    provider === 'auto'
      ? codexReady
        ? 'codex'
        : ollamaReady
          ? 'ollama'
          : 'codex'
      : provider

  const chosenModel =
    chosenProvider === 'ollama'
      ? agent?.model ||
        settings.ollamaModel ||
        health.providers.find((item) => item.provider === 'ollama')?.models[0]
      : chosenProvider === 'codex'
        ? agent?.model || settings.codexModel || 'gpt-5.4'
        : agent?.model || '알 수 없음'

  const workspaceRoot = await resolveWorkspaceRoot(body.rootPath)
  const workspaceCwd = resolveWorkspaceTarget(workspaceRoot, body.cwdPath || '').absolutePath

  if (chosenProvider === 'ollama') {
    const model =
      agent?.model ||
      settings.ollamaModel ||
      health.providers.find((item) => item.provider === 'ollama')?.models[0]

    if (!model) {
      throw new Error('사용 가능한 Ollama 모델을 찾지 못했습니다.')
    }

    return runOllama({
      prompt: body.prompt,
      messages,
      model,
      settings,
      agent,
      baseUrl: agent?.baseUrl,
      enabledTools,
    })
  }

  if (chosenProvider === 'openai-compatible') {
    return runOpenAiCompatible({
      prompt: body.prompt,
      messages,
      settings,
      agent,
      enabledTools,
    })
  }

  if (chosenProvider === 'anthropic') {
    return runAnthropic({
      prompt: body.prompt,
      messages,
      settings,
      agent,
      enabledTools,
    })
  }

  return runCodex({
    prompt: body.prompt,
    messages,
    settings,
    agent,
    cwd: workspaceCwd,
    workspaceRoot,
    enabledTools,
  })
}

function dedupeSignalItems(items) {
  const seen = new Set()

  return items.filter((item) => {
    const key = `${item.url}::${item.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sortSignalItems(items) {
  return [...items].sort(
    (left, right) =>
      new Date(right.publishedAt || 0).getTime() - new Date(left.publishedAt || 0).getTime(),
  )
}

function isoDateDaysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function getSignalSourcePlan(category) {
  if (category === 'all') {
    return {
      order: ['Hacker News', 'arXiv', 'GitHub'],
      caps: { arXiv: 3, 'Hacker News': 3, GitHub: 2 },
    }
  }

  if (category === 'research') {
    return {
      order: ['arXiv', 'Hacker News', 'GitHub'],
      caps: { arXiv: 4, 'Hacker News': 2, GitHub: 1 },
    }
  }

  if (category === 'opensource') {
    return {
      order: ['GitHub', 'Hacker News', 'arXiv'],
      caps: { arXiv: 1, 'Hacker News': 2, GitHub: 4 },
    }
  }

  if (category === 'business') {
    return {
      order: ['Hacker News', 'GitHub', 'arXiv'],
      caps: { arXiv: 1, 'Hacker News': 4, GitHub: 2 },
    }
  }

  return {
    order: ['Hacker News', 'arXiv', 'GitHub'],
    caps: { arXiv: 3, 'Hacker News': 3, GitHub: 2 },
  }
}

function mixSignalItems(items, category) {
  const plan = getSignalSourcePlan(category)
  const buckets = new Map(
    plan.order.map((source) => [
      source,
      sortSignalItems(items.filter((item) => item.source === source)),
    ]),
  )
  const counts = new Map(plan.order.map((source) => [source, 0]))
  const mixed = []

  while (mixed.length < SIGNAL_RESULT_LIMIT) {
    let appended = false

    for (const source of plan.order) {
      const bucket = buckets.get(source) ?? []
      const count = counts.get(source) ?? 0
      const cap = plan.caps[source] ?? SIGNAL_RESULT_LIMIT

      if (count >= cap || bucket.length === 0) {
        continue
      }

      mixed.push(bucket.shift())
      counts.set(source, count + 1)
      appended = true

      if (mixed.length >= SIGNAL_RESULT_LIMIT) {
        break
      }
    }

    if (!appended) {
      break
    }
  }

  return mixed.filter(Boolean)
}

async function fetchHackerNewsSignals(query, category) {
  const payload = await fetchJson(
    `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(
      query,
    )}&tags=story&hitsPerPage=5`,
    undefined,
    SIGNAL_FETCH_TIMEOUT_MS,
  )

  return (Array.isArray(payload.hits) ? payload.hits : [])
    .filter((item) => item?.title && item?.created_at)
    .map((item) => ({
      id: `hn-${item.objectID}`,
      title: stripHtml(item.title),
      summary: stripHtml(
        item.story_text ||
          item.comment_text ||
          item.url ||
          '기술 커뮤니티에서 주목받는 흐름을 추렸습니다.',
      ),
      url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
      source: 'Hacker News',
      category,
      publishedAt: item.created_at,
    }))
}

async function fetchGitHubSignals(query, category) {
  const pushedAfter = isoDateDaysAgo(category === 'business' ? 120 : 90)
  const starsThreshold =
    category === 'research' ? 120 : category === 'opensource' ? 250 : 180
  const scopedQuery = `${query} stars:>=${starsThreshold} pushed:>=${pushedAfter}`
  const payload = await fetchJson(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(
      scopedQuery,
    )}&sort=stars&order=desc&per_page=4`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Artemis',
      },
    },
    SIGNAL_FETCH_TIMEOUT_MS,
  )

  return (Array.isArray(payload.items) ? payload.items : []).map((repo) => ({
    id: `gh-${repo.id}`,
    title: stripHtml(repo.full_name),
    summary: stripHtml(
      repo.description ||
        `GitHub 저장소 · 별 ${repo.stargazers_count ?? 0}개 · 최근 푸시 ${repo.pushed_at || repo.updated_at}`,
    ),
    url: repo.html_url,
    source: 'GitHub',
    category,
    publishedAt: repo.pushed_at || repo.updated_at,
  }))
}

async function fetchArxivSignals(searchQuery, category) {
  const response = await fetchWithTimeout(
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
      searchQuery,
    )}&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending`,
    undefined,
    SIGNAL_FETCH_TIMEOUT_MS,
  )

  if (!response.ok) {
    throw new Error(`arXiv 요청이 실패했습니다. (${response.status})`)
  }

  const xml = await response.text()

  return xml
    .split('<entry>')
    .slice(1)
    .map((entry, index) => ({
      id: `arxiv-${category}-${index}`,
      title: stripHtml(extractXmlValue(entry, 'title')),
      summary: stripHtml(extractXmlValue(entry, 'summary')),
      url: extractXmlLink(entry),
      source: 'arXiv',
      category,
      publishedAt: extractXmlValue(entry, 'published') || new Date().toISOString(),
    }))
    .filter((item) => item.title && item.url)
}

function parseSignalTranslationJson(text = '') {
  const normalized = text
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim()
  const blockMatch = normalized.match(/\[[\s\S]*\]/)

  if (!blockMatch) {
    return []
  }

  try {
    const parsed = JSON.parse(blockMatch[0])
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function translateSignalBatchWithCodex(items) {
  if (items.length === 0) {
    return []
  }

  try {
    const response = await runCodex({
      prompt: [
        '다음 공개 피드 항목의 원문 제목과 원문 요약을 한국어로 번역하세요.',
        '입력에 없는 정보 추가 금지, 추정 금지, 새 요약 생성 금지.',
        '원문 의미를 유지하고 고유명사는 보존하세요.',
        '반드시 JSON 배열만 반환하세요.',
        '각 항목 형식은 {"id":"...", "title":"...", "summary":"..."} 입니다.',
        JSON.stringify(
          items.map((item) => ({
            id: item.id,
            source: SOURCE_LABELS[item.source] ?? item.source,
            category: CODE_TO_CATEGORY[item.category] ?? item.category,
            title: item.title,
            summary: item.summary,
          })),
        ),
      ].join('\n\n'),
      messages: [],
      settings: {
        agentName: 'Artemis Signals',
        tone: '간결하고 실무적인 브리핑',
        responseStyle: 'JSON 배열',
        customInstructions: '',
        userName: '마스터',
        userRole: '',
        organization: 'Artemis',
        interests: [],
        language: '한국어',
        timezone: 'Asia/Seoul',
        locationSharing: false,
        modelProvider: 'codex',
        ollamaModel: '',
        codexModel: SIGNAL_CODEX_TRANSLATION_MODEL,
      },
      agent: {
        name: 'Artemis Signals',
        model: SIGNAL_CODEX_TRANSLATION_MODEL,
        systemPrompt:
          '당신은 공개 기술 피드 번역기입니다. 입력에 없는 사실을 추가하지 말고 제목과 요약을 한국어로만 번역해서 JSON 배열로 반환하세요.',
      },
      cwd: process.cwd(),
      enabledTools: [],
    })

    const translated = parseSignalTranslationJson(response.text)
    const translatedMap = new Map(
      translated
        .filter((item) => item && typeof item.id === 'string')
        .map((item) => [
          item.id,
          {
            title: typeof item.title === 'string' ? item.title.trim() : '',
            summary: typeof item.summary === 'string' ? item.summary.trim() : '',
            translationSource: 'codex',
          },
        ]),
    )

    return items.map((item) => finalizeSignalCopy(item, translatedMap.get(item.id)))
  } catch {
    return items.map((item) => finalizeSignalCopy(item))
  }
}

async function warmSignalTranslationsWithCodex(items) {
  const uncached = items.filter(
    (item) => !signalTranslationCache.has(`${item.id}:${item.publishedAt}`),
  )

  if (uncached.length === 0) {
    return
  }

  const batchKey = uncached
    .map((item) => `${item.id}:${item.publishedAt}`)
    .sort()
    .join('|')

  if (signalTranslationInFlight.has(batchKey)) {
    return
  }

  signalTranslationInFlight.add(batchKey)

  try {
    const translated = await translateSignalBatchWithCodex(uncached)

    for (const item of translated) {
      if (item.translationSource === 'codex') {
        signalTranslationCache.set(`${item.id}:${item.publishedAt}`, {
          title: item.title,
          summary: item.summary,
          translationSource: 'codex',
        })
      }
    }

    signalFeedCache.clear()
    console.info(`[signals] background translation warmed ${translated.length} item(s)`)
  } catch (error) {
    console.warn(
      '[signals] background translation failed',
      error instanceof Error ? error.message : error,
    )
  } finally {
    signalTranslationInFlight.delete(batchKey)
  }
}

async function warmSignalTranslationsWithOllama(items, translationModel) {
  const uncached = items.filter(
    (item) => !signalTranslationCache.has(`${item.id}:${item.publishedAt}`),
  )

  if (uncached.length === 0) {
    return
  }

  const batchKey = [
    'ollama',
    translationModel,
    ...uncached.map((item) => `${item.id}:${item.publishedAt}`).sort(),
  ].join('|')

  if (signalTranslationInFlight.has(batchKey)) {
    return
  }

  signalTranslationInFlight.add(batchKey)

  try {
    const translatedItems = await Promise.allSettled(
      uncached.map(async (item) => {
        const translated = await translateSignalItem(item, translationModel)
        if (!translated || (!hasKoreanText(translated.title) && !hasKoreanText(translated.summary))) {
          return
        }

        signalTranslationCache.set(`${item.id}:${item.publishedAt}`, {
          ...translated,
          translationSource: 'ollama',
        })
      }),
    )

    if (translatedItems.some((entry) => entry.status === 'fulfilled')) {
      signalFeedCache.clear()
    }
  } finally {
    signalTranslationInFlight.delete(batchKey)
  }
}

async function translateSignalBatch(items) {
  if (items.length === 0) {
    return []
  }

  const uncached = items.filter(
    (item) => !signalTranslationCache.has(`${item.id}:${item.publishedAt}`),
  )

  if (uncached.length === 0) {
    return items.map((item) =>
      finalizeSignalCopy(item, signalTranslationCache.get(`${item.id}:${item.publishedAt}`)),
    )
  }

  try {
    const translatedWithCodex = await raceWithTimeout(
      translateSignalBatchWithCodex(uncached),
      SIGNAL_TRANSLATION_TIMEOUT_MS,
      '시그널 일괄 번역 시간이 초과되었습니다.',
    )

    for (const item of translatedWithCodex) {
      if (item.translationSource === 'codex') {
        signalTranslationCache.set(`${item.id}:${item.publishedAt}`, {
          title: item.title,
          summary: item.summary,
          translationSource: 'codex',
        })
      }
    }

    return items.map((item) =>
      finalizeSignalCopy(item, signalTranslationCache.get(`${item.id}:${item.publishedAt}`)),
    )
  } catch (error) {
    console.warn(
      '[signals] sync translation fallback',
      error instanceof Error ? error.message : error,
    )
  }

  const models = await getOllamaTags().catch(() => [])
  const translationModel =
    models.find((item) => item === 'gemma4:e2b') ??
    models.find((item) => /gemma|qwen|llama/i.test(item)) ??
    models[0] ??
    null

  if (translationModel) {
    const translatedItems = await Promise.allSettled(
      uncached.map(async (item) => {
        const translated = await translateSignalItem(item, translationModel)
        if (!translated) {
          return
        }

        signalTranslationCache.set(`${item.id}:${item.publishedAt}`, translated)
      }),
    )

    if (translatedItems.some((entry) => entry.status === 'fulfilled')) {
      signalFeedCache.clear()
    }
  } else {
    void warmSignalTranslationsWithCodex(uncached)
  }

  return items.map((item) =>
    finalizeSignalCopy(item, signalTranslationCache.get(`${item.id}:${item.publishedAt}`)),
  )
}

async function buildSignalsFeed(category = '전체') {
  const normalizedCategory = normalizeCategory(category)
  const cached = signalFeedCache.get(normalizedCategory)

  if (cached && cached.expiresAt > Date.now()) {
    return {
      generatedAt: cached.generatedAt,
      items: cached.items,
    }
  }

  const tasks = []

  const categories =
    normalizedCategory === 'all' ? ['ai', 'research', 'opensource'] : [normalizedCategory]

  for (const key of categories) {
    const queryGroup = SIGNAL_QUERIES[key]

    for (const query of queryGroup.hackerNews.slice(0, normalizedCategory === 'all' ? 1 : 2)) {
      tasks.push(fetchHackerNewsSignals(query, key))
    }

    for (const query of queryGroup.github.slice(0, 1)) {
      tasks.push(fetchGitHubSignals(query, key))
    }

    for (const query of queryGroup.arxiv.slice(0, 1)) {
      tasks.push(fetchArxivSignals(query, key))
    }
  }

  const settled = await Promise.allSettled(tasks)
  const merged = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  const sorted = dedupeSignalItems(sortSignalItems(merged))
  const deduped = mixSignalItems(sorted, normalizedCategory)
  const items = await translateSignalBatch(deduped)
  const generatedAt = new Date().toISOString()

  signalFeedCache.set(normalizedCategory, {
    generatedAt,
    items,
    expiresAt: Date.now() + SIGNAL_CACHE_TTL_MS,
  })

  return { generatedAt, items }
}

async function exists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function walkForSkillFiles(rootPath, maxDepth, depth = 0, bucket = []) {
  if (depth > maxDepth || !(await exists(rootPath))) {
    return bucket
  }

  const entries = await readdir(rootPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name)

    if (entry.isDirectory()) {
      await walkForSkillFiles(fullPath, maxDepth, depth + 1, bucket)
      continue
    }

    if (entry.isFile() && entry.name === 'SKILL.md') {
      bucket.push(fullPath)
    }
  }

  return bucket
}

function pickSkillDescription(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    lines.find((line) => !line.startsWith('#') && !line.startsWith('(') && !line.startsWith('-')) ??
    '설명을 찾지 못했습니다.'
  )
}

async function listSkills() {
  const now = Date.now()
  if (cachedSkillCatalog.items.length > 0 && cachedSkillCatalogExpiresAt > now) {
    return cachedSkillCatalog
  }

  const roots = [
    { root: path.join(CODEX_HOME, 'skills'), source: 'local-skill', originLabel: '로컬 스킬' },
    {
      root: path.join(CODEX_HOME, 'plugins', 'cache', 'openai-curated'),
      source: 'plugin-skill',
      originLabel: '플러그인 스킬',
    },
  ]

  const items = []

  for (const entry of roots) {
    const skillFiles = await walkForSkillFiles(entry.root, entry.source === 'plugin-skill' ? 6 : 4)

    for (const skillFile of skillFiles) {
      const content = await readFile(skillFile, 'utf8').catch(() => '')
      const title =
        content.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
        path.basename(path.dirname(skillFile))
      const description = pickSkillDescription(content)
      const statInfo = await stat(skillFile).catch(() => null)
      const skillId = Buffer.from(skillFile).toString('base64url')

      items.push({
        id: skillId,
        section: entry.originLabel,
        title,
        description,
        example: skillFile,
        enabled: true,
        source: entry.source,
        path: skillFile,
        originLabel: entry.originLabel,
        updatedAt: statInfo?.mtime?.toISOString?.() ?? '',
      })
    }
  }

  const normalized = items
    .sort((left, right) => left.title.localeCompare(right.title, 'ko'))
    .map(({ updatedAt, ...item }) => item)

  cachedSkillCatalog = {
    generatedAt: new Date().toISOString(),
    items: normalized,
  }
  cachedSkillCatalogExpiresAt = now + 60_000
  return cachedSkillCatalog
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 404, { ok: false, error: '요청 경로가 없습니다.' })
    return
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    })
    response.end()
    return
  }

  try {
    if (request.method === 'GET' && request.url === '/api/health') {
      sendJson(response, 200, await getHealth())
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/workspace/default')) {
      sendJson(response, 200, { ok: true, ...(await getDefaultWorkspace()) })
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/workspace/file')) {
      const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
      const rootPath = requestUrl.searchParams.get('rootPath') ?? undefined
      const filePath = requestUrl.searchParams.get('path') ?? ''
      sendJson(response, 200, {
        ok: true,
        ...(await readWorkspaceFileContent({ rootPath, filePath })),
      })
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/workspace')) {
      const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
      const rootPath = requestUrl.searchParams.get('rootPath') ?? undefined
      const currentPath = requestUrl.searchParams.get('path') ?? ''
      sendJson(response, 200, {
        ok: true,
        ...(await listWorkspace({ rootPath, currentPath })),
      })
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/signals')) {
      const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
      const category = requestUrl.searchParams.get('category') || '전체'
      const feed = await buildSignalsFeed(category)

      sendJson(response, 200, {
        ok: true,
        generatedAt: feed.generatedAt,
        items: feed.items,
      })
      return
    }

    if (request.method === 'GET' && request.url === '/api/skills') {
      const catalog = await listSkills()
      sendJson(response, 200, {
        ok: true,
        generatedAt: catalog.generatedAt,
        items: catalog.items,
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/execute') {
      const body = await readBody(request)
      const result = await execute(body)
      sendJson(response, 200, { ok: true, ...result })
      return
    }

    if (request.method === 'POST' && request.url === '/api/workspace/folder') {
      const body = await readBody(request)
      sendJson(response, 200, {
        ok: true,
        ...(await createWorkspaceFolder({
          rootPath: body.rootPath,
          currentPath: body.currentPath,
          name: body.name,
        })),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/workspace/write') {
      const body = await readBody(request)
      sendJson(response, 200, {
        ok: true,
        ...(await writeWorkspaceFileContent({
          rootPath: body.rootPath,
          filePath: body.path,
          content: body.content,
        })),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/workspace/upload') {
      const body = await readBody(request)
      sendJson(response, 200, {
        ok: true,
        ...(await uploadWorkspaceFiles({
          rootPath: body.rootPath,
          currentPath: body.currentPath,
          files: body.files,
        })),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/workspace/delete') {
      const body = await readBody(request)
      sendJson(response, 200, {
        ok: true,
        ...(await deleteWorkspaceEntry({
          rootPath: body.rootPath,
          targetPath: body.path,
        })),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/workspace/reveal') {
      const body = await readBody(request)
      sendJson(response, 200, {
        ok: true,
        ...(await revealWorkspacePath({
          rootPath: body.rootPath,
          targetPath: body.path,
        })),
      })
      return
    }

    sendJson(response, 404, { ok: false, error: '지원하지 않는 경로입니다.' })
  } catch (error) {
    sendJson(response, getErrorStatus(error), {
      ok: false,
      error: error instanceof Error ? error.message : '브리지 내부 오류가 발생했습니다.',
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Artemis bridge listening on http://${HOST}:${PORT}`)
})
