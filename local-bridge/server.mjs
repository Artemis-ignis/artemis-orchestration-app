import http from 'node:http'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { access, appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OAuth2Client } from 'google-auth-library'
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
import { createAiRouter } from './ai/router.mjs'
import { createAutoPostsScheduler } from './auto-posts/scheduler.mjs'
import { createXAutopostScheduler } from './x-autopost/scheduler.mjs'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(targetPath) {
  if (!existsSync(targetPath)) {
    return
  }

  const raw = readFileSync(targetPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile(path.join(PROJECT_ROOT, '.env'))
loadEnvFile(path.join(PROJECT_ROOT, '.env.local'))

const HOST = '127.0.0.1'
const PORT = Number(process.env.ARTEMIS_BRIDGE_PORT ?? 4174)
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const USER_HOME = process.env.USERPROFILE ?? os.homedir()
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(USER_HOME, '.codex')
const DEFAULT_CODEX_PATH =
  process.env.ARTEMIS_CODEX_PATH ??
  path.join(USER_HOME, '.codex', '.sandbox-bin', 'codex.exe')
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID?.trim() ||
  process.env.VITE_GOOGLE_CLIENT_ID?.trim() ||
  ''
const PUBLIC_SESSION_SECRET =
  process.env.ARTEMIS_PUBLIC_SESSION_SECRET?.trim() || randomBytes(32).toString('hex')
const PUBLIC_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14
const PUBLIC_SESSION_COOKIE_NAME = 'artemis_public_session'
const googleOAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null
const APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY?.trim() ||
  process.env.ARTEMIS_PUBLIC_SESSION_SECRET?.trim() ||
  ''
const DEFAULT_ROUTING_MODE = process.env.DEFAULT_ROUTING_MODE?.trim() || 'auto-best-free'
const FIRST_TOKEN_TIMEOUT_MS = Number(process.env.FIRST_TOKEN_TIMEOUT_MS ?? 20_000)
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 120_000)
const OPENROUTER_APP_TITLE = process.env.OPENROUTER_APP_TITLE?.trim() || 'Artemis Orchestration'
const OPENROUTER_HTTP_REFERER =
  process.env.OPENROUTER_HTTP_REFERER?.trim() ||
  process.env.VITE_APP_URL?.trim() ||
  'http://127.0.0.1:4173'

if (!process.env.ARTEMIS_PUBLIC_SESSION_SECRET?.trim()) {
  console.warn(
    '[public-auth] ARTEMIS_PUBLIC_SESSION_SECRET is not set. Public sessions will reset whenever the bridge restarts.',
  )
}

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
let lastSuccessfulOllamaStatus = null
let pendingOllamaStatusPromise = null
const SIGNAL_FETCH_TIMEOUT_MS = 8_000
const SIGNAL_TRANSLATION_TIMEOUT_MS = 28_000
const PER_SIGNAL_TRANSLATION_TIMEOUT_MS = 15_000
const SIGNAL_RESULT_LIMIT = 6
const SIGNAL_CACHE_TTL_MS = 45_000
const EXECUTION_TIMEOUT_MS = 240_000
const SIGNAL_CODEX_TRANSLATION_MODEL = 'gpt-5.4-mini'
const OLLAMA_LOCAL_MODEL = 'gemma4-E4B-uncensored-q4fast:latest'
const OLLAMA_HEALTH_TIMEOUT_MS = Number(process.env.OLLAMA_HEALTH_TIMEOUT_MS ?? 4_000)
const PUBLIC_INQUIRY_DIRECTORY = path.join(process.cwd(), 'output', 'public-inquiries')
const PUBLIC_ACCOUNT_DIRECTORY = path.join(process.cwd(), 'output', 'public-accounts')
const PUBLIC_ACCOUNT_FILE = path.join(PUBLIC_ACCOUNT_DIRECTORY, 'accounts.json')
const PUBLIC_ALLOWED_ORIGINS = new Set(
  [
    process.env.VITE_APP_URL?.trim(),
    'http://127.0.0.1:4173',
    'http://localhost:4173',
  ].filter(Boolean),
)
const WORKSPACE_SNAPSHOT_MAX_DIRECTORIES = 160
const WORKSPACE_SNAPSHOT_MAX_FILES = 1_200
const WORKSPACE_CHANGE_RESULT_LIMIT = 64
const WORKSPACE_SNAPSHOT_SKIPPED_FOLDERS = new Set([
  '.cache',
  '.git',
  '.next',
  '.playwright-cli',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
])

function createCorsHeaders(request) {
  const origin = request.headers.origin
  const allowOrigin = origin && PUBLIC_ALLOWED_ORIGINS.has(origin) ? origin : '*'
  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    Vary: 'Origin',
  }

  if (allowOrigin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  return headers
}

function sendJson(request, response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...createCorsHeaders(request),
    ...extraHeaders,
  })
  response.end(JSON.stringify(payload))
}

function resolveMimeTypeFromPath(targetPath = '') {
  const extension = path.extname(targetPath).toLowerCase()
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    default:
      return 'application/octet-stream'
  }
}

async function sendFileResponse(request, response, targetPath) {
  const fileBuffer = await readFile(targetPath)
  response.writeHead(200, {
    'Content-Type': resolveMimeTypeFromPath(targetPath),
    'Cache-Control': 'public, max-age=300',
    ...createCorsHeaders(request),
  })
  response.end(fileBuffer)
}

function toPortableRelative(rootPath, targetPath) {
  return path.relative(rootPath, targetPath).split(path.sep).join('/')
}

function decorateAutoPostMedia(workspaceRoot, attachments = []) {
  return attachments.map((item) => ({
    ...item,
    previewUrl: item.localPath
      ? `/api/auto-posts/assets?path=${encodeURIComponent(
          toPortableRelative(workspaceRoot, item.localPath),
        )}`
      : item.thumbnailUrl || item.url || '',
  }))
}

function parseCookies(request) {
  const header = request.headers.cookie ?? ''
  return header.split(';').reduce((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (!rawKey) {
      return cookies
    }

    cookies[rawKey] = decodeURIComponent(rawValue.join('='))
    return cookies
  }, {})
}

function createPublicSessionCookie(token = '', { clear = false } = {}) {
  const parts = [
    `${PUBLIC_SESSION_COOKIE_NAME}=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]

  if (clear) {
    parts.push('Max-Age=0')
  } else {
    parts.push(`Max-Age=${Math.floor(PUBLIC_SESSION_TTL_MS / 1000)}`)
  }

  return parts.join('; ')
}

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function createPublicSessionToken(payload) {
  const body = encodeBase64Url(JSON.stringify(payload))
  const signature = createHmac('sha256', PUBLIC_SESSION_SECRET).update(body).digest('base64url')
  return `${body}.${signature}`
}

function verifyPublicSessionToken(token = '') {
  const [body, signature] = String(token).split('.')

  if (!body || !signature) {
    throw new Error('로그인 세션이 필요합니다.')
  }

  const expected = createHmac('sha256', PUBLIC_SESSION_SECRET).update(body).digest('base64url')
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error('로그인 세션이 유효하지 않습니다.')
  }

  const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('로그인 세션을 해석하지 못했습니다.')
  }

  if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
    throw new Error('로그인 세션이 만료되었습니다.')
  }

  return parsed
}

function readPublicSessionFromRequest(request) {
  const cookies = parseCookies(request)
  if (cookies[PUBLIC_SESSION_COOKIE_NAME]) {
    return verifyPublicSessionToken(cookies[PUBLIC_SESSION_COOKIE_NAME])
  }

  throw new Error('로그인이 필요합니다.')
}

function getErrorStatus(error) {
  if (!(error instanceof Error)) {
    return 500
  }

  const message = error.message.toLowerCase()

  if (
    message.includes('api key') ||
    message.includes('base url') ||
    message.includes('google') ||
    message.includes('로그인') ||
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

function toPortablePath(value = '') {
  return value.split(path.sep).join('/')
}

function parseBooleanFlag(value) {
  return value === true || value === 'true' || value === '1'
}

function normalizeInquiryText(value = '') {
  return String(value).trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())
}

function normalizePublicPlan(value = '') {
  const normalized = String(value).trim().toLowerCase()
  return normalized === 'plus' || normalized === 'pro' ? normalized : 'free'
}

function createPublicAccountId() {
  return `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function readPublicAccountsStore() {
  await mkdir(PUBLIC_ACCOUNT_DIRECTORY, { recursive: true })

  try {
    const raw = await readFile(PUBLIC_ACCOUNT_FILE, 'utf8')
    const parsed = JSON.parse(raw)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // 저장소가 아직 없으면 비어 있는 객체로 시작한다.
  }

  return {}
}

async function writePublicAccountsStore(store) {
  await mkdir(PUBLIC_ACCOUNT_DIRECTORY, { recursive: true })
  await writeFile(PUBLIC_ACCOUNT_FILE, JSON.stringify(store, null, 2), 'utf8')
}

function toPublicAccountSnapshot(account) {
  return {
    accountId: account.id,
    name: account.name,
    email: account.email,
    teamSize: account.teamSize,
    role: account.role,
    useCase: account.useCase,
    selectedPlan: account.selectedPlan,
    activePlan: account.activePlan,
    accountStatus: account.accountStatus,
    billingState: account.billingState,
    authProvider: account.authProvider || 'none',
    googleSub: account.googleSub || '',
    avatarUrl: account.avatarUrl || '',
    emailVerified: account.emailVerified === true,
    inquiryCount: Number(account.inquiryCount ?? 0),
    lastInquiryId: account.lastInquiryId ?? '',
    updatedAt: account.updatedAt,
  }
}

function sendSseEvent(response, eventName, payload) {
  response.write(`event: ${eventName}\n`)
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

const aiRouter = createAiRouter({
  projectRoot: PROJECT_ROOT,
  fetchWithTimeout,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  firstTokenTimeoutMs: FIRST_TOKEN_TIMEOUT_MS,
  appEncryptionKey: APP_ENCRYPTION_KEY,
  publicSessionSecret: PUBLIC_SESSION_SECRET,
  openRouterTitle: OPENROUTER_APP_TITLE,
  openRouterReferer: OPENROUTER_HTTP_REFERER,
})

const autoPostsScheduler = createAutoPostsScheduler({
  resolveWorkspaceRoot: getDefaultWorkspace,
  collectSignalItems,
  fetchWithTimeout,
  revealWorkspacePath,
  runCodex,
})
const xAutopostScheduler = createXAutopostScheduler({
  resolveWorkspaceRoot: getDefaultWorkspace,
  collectSignalItems,
  fetchWithTimeout,
  runCodex,
})

async function savePublicAccount(payload = {}, options = {}) {
  const session = options.session ?? null
  const email = normalizeInquiryText(session?.email || payload.email).toLowerCase()
  const name = normalizeInquiryText(payload.name)
  const teamSize = normalizeInquiryText(payload.teamSize)
  const role = normalizeInquiryText(payload.role)
  const useCase = normalizeInquiryText(payload.useCase)
  const selectedPlan = normalizePublicPlan(payload.planIntent ?? payload.plan)
  const googleSub = normalizeInquiryText(session?.googleSub || payload.googleSub)
  const avatarUrl = normalizeInquiryText(payload.avatarUrl)
  const authProvider =
    (googleSub ? 'google' : normalizeInquiryText(payload.authProvider)) || 'none'
  const emailVerified = googleSub ? true : payload.emailVerified === true
  const activatePlan = options.activate === true
  const inquiryId = normalizeInquiryText(options.inquiryId)

  if (!isValidEmail(email)) {
    throw new Error('올바른 이메일 주소가 필요합니다.')
  }

  const store = await readPublicAccountsStore()
  const current = store[email] ?? {
    id: createPublicAccountId(),
    createdAt: new Date().toISOString(),
    inquiryCount: 0,
  }

  const nextSelectedPlan = selectedPlan || current.selectedPlan || 'free'
  const nextActivePlan = activatePlan
    ? nextSelectedPlan
    : current.activePlan || 'free'
  const selectedPaidPlan = nextSelectedPlan !== 'free'
  const currentHasActivePaidPlan =
    current.activePlan === nextSelectedPlan && current.billingState === 'active'

  let nextAccountStatus = current.accountStatus || 'guest'
  let nextBillingState = current.billingState || 'none'

  if (activatePlan) {
    nextAccountStatus = nextSelectedPlan === 'free' ? 'trial' : 'active'
    nextBillingState = nextSelectedPlan === 'free' ? 'trial' : 'active'
  } else if (selectedPaidPlan && !currentHasActivePaidPlan) {
    nextAccountStatus = 'lead'
    nextBillingState = 'pending'
  } else if (!current.accountStatus || nextSelectedPlan === 'free') {
    nextAccountStatus = 'trial'
    nextBillingState = current.billingState === 'active' ? current.billingState : 'trial'
  }

  const entry = {
    ...current,
    name: name || current.name || '',
    email,
    teamSize: teamSize || current.teamSize || '',
    role: role || current.role || '',
    useCase: useCase || current.useCase || '',
    selectedPlan: nextSelectedPlan,
    activePlan: nextActivePlan,
    accountStatus: nextAccountStatus,
    billingState: nextBillingState,
    authProvider: authProvider || current.authProvider || 'none',
    googleSub: googleSub || current.googleSub || '',
    avatarUrl: avatarUrl || current.avatarUrl || '',
    emailVerified: emailVerified || current.emailVerified === true,
    inquiryCount: inquiryId ? Number(current.inquiryCount ?? 0) + 1 : Number(current.inquiryCount ?? 0),
    lastInquiryId: inquiryId || current.lastInquiryId || '',
    updatedAt: new Date().toISOString(),
  }

  store[email] = entry
  await writePublicAccountsStore(store)
  return toPublicAccountSnapshot(entry)
}

async function getPublicAccountByEmail(email = '') {
  const normalizedEmail = normalizeInquiryText(email).toLowerCase()

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('올바른 이메일 주소가 필요합니다.')
  }

  const store = await readPublicAccountsStore()
  const account = store[normalizedEmail]

  if (!account) {
    throw new Error('등록된 계정 정보를 찾지 못했습니다.')
  }

  return toPublicAccountSnapshot(account)
}

async function getPublicAccountByGoogleSubject(googleSub = '') {
  const normalizedGoogleSub = normalizeInquiryText(googleSub)

  if (!normalizedGoogleSub) {
    throw new Error('Google 계정 식별자가 필요합니다.')
  }

  const store = await readPublicAccountsStore()
  const account = Object.values(store).find((entry) => entry.googleSub === normalizedGoogleSub)

  if (!account) {
    throw new Error('등록된 Google 계정 정보를 찾지 못했습니다.')
  }

  return toPublicAccountSnapshot(account)
}

async function signInPublicAccountWithGoogle(payload = {}) {
  if (!googleOAuthClient || !GOOGLE_CLIENT_ID) {
    throw new Error('Google 로그인을 아직 설정하지 않았습니다.')
  }

  const credential = normalizeInquiryText(payload.credential)
  if (!credential) {
    throw new Error('Google 로그인 토큰이 필요합니다.')
  }

  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  })
  const googlePayload = ticket.getPayload()

  if (!googlePayload?.sub || !googlePayload.email) {
    throw new Error('Google 계정 정보를 확인하지 못했습니다.')
  }

  if (googlePayload.email_verified !== true) {
    throw new Error('이메일 검증이 완료된 Google 계정이 필요합니다.')
  }

  const account = await savePublicAccount(
    {
      name: googlePayload.name ?? '',
      email: googlePayload.email,
      teamSize: payload.teamSize,
      role: payload.role,
      useCase: payload.useCase,
      planIntent: payload.planIntent,
      googleSub: googlePayload.sub,
      avatarUrl: googlePayload.picture ?? '',
      authProvider: 'google',
      emailVerified: true,
    },
    {
      activate: normalizePublicPlan(payload.planIntent) === 'free',
    },
  )

  const authenticatedAt = new Date().toISOString()
  const sessionToken = createPublicSessionToken({
    email: account.email,
    googleSub: googlePayload.sub,
    authenticatedAt,
    exp: Date.now() + PUBLIC_SESSION_TTL_MS,
  })

  return {
    account,
    sessionToken,
    authenticatedAt,
  }
}

async function getAuthenticatedPublicAccount(request) {
  const session = readPublicSessionFromRequest(request)

  if (session.googleSub) {
    return getPublicAccountByGoogleSubject(session.googleSub)
  }

  return getPublicAccountByEmail(session.email ?? '')
}

async function savePublicInquiry(payload = {}) {
  const session = payload.session ?? null
  const name = normalizeInquiryText(payload.name)
  const email = normalizeInquiryText(session?.email || payload.email)
  const teamSize = normalizeInquiryText(payload.teamSize)
  const plan = normalizeInquiryText(payload.plan) || 'Free'
  const useCase = normalizeInquiryText(payload.useCase)

  if (!name) {
    throw new Error('문의자 이름이 필요합니다.')
  }

  if (!isValidEmail(email)) {
    throw new Error('올바른 이메일 주소가 필요합니다.')
  }

  if (!useCase) {
    throw new Error('주요 용도를 입력해 주세요.')
  }

  await mkdir(PUBLIC_INQUIRY_DIRECTORY, { recursive: true })

  const id = `inq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const targetPath = path.join(PUBLIC_INQUIRY_DIRECTORY, 'submissions.jsonl')
  const entry = {
    id,
    receivedAt: new Date().toISOString(),
    name,
    email,
    teamSize,
    plan,
    useCase,
  }

  await appendFile(targetPath, `${JSON.stringify(entry)}\n`, 'utf8')
  const account = await savePublicAccount(
    {
      name,
      email,
      teamSize,
      useCase,
      planIntent: normalizePublicPlan(plan),
      googleSub: session?.googleSub,
    },
    {
      inquiryId: id,
      session,
    },
  )

  return { id, account }
}

function createWorkspaceContext({
  rootPath,
  cwdPath,
  cwdRelativePath,
  changedFiles = [],
  changeDetectionLimited = false,
}) {
  return {
    rootPath,
    cwdPath,
    cwdRelativePath,
    changedAt: new Date().toISOString(),
    changedFiles,
    changeDetectionLimited,
  }
}

async function captureWorkspaceSnapshot(rootPath, cwdPath) {
  const entries = new Map()
  const cwdStat = await stat(cwdPath).catch(() => null)

  if (!cwdStat?.isDirectory()) {
    return { entries, limited: false }
  }

  let directoryCount = 0
  let fileCount = 0
  let limited = false

  const walk = async (targetPath) => {
    if (limited) {
      return
    }

    directoryCount += 1
    if (directoryCount > WORKSPACE_SNAPSHOT_MAX_DIRECTORIES) {
      limited = true
      return
    }

    const dirents = await readdir(targetPath, { withFileTypes: true }).catch(() => [])

    for (const entry of dirents) {
      if (limited) {
        break
      }

      if (entry.isDirectory()) {
        if (WORKSPACE_SNAPSHOT_SKIPPED_FOLDERS.has(entry.name.toLowerCase())) {
          continue
        }

        await walk(path.join(targetPath, entry.name))
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      fileCount += 1
      if (fileCount > WORKSPACE_SNAPSHOT_MAX_FILES) {
        limited = true
        break
      }

      const absolutePath = path.join(targetPath, entry.name)
      const fileStat = await stat(absolutePath).catch(() => null)

      if (!fileStat?.isFile()) {
        continue
      }

      const relativePath = toPortablePath(path.relative(rootPath, absolutePath))

      entries.set(relativePath, {
        relativePath,
        absolutePath,
        size: fileStat.size,
        updatedAt: fileStat.mtime.toISOString(),
        mtimeMs: fileStat.mtimeMs,
      })
    }
  }

  await walk(cwdPath)
  return { entries, limited }
}

function diffWorkspaceSnapshots(beforeSnapshot, afterSnapshot) {
  const changedFiles = []

  for (const [relativePath, afterEntry] of afterSnapshot.entries) {
    const beforeEntry = beforeSnapshot.entries.get(relativePath)

    if (!beforeEntry) {
      changedFiles.push({
        relativePath,
        absolutePath: afterEntry.absolutePath,
        changeType: 'created',
        size: afterEntry.size,
        updatedAt: afterEntry.updatedAt,
      })
      continue
    }

    if (beforeEntry.size !== afterEntry.size || beforeEntry.mtimeMs !== afterEntry.mtimeMs) {
      changedFiles.push({
        relativePath,
        absolutePath: afterEntry.absolutePath,
        changeType: 'modified',
        size: afterEntry.size,
        updatedAt: afterEntry.updatedAt,
      })
    }
  }

  for (const [relativePath, beforeEntry] of beforeSnapshot.entries) {
    if (afterSnapshot.entries.has(relativePath)) {
      continue
    }

    changedFiles.push({
      relativePath,
      absolutePath: beforeEntry.absolutePath,
      changeType: 'deleted',
      size: beforeEntry.size,
      updatedAt: beforeEntry.updatedAt,
    })
  }

  changedFiles.sort((left, right) => {
    const timeGap = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()

    if (timeGap !== 0) {
      return timeGap
    }

    return left.relativePath.localeCompare(right.relativePath, 'ko-KR', {
      numeric: true,
      sensitivity: 'base',
    })
  })

  const limitedByResultSize = changedFiles.length > WORKSPACE_CHANGE_RESULT_LIMIT

  return {
    changedFiles: changedFiles.slice(0, WORKSPACE_CHANGE_RESULT_LIMIT),
    changeDetectionLimited:
      beforeSnapshot.limited || afterSnapshot.limited || limitedByResultSize,
  }
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

function decodeBufferText(buffer) {
  if (!buffer || buffer.length === 0) {
    return ''
  }

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8')
  }

  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2))
  }

  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2))
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    try {
      return new TextDecoder('euc-kr', { fatal: true }).decode(buffer)
    } catch {
      return buffer.toString('utf8')
    }
  }
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
  const response = await fetchWithTimeout(
    `${stripTrailingSlash(OLLAMA_URL)}/api/tags`,
    undefined,
    OLLAMA_HEALTH_TIMEOUT_MS,
  )

  if (!response.ok) {
    throw new Error(`Ollama 연결에 실패했습니다. (${response.status})`)
  }

  const data = await raceWithTimeout(
    response.json(),
    OLLAMA_HEALTH_TIMEOUT_MS,
    'Ollama 모델 목록 응답 시간이 초과되었습니다.',
  )
  return Array.isArray(data.models) ? data.models.map((item) => item.name) : []
}

function selectPreferredOllamaModel(models = []) {
  if (!Array.isArray(models)) {
    return null
  }

  return models.find((item) => item === OLLAMA_LOCAL_MODEL) ?? null
}

function orderOllamaModels(models = []) {
  if (!Array.isArray(models)) {
    return []
  }

  const normalized = models.filter((item) => typeof item === 'string' && item.trim())
  const preferred = selectPreferredOllamaModel(normalized)

  if (!preferred) {
    return normalized
  }

  return [preferred, ...normalized.filter((item) => item !== preferred)]
}

function sanitizeStatusDetail(value, fallback) {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

function createOllamaStatusSnapshot({
  available,
  ready,
  models,
  detail,
  warning = null,
  lastError = null,
  stale = false,
  lastCheckedAt = null,
  lastSuccessAt = null,
}) {
  return {
    provider: 'ollama',
    available,
    ready,
    models,
    detail,
    warning,
    lastError,
    stale,
    lastCheckedAt,
    lastSuccessAt,
  }
}

async function getOllamaStatus() {
  if (pendingOllamaStatusPromise) {
    return pendingOllamaStatusPromise
  }

  pendingOllamaStatusPromise = (async () => {
    const checkedAt = new Date().toISOString()

    try {
      const models = orderOllamaModels(await getOllamaTags())
      const ready = models.length > 0
      const snapshot = createOllamaStatusSnapshot({
        available: true,
        ready,
        models,
        detail: ready
          ? `Ollama ${models[0]} 모델을 사용할 수 있습니다.`
          : 'Ollama 서버에는 설치된 모델이 없습니다.',
        lastCheckedAt: checkedAt,
        lastSuccessAt: checkedAt,
      })

      lastSuccessfulOllamaStatus = snapshot
      return snapshot
    } catch (error) {
      const lastError = sanitizeStatusDetail(
        error instanceof Error ? error.message : 'Ollama 상태를 확인하지 못했습니다.',
        'Ollama 상태를 확인하지 못했습니다.',
      )

      if (lastSuccessfulOllamaStatus) {
        return {
          ...lastSuccessfulOllamaStatus,
          warning: '최근 확인에 실패해 마지막 정상 상태를 표시 중입니다.',
          lastError,
          stale: true,
          lastCheckedAt: checkedAt,
        }
      }

      return createOllamaStatusSnapshot({
        available: false,
        ready: false,
        models: [],
        detail: 'Ollama 상태를 확인하지 못했습니다.',
        warning: '최근 확인에 실패했습니다.',
        lastError,
        stale: false,
        lastCheckedAt: checkedAt,
        lastSuccessAt: null,
      })
    } finally {
      pendingOllamaStatusPromise = null
    }
  })()

  return pendingOllamaStatusPromise
}

function spawnProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeoutMs = 0, input = null, ...spawnOptions } = options
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...spawnOptions,
    })

    const stdoutChunks = []
    const stderrChunks = []
    let timedOut = false
    let timer = null

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
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

      resolve({
        code,
        stdout: decodeBufferText(Buffer.concat(stdoutChunks)),
        stderr: decodeBufferText(Buffer.concat(stderrChunks)),
        timedOut,
      })
    })

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        stderrChunks.push(Buffer.from('\n프로세스 응답 시간이 초과되었습니다.', 'utf8'))
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

function encodeUtf8Base64(value) {
  return Buffer.from(value || '', 'utf8').toString('base64')
}

function inferCodexSandboxMode(prompt) {
  return /(파일|코드|수정|편집|구현|추가|삭제|저장|빌드|테스트|린트|커밋|푸시|리팩터)/.test(
    prompt || '',
  )
    ? 'workspace-write'
    : 'read-only'
}

function buildCodexPrompt({ prompt, messages, settings, agent, enabledTools, workspaceRoot, workspaceCwd }) {
  const assistantName = agent?.name || settings?.agentName || 'Artemis'
  const userName = settings?.userName || 'Master'
  const model = agent?.model || settings?.codexModel || 'gpt-5.4'
  const recentPayload = messages.slice(-8).map((item) => ({
    role: item.role === 'assistant' ? 'assistant' : 'user',
    speaker: item.role === 'assistant' ? assistantName : userName,
    text: item.text,
  }))
  const customInstructions = [
    agent?.systemPrompt,
    settings?.tone ? `Tone: ${settings.tone}` : '',
    settings?.responseStyle ? `Response style: ${settings.responseStyle}` : '',
    settings?.customInstructions ? `Extra instructions: ${settings.customInstructions}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    `Assistant name: ${assistantName}`,
    `User name: ${userName}`,
    `Target model: ${model}`,
    'Reply in Korean unless the decoded request explicitly asks for another language.',
    'The actual request and recent messages are encoded as UTF-8 base64 to avoid Windows terminal corruption. Decode them before reasoning.',
    'Use the decoded request as the source of truth.',
    'For informational requests, answer directly and do not inspect the workspace.',
    'If file edits are required, inspect and modify real files under the current working directory.',
    'Only edit files when the decoded request clearly asks for code or file changes.',
    'Do not claim file edits, commands, or verification you did not actually perform.',
    'If the request is broad, do the most useful work you can instead of blocking on unnecessary follow-up questions.',
    workspaceRoot ? `Workspace root: ${workspaceRoot}` : '',
    workspaceCwd ? `Current working directory: ${workspaceCwd}` : '',
    enabledTools.length > 0
      ? `Enabled tools:\n${enabledTools
          .slice(0, 6)
          .map((item) => `- ${item.title}: ${item.description}`)
          .join('\n')}`
      : '',
    customInstructions ? `Custom instructions UTF8_BASE64: ${encodeUtf8Base64(customInstructions)}` : '',
    `Recent messages UTF8_BASE64(JSON): ${encodeUtf8Base64(JSON.stringify(recentPayload))}`,
    `User request UTF8_BASE64: ${encodeUtf8Base64(prompt)}`,
    'Start with the direct answer, then add only the details that matter.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function runCodex({ prompt, messages, settings, agent, cwd, workspaceRoot, enabledTools }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'artemis-codex-'))
  const outputPath = path.join(tempDir, 'last-message.txt')
  const model = agent?.model || settings?.codexModel || 'gpt-5.4'
  const sandboxMode = inferCodexSandboxMode(prompt)
  const fullPrompt = buildCodexPrompt({
    prompt,
    messages,
    settings,
    agent,
    enabledTools,
    workspaceRoot,
    workspaceCwd: cwd,
  })

  try {
    const result = await spawnProcess(DEFAULT_CODEX_PATH, [
      'exec',
      '--skip-git-repo-check',
      '--full-auto',
      '-s',
      sandboxMode,
      '-C',
      cwd,
      '-o',
      outputPath,
      '--model',
      model,
      '-',
    ], {
      cwd,
      timeoutMs: EXECUTION_TIMEOUT_MS,
      input: fullPrompt,
    })
    const rawText = decodeBufferText(await readFile(outputPath).catch(() => Buffer.alloc(0)))

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
  const [ollamaStatusResult, codexStatusResult] = await Promise.allSettled([
    getOllamaStatus(),
    getCodexStatus(),
  ])
  const ollama =
    ollamaStatusResult.status === 'fulfilled'
      ? ollamaStatusResult.value
      : createOllamaStatusSnapshot({
          available: false,
          ready: false,
          models: [],
          detail: 'Ollama 상태를 확인하지 못했습니다.',
          warning: '최근 확인에 실패했습니다.',
          lastError: sanitizeStatusDetail(
            ollamaStatusResult.reason instanceof Error
              ? ollamaStatusResult.reason.message
              : 'Ollama 상태를 확인하지 못했습니다.',
            'Ollama 상태를 확인하지 못했습니다.',
          ),
          stale: false,
          lastCheckedAt: new Date().toISOString(),
          lastSuccessAt: lastSuccessfulOllamaStatus?.lastSuccessAt ?? null,
        })
  const codex =
    codexStatusResult.status === 'fulfilled'
      ? codexStatusResult.value
      : { available: false, ready: false, detail: 'Codex 상태를 확인하지 못했습니다.' }

  return {
    ok: true,
    defaultProvider: 'auto',
    providers: [
      ollama,
      {
        provider: 'codex',
        available: codex.available,
        ready: codex.ready,
        models: ['gpt-5.4', 'gpt-5.4-mini'],
        detail: codex.detail,
        warning: null,
        lastError: null,
        stale: false,
        lastCheckedAt: null,
        lastSuccessAt: null,
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

  const ollamaModel = health.providers.find((item) => item.provider === 'ollama')?.models[0] ?? null

  const workspaceRoot = await resolveWorkspaceRoot(body.rootPath)
  const workspaceCwd = resolveWorkspaceTarget(workspaceRoot, body.cwdPath || '').absolutePath
  if (chosenProvider === 'ollama') {
    const model = ollamaModel

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

async function executeWithWorkspace(body) {
  const workspaceRoot = await resolveWorkspaceRoot(body.rootPath)
  const workspaceTarget = resolveWorkspaceTarget(workspaceRoot, body.cwdPath || '')
  const workspaceContextBase = {
    rootPath: workspaceRoot,
    cwdPath: workspaceTarget.absolutePath,
    cwdRelativePath: workspaceTarget.relativePath,
  }
  const beforeSnapshot = await captureWorkspaceSnapshot(
    workspaceRoot,
    workspaceTarget.absolutePath,
  )
  const result = await execute(body)
  const afterSnapshot = await captureWorkspaceSnapshot(
    workspaceRoot,
    workspaceTarget.absolutePath,
  )
  const workspaceDiff = diffWorkspaceSnapshots(beforeSnapshot, afterSnapshot)

  return {
    ...result,
    workspace: createWorkspaceContext({
      ...workspaceContextBase,
      ...workspaceDiff,
    }),
  }
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
  const discoveredAt = new Date().toISOString()
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
      sourceType: 'hackerNews',
      sourceLabel: SOURCE_LABELS['Hacker News'] ?? 'Hacker News',
      category,
      categoryLabel: CODE_TO_CATEGORY[category] ?? category,
      publishedAt: item.created_at,
      discoveredAt,
      language: 'en',
      authorOrChannel: item.author || '',
      rawMeta: {
        hnObjectId: item.objectID,
        points: item.points ?? 0,
        comments: item.num_comments ?? 0,
        author: item.author ?? '',
        discussionUrl: `https://news.ycombinator.com/item?id=${item.objectID}`,
      },
    }))
}

async function fetchGitHubSignals(query, category) {
  const discoveredAt = new Date().toISOString()
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
    sourceType: 'github',
    sourceLabel: SOURCE_LABELS.GitHub ?? 'GitHub',
    category,
    categoryLabel: CODE_TO_CATEGORY[category] ?? category,
    publishedAt: repo.pushed_at || repo.updated_at,
    discoveredAt,
    language: 'en',
    authorOrChannel: repo.owner?.login || '',
    rawMeta: {
      fullName: repo.full_name,
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      watchers: repo.watchers_count ?? 0,
      openIssues: repo.open_issues_count ?? 0,
      language: repo.language ?? '',
      pushedAt: repo.pushed_at ?? '',
      owner: repo.owner?.login ?? '',
      defaultBranch: repo.default_branch ?? '',
    },
  }))
}

async function fetchArxivSignals(searchQuery, category) {
  const discoveredAt = new Date().toISOString()
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
    .map((entry, index) => {
      const title = stripHtml(extractXmlValue(entry, 'title'))
      const summary = stripHtml(extractXmlValue(entry, 'summary'))
      const url = extractXmlLink(entry)
      const publishedAt = extractXmlValue(entry, 'published') || new Date().toISOString()
      const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map((match) => stripHtml(match[1]))
      const arxivId = url.match(/arxiv\.org\/abs\/([^?#]+)/i)?.[1] ?? ''
      const primaryCategory = entry.match(/<arxiv:primary_category[^>]+term="([^"]+)"/i)?.[1] ?? ''

      return {
        id: `arxiv-${category}-${index}`,
        title,
        summary,
        url,
        source: 'arXiv',
        sourceType: 'arxiv',
        sourceLabel: SOURCE_LABELS.arXiv ?? 'arXiv',
        category,
        categoryLabel: CODE_TO_CATEGORY[category] ?? category,
        publishedAt,
        discoveredAt,
        language: 'en',
        authorOrChannel: authors.slice(0, 3).join(', '),
        rawMeta: {
          arxivId,
          authors,
          primaryCategory,
          pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : '',
        },
      }
    })
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
  const translationModel = models.find((item) => item === OLLAMA_LOCAL_MODEL) ?? null

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

async function collectSignalItems(category = '전체') {
  const normalizedCategory = normalizeCategory(category)
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
  return mixSignalItems(sorted, normalizedCategory)
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

  const deduped = await collectSignalItems(category)
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
    sendJson(request, response, 404, { ok: false, error: '요청 경로가 없습니다.' })
    return
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...createCorsHeaders(request),
    })
    response.end()
    return
  }

  try {
    const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
    const pathname = requestUrl.pathname

    if (request.method === 'GET' && request.url === '/api/health') {
      sendJson(request, response, 200, await getHealth())
      return
    }

    if (request.method === 'GET' && pathname === '/api/ai/providers') {
      sendJson(request, response, 200, {
        ok: true,
        providers: aiRouter.getProviders(),
      })
      return
    }

    if (request.method === 'POST' && pathname.startsWith('/api/ai/providers/')) {
      const segments = pathname.split('/').filter(Boolean)
      const provider = segments[3] ?? ''
      const action = segments[4] ?? ''
      const body = await readBody(request)

      if (action === 'save') {
        const saved = aiRouter.saveProvider(provider, {
          enabled: body.enabled,
          apiKey: body.apiKey,
          candidateModels: body.candidateModels,
          authType: body.authType,
        })
        if (saved.configured) {
          await aiRouter.refreshProviderModels(provider, { verify: false })
        }
        sendJson(request, response, 200, {
          ok: true,
          provider: aiRouter.getProviders().find((item) => item.provider === provider) ?? saved,
        })
        return
      }

      if (action === 'test') {
        sendJson(request, response, 200, {
          ok: true,
          ...(await aiRouter.testProvider(provider)),
        })
        return
      }
    }

    if (request.method === 'GET' && pathname === '/api/ai/models') {
      sendJson(request, response, 200, {
        ok: true,
        models: aiRouter.listModels({
          provider: requestUrl.searchParams.get('provider') ?? undefined,
          includeExcluded: parseBooleanFlag(requestUrl.searchParams.get('includeExcluded')),
        }),
      })
      return
    }

    if (request.method === 'POST' && pathname === '/api/ai/models/refresh') {
      const body = await readBody(request)
      const provider = body.provider ? String(body.provider) : ''
      const models = provider
        ? await aiRouter.refreshProviderModels(provider, { verify: true })
        : await aiRouter.refreshAllModels({ verify: true })
      sendJson(request, response, 200, {
        ok: true,
        models,
      })
      return
    }

    if (request.method === 'POST' && pathname === '/api/ai/route/preview') {
      const body = await readBody(request)
      sendJson(request, response, 200, {
        ok: true,
        ...(await aiRouter.previewRoute(body)),
      })
      return
    }

    if (request.method === 'GET' && pathname === '/api/ai/routing/logs') {
      sendJson(request, response, 200, {
        ok: true,
        items: aiRouter.listRoutingLogs({
          limit: Number(requestUrl.searchParams.get('limit') ?? 100),
        }),
      })
      return
    }

    if (request.method === 'GET' && pathname === '/api/ai/settings') {
      sendJson(request, response, 200, {
        ok: true,
        ...aiRouter.getSettings(),
      })
      return
    }

    if (request.method === 'POST' && pathname === '/api/ai/settings') {
      const body = await readBody(request)
      sendJson(request, response, 200, {
        ok: true,
        ...aiRouter.saveSettings(body),
      })
      return
    }

    if (request.method === 'POST' && pathname === '/api/ai/chat/stream') {
      const body = await readBody(request)
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        ...createCorsHeaders(request),
      })

      try {
        await aiRouter.streamChat(body, {
          writeEvent: async (eventName, payload) => {
            sendSseEvent(response, eventName, payload)
          },
        })
      } catch (error) {
        sendSseEvent(response, 'error', {
          message: error instanceof Error ? error.message : 'AI 스트리밍 중 오류가 발생했습니다.',
        })
      } finally {
        response.end()
      }
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/workspace/default')) {
      sendJson(request, response, 200, { ok: true, ...(await getDefaultWorkspace()) })
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/workspace/file')) {
      const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
      const rootPath = requestUrl.searchParams.get('rootPath') ?? undefined
      const filePath = requestUrl.searchParams.get('path') ?? ''
      sendJson(request, response, 200, {
        ok: true,
        ...(await readWorkspaceFileContent({ rootPath, filePath })),
      })
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/workspace')) {
      const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
      const rootPath = requestUrl.searchParams.get('rootPath') ?? undefined
      const currentPath = requestUrl.searchParams.get('path') ?? ''
      const includeSystem = parseBooleanFlag(requestUrl.searchParams.get('includeSystem'))
      sendJson(request, response, 200, {
        ok: true,
        ...(await listWorkspace({ rootPath, currentPath, includeSystem })),
      })
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/signals')) {
      const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
      const category = requestUrl.searchParams.get('category') || '전체'
      const feed = await buildSignalsFeed(category)

      sendJson(request, response, 200, {
        ok: true,
        generatedAt: feed.generatedAt,
        items: feed.items,
      })
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/auto-posts/assets')) {
      const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
      const assetPath = requestUrl.searchParams.get('path') ?? ''
      const { rootPath } = await getDefaultWorkspace()
      const target = resolveWorkspaceTarget(rootPath, assetPath)
      await sendFileResponse(request, response, target.absolutePath)
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/auto-posts/state')) {
      const payload = await autoPostsScheduler.getStatus()
      sendJson(request, response, 200, { ok: true, ...payload })
      return
    }

    if (request.method === 'GET' && request.url.startsWith('/api/auto-posts')) {
      const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`)
      const { pathname } = requestUrl

      if (pathname === '/api/auto-posts') {
        const posts = await autoPostsScheduler.listPosts()
        const state = await autoPostsScheduler.getStatus()
        sendJson(request, response, 200, {
          ok: true,
          items: posts.items,
          settings: state.settings,
          state: state.state,
        })
        return
      }

      const detailMatch = pathname.match(/^\/api\/auto-posts\/([^/]+)$/)
      if (detailMatch) {
        const post = await autoPostsScheduler.getPost(decodeURIComponent(detailMatch[1]))
        if (!post) {
          sendJson(request, response, 404, { ok: false, error: '게시글을 찾지 못했습니다.' })
          return
        }

        const { rootPath } = await getDefaultWorkspace()
        sendJson(request, response, 200, {
          ok: true,
          ...post,
          mediaAttachments: decorateAutoPostMedia(rootPath, post.mediaAttachments),
        })
        return
      }
    }

    if (request.method === 'POST' && request.url === '/api/auto-posts/run') {
      const body = await readBody(request)
      const result = await autoPostsScheduler.runNow({
        reason: 'manual',
        category: body.category || '전체',
        limit: body.limit,
        force: Boolean(body.force),
      })
      sendJson(request, response, 200, result)
      return
    }

    if (request.method === 'PATCH' && request.url === '/api/auto-posts/settings') {
      const body = await readBody(request)
      const settings = await autoPostsScheduler.updateSettings(body)
      const status = await autoPostsScheduler.getStatus()
      sendJson(request, response, 200, { ok: true, settings, state: status.state })
      return
    }

    const autoPostRegenerateMatch =
      request.method === 'POST'
        ? request.url.match(/^\/api\/auto-posts\/([^/]+)\/regenerate$/)
        : null
    if (autoPostRegenerateMatch) {
      const result = await autoPostsScheduler.regenerate(decodeURIComponent(autoPostRegenerateMatch[1]))
      sendJson(request, response, 200, result)
      return
    }

    const autoPostExportMatch =
      request.method === 'POST'
        ? request.url.match(/^\/api\/auto-posts\/([^/]+)\/publish-export$/)
        : null
    if (autoPostExportMatch) {
      const body = await readBody(request)
      const result = await autoPostsScheduler.exportPost(
        decodeURIComponent(autoPostExportMatch[1]),
        { format: body.format || 'html' },
      )
      sendJson(request, response, 200, { ok: true, ...result })
      return
    }

    const autoPostRevealMatch =
      request.method === 'POST'
        ? request.url.match(/^\/api\/auto-posts\/([^/]+)\/reveal$/)
        : null
    if (autoPostRevealMatch) {
      const result = await autoPostsScheduler.revealPostFolder(decodeURIComponent(autoPostRevealMatch[1]))
      sendJson(request, response, 200, { ok: true, ...result })
      return
    }

    if (request.method === 'GET' && request.url === '/api/x-autopost/state') {
      const payload = await xAutopostScheduler.getStatus()
      sendJson(request, response, 200, { ok: true, ...payload })
      return
    }

    if (request.method === 'GET' && request.url === '/api/x-autopost/queue') {
      const payload = await xAutopostScheduler.listQueue()
      sendJson(request, response, 200, { ok: true, ...payload })
      return
    }

    if (request.method === 'POST' && request.url === '/api/x-autopost/run') {
      const body = await readBody(request)
      const result = await xAutopostScheduler.runNow({
        category: body.category || '전체',
        limit: Number(body.limit || 1),
        force: Boolean(body.force),
        seedItems: Array.isArray(body.seedItems) ? body.seedItems : [],
        reason: body.reason || 'manual',
      })
      sendJson(request, response, 200, result)
      return
    }

    if (request.method === 'PATCH' && request.url === '/api/x-autopost/settings') {
      const body = await readBody(request)
      const payload = await xAutopostScheduler.updateSettings(body)
      sendJson(request, response, 200, { ok: true, ...payload })
      return
    }

    const xAutopostApproveMatch =
      request.method === 'POST'
        ? request.url.match(/^\/api\/x-autopost\/([^/]+)\/approve$/)
        : null
    if (xAutopostApproveMatch) {
      const result = await xAutopostScheduler.approveDraft(decodeURIComponent(xAutopostApproveMatch[1]))
      sendJson(request, response, 200, result)
      return
    }

    const xAutopostRejectMatch =
      request.method === 'POST'
        ? request.url.match(/^\/api\/x-autopost\/([^/]+)\/reject$/)
        : null
    if (xAutopostRejectMatch) {
      const body = await readBody(request)
      const result = await xAutopostScheduler.rejectDraft(
        decodeURIComponent(xAutopostRejectMatch[1]),
        typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'operator_rejected',
      )
      sendJson(request, response, 200, result)
      return
    }

    const xAutopostPublishMatch =
      request.method === 'POST'
        ? request.url.match(/^\/api\/x-autopost\/([^/]+)\/publish$/)
        : null
    if (xAutopostPublishMatch) {
      const body = await readBody(request)
      const result = await xAutopostScheduler.publishDraftNow(
        decodeURIComponent(xAutopostPublishMatch[1]),
        {
          dryRun: Boolean(body.dryRun),
        },
      )
      sendJson(request, response, 200, result)
      return
    }

    if (request.method === 'GET' && request.url === '/api/skills') {
      const catalog = await listSkills()
      sendJson(request, response, 200, {
        ok: true,
        generatedAt: catalog.generatedAt,
        items: catalog.items,
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/execute') {
      const body = await readBody(request)
      const result = await executeWithWorkspace(body)
      sendJson(request, response, 200, { ok: true, ...result })
      return
    }

    if (request.method === 'POST' && request.url === '/api/public/contact') {
      const body = await readBody(request)
      let session = null
      try {
        session = readPublicSessionFromRequest(request)
      } catch {
        session = null
      }
      sendJson(request, response, 200, {
        ok: true,
        ...(await savePublicInquiry({
          ...body,
          session,
        })),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/public/auth/google') {
      const body = await readBody(request)
      const authResult = await signInPublicAccountWithGoogle(body)
      sendJson(request, response, 200, {
        ok: true,
        account: authResult.account,
        authenticatedAt: authResult.authenticatedAt,
      }, {
        'Set-Cookie': createPublicSessionCookie(authResult.sessionToken),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/public/auth/signout') {
      sendJson(request, response, 200, { ok: true }, {
        'Set-Cookie': createPublicSessionCookie('', { clear: true }),
      })
      return
    }

    if (request.method === 'GET' && request.url === '/api/public/account/session') {
      sendJson(request, response, 200, {
        ok: true,
        account: await getAuthenticatedPublicAccount(request),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/public/account/start') {
      const body = await readBody(request)
      const session = readPublicSessionFromRequest(request)
      sendJson(request, response, 200, {
        ok: true,
        account: await savePublicAccount(body, { session }),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/public/account/activate') {
      const body = await readBody(request)
      const session = readPublicSessionFromRequest(request)
      sendJson(request, response, 200, {
        ok: true,
        account: await savePublicAccount(body, { activate: true, session }),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/workspace/folder') {
      const body = await readBody(request)
      sendJson(request, response, 200, {
        ok: true,
        ...(await createWorkspaceFolder({
          rootPath: body.rootPath,
          currentPath: body.currentPath,
          name: body.name,
          includeSystem: parseBooleanFlag(body.includeSystem),
        })),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/workspace/write') {
      const body = await readBody(request)
      sendJson(request, response, 200, {
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
      sendJson(request, response, 200, {
        ok: true,
        ...(await uploadWorkspaceFiles({
          rootPath: body.rootPath,
          currentPath: body.currentPath,
          files: body.files,
          includeSystem: parseBooleanFlag(body.includeSystem),
        })),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/workspace/delete') {
      const body = await readBody(request)
      sendJson(request, response, 200, {
        ok: true,
        ...(await deleteWorkspaceEntry({
          rootPath: body.rootPath,
          targetPath: body.path,
          includeSystem: parseBooleanFlag(body.includeSystem),
        })),
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/workspace/reveal') {
      const body = await readBody(request)
      sendJson(request, response, 200, {
        ok: true,
        ...(await revealWorkspacePath({
          rootPath: body.rootPath,
          targetPath: body.path,
        })),
      })
      return
    }

    sendJson(request, response, 404, { ok: false, error: '지원하지 않는 경로입니다.' })
  } catch (error) {
    sendJson(request, response, getErrorStatus(error), {
      ok: false,
      error: error instanceof Error ? error.message : '브리지 내부 오류가 발생했습니다.',
    })
  }
})

autoPostsScheduler.init().catch((error) => {
  console.error(
    '[auto-posts] scheduler init failed',
    error instanceof Error ? error.message : error,
  )
})

xAutopostScheduler.start().catch((error) => {
  console.error(
    '[x-autopost] scheduler init failed',
    error instanceof Error ? error.message : error,
  )
})

server.listen(PORT, HOST, () => {
  console.log(`Artemis bridge listening on http://${HOST}:${PORT}`)
})
