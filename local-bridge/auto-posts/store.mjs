import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  nowIso,
  parseBooleanFlag,
  sanitizeFileSegment,
  slugify,
  toPortablePath,
} from './normalize.mjs'
import { DEFAULT_CATEGORY_WEIGHTS } from './scoring.mjs'

const DEFAULT_OUTPUT_DIR = 'generated-posts'
const DEFAULT_MEDIA_DIR = 'media-cache'

function parseInteger(value, fallback, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)))
}

function createDefaultSettings() {
  return {
    enabled: parseBooleanFlag(process.env.ARTEMIS_AUTO_POST_ENABLED, true),
    intervalMs: parseInteger(process.env.ARTEMIS_AUTO_POST_INTERVAL_MS, 3_600_000, {
      minimum: 60_000,
      maximum: 24 * 60 * 60 * 1000,
    }),
    topK: parseInteger(process.env.ARTEMIS_AUTO_POST_TOP_K, 1, {
      minimum: 1,
      maximum: 3,
    }),
    categoryWeights: { ...DEFAULT_CATEGORY_WEIGHTS },
    generationModel:
      String(process.env.ARTEMIS_AUTO_POST_MODEL ?? 'gpt-5.4-mini').trim() || 'gpt-5.4-mini',
    screenshotFallback: parseBooleanFlag(process.env.ARTEMIS_AUTO_POST_SCREENSHOT_FALLBACK, true),
    outputDir: String(process.env.ARTEMIS_AUTO_POST_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR).trim() || DEFAULT_OUTPUT_DIR,
  }
}

function createDefaultState(settings) {
  return {
    lastRunAt: null,
    lastSuccessAt: null,
    nextRunAt: settings.enabled ? new Date(Date.now() + settings.intervalMs).toISOString() : null,
    inProgress: false,
    lastError: '',
    processedUrlHashes: [],
    generatedPostIds: [],
  }
}

function createDefaultIndex() {
  return {
    updatedAt: null,
    items: [],
  }
}

async function readJsonFile(targetPath, fallback) {
  try {
    const raw = await readFile(targetPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeAtomic(targetPath, content, encoding = 'utf8') {
  await mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, content, encoding)
  await rename(tempPath, targetPath)
}

function mergeSettings(current, patch = {}) {
  return {
    ...current,
    enabled: patch.enabled === undefined ? current.enabled : parseBooleanFlag(patch.enabled, current.enabled),
    intervalMs:
      patch.intervalMs === undefined
        ? current.intervalMs
        : parseInteger(patch.intervalMs, current.intervalMs, {
            minimum: 60_000,
            maximum: 24 * 60 * 60 * 1000,
          }),
    topK:
      patch.topK === undefined
        ? current.topK
        : parseInteger(patch.topK, current.topK, { minimum: 1, maximum: 3 }),
    categoryWeights: {
      ...current.categoryWeights,
      ...(patch.categoryWeights && typeof patch.categoryWeights === 'object' ? patch.categoryWeights : {}),
    },
    generationModel:
      typeof patch.generationModel === 'string' && patch.generationModel.trim()
        ? patch.generationModel.trim()
        : current.generationModel,
    screenshotFallback:
      patch.screenshotFallback === undefined
        ? current.screenshotFallback
        : parseBooleanFlag(patch.screenshotFallback, current.screenshotFallback),
    outputDir:
      typeof patch.outputDir === 'string' && patch.outputDir.trim()
        ? patch.outputDir.trim()
        : current.outputDir,
  }
}

function sortIndexItems(items = []) {
  return [...items].sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0))
}

function buildSummaryRecord(post, storagePaths) {
  const hero = Array.isArray(post.mediaAttachments)
    ? [...post.mediaAttachments].sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0))[0]
    : null

  const thumbnail = hero?.localPath
    ? `/api/auto-posts/assets?path=${encodeURIComponent(
        toPortablePath(path.relative(storagePaths.workspaceRoot, hero.localPath)),
      )}`
    : hero?.thumbnailUrl || hero?.url || ''

  return {
    id: post.id,
    slug: post.slug,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    category: post.category,
    status: post.status,
    topicScore: post.topicScore,
    title: post.title,
    previewText: post.plainTextSummary,
    threeLineSummary: post.threeLineSummary,
    thumbnail,
    dedupeKey: post.dedupeKey,
    generationModel: post.generationModel,
    sourceCount: Array.isArray(post.sourceItems) ? post.sourceItems.length : 0,
    workspacePath: post.workspacePath,
    htmlPath: toPortablePath(path.relative(storagePaths.workspaceRoot, post.htmlFilePath)),
    jsonPath: toPortablePath(path.relative(storagePaths.workspaceRoot, post.jsonFilePath)),
  }
}

function resolveOutputRoot(workspaceRoot, outputDir) {
  if (path.isAbsolute(outputDir)) {
    return path.resolve(outputDir)
  }

  return path.resolve(workspaceRoot, outputDir)
}

function resolveStoragePaths(workspaceRoot, settings) {
  const outputRoot = resolveOutputRoot(workspaceRoot, settings.outputDir)
  return {
    workspaceRoot,
    outputRoot,
    mediaRoot: path.resolve(workspaceRoot, DEFAULT_MEDIA_DIR),
    settingsPath: path.join(outputRoot, 'settings.json'),
    statePath: path.join(outputRoot, 'state.json'),
    indexPath: path.join(outputRoot, 'index.json'),
  }
}

export function createAutoPostsStore() {
  async function getSettings(workspaceRoot) {
    const defaults = createDefaultSettings()
    const storagePaths = resolveStoragePaths(workspaceRoot, defaults)
    const fromDisk = await readJsonFile(storagePaths.settingsPath, defaults)
    return mergeSettings(defaults, fromDisk)
  }

  async function saveSettings(workspaceRoot, patch) {
    const current = await getSettings(workspaceRoot)
    const next = mergeSettings(current, patch)
    const storagePaths = resolveStoragePaths(workspaceRoot, next)
    await mkdir(storagePaths.outputRoot, { recursive: true })
    await writeAtomic(storagePaths.settingsPath, JSON.stringify(next, null, 2))
    return next
  }

  async function getState(workspaceRoot) {
    const settings = await getSettings(workspaceRoot)
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const fallback = createDefaultState(settings)
    const fromDisk = await readJsonFile(storagePaths.statePath, fallback)
    return {
      ...fallback,
      ...fromDisk,
      processedUrlHashes: Array.isArray(fromDisk.processedUrlHashes)
        ? fromDisk.processedUrlHashes.slice(-600)
        : [],
      generatedPostIds: Array.isArray(fromDisk.generatedPostIds)
        ? fromDisk.generatedPostIds.slice(-200)
        : [],
    }
  }

  async function saveState(workspaceRoot, nextState, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const fallback = createDefaultState(settings)
    const payload = {
      ...fallback,
      ...nextState,
      processedUrlHashes: Array.isArray(nextState.processedUrlHashes)
        ? nextState.processedUrlHashes.slice(-600)
        : fallback.processedUrlHashes,
      generatedPostIds: Array.isArray(nextState.generatedPostIds)
        ? nextState.generatedPostIds.slice(-200)
        : fallback.generatedPostIds,
    }
    await mkdir(storagePaths.outputRoot, { recursive: true })
    await writeAtomic(storagePaths.statePath, JSON.stringify(payload, null, 2))
    return payload
  }

  async function getIndex(workspaceRoot, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const index = await readJsonFile(storagePaths.indexPath, createDefaultIndex())
    return {
      updatedAt: index.updatedAt ?? null,
      items: Array.isArray(index.items) ? sortIndexItems(index.items) : [],
    }
  }

  async function saveIndex(workspaceRoot, items, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const payload = {
      updatedAt: nowIso(),
      items: sortIndexItems(items),
    }
    await mkdir(storagePaths.outputRoot, { recursive: true })
    await writeAtomic(storagePaths.indexPath, JSON.stringify(payload, null, 2))
    return payload
  }

  async function listPosts(workspaceRoot) {
    const settings = await getSettings(workspaceRoot)
    const index = await getIndex(workspaceRoot, settings)
    return {
      settings,
      items: index.items,
    }
  }

  async function readPost(workspaceRoot, id) {
    const settings = await getSettings(workspaceRoot)
    const index = await getIndex(workspaceRoot, settings)
    const summary = index.items.find((item) => item.id === id)
    if (!summary) {
      return null
    }

    const targetPath = path.resolve(workspaceRoot, summary.jsonPath)
    const payload = await readJsonFile(targetPath, null)
    return payload ? { ...payload, summary } : null
  }

  async function saveGeneratedPost(workspaceRoot, postInput, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const createdAt = postInput.createdAt || nowIso()
    const updatedAt = postInput.updatedAt || createdAt
    const dateDir = createdAt.slice(0, 10)
    const timestamp = createdAt.replace(/[-:TZ.]/g, '').slice(0, 14)
    const slug = sanitizeFileSegment(postInput.slug || slugify(postInput.title), 'post')
    const dayRoot = path.join(storagePaths.outputRoot, dateDir)
    const htmlFilePath = path.join(dayRoot, `${timestamp}-${slug}.html`)
    const jsonFilePath = path.join(dayRoot, `${timestamp}-${slug}.json`)

    await mkdir(dayRoot, { recursive: true })
    await mkdir(storagePaths.mediaRoot, { recursive: true })

    const workspacePath = toPortablePath(path.relative(workspaceRoot, htmlFilePath))
    const post = {
      ...postInput,
      slug,
      createdAt,
      updatedAt,
      workspacePath,
      htmlFilePath,
      jsonFilePath,
    }

    await writeAtomic(htmlFilePath, post.html || '', 'utf8')
    await writeAtomic(jsonFilePath, JSON.stringify(post, null, 2), 'utf8')

    const index = await getIndex(workspaceRoot, settings)
    const summary = buildSummaryRecord(post, storagePaths)
    const nextItems = [
      summary,
      ...index.items.filter((item) => item.id !== post.id),
    ]
    await saveIndex(workspaceRoot, nextItems, settings)

    return { ...post, summary }
  }

  async function exportPost(workspaceRoot, id, { format = 'html' } = {}) {
    const post = await readPost(workspaceRoot, id)
    if (!post) {
      throw new Error('게시글을 찾지 못했습니다.')
    }

    const exportDir = path.join(
      resolveStoragePaths(workspaceRoot, await getSettings(workspaceRoot)).outputRoot,
      'exports',
    )
    await mkdir(exportDir, { recursive: true })

    const baseName = `${post.createdAt.replace(/[-:TZ.]/g, '').slice(0, 14)}-${sanitizeFileSegment(post.slug, 'post')}`

    if (format === 'markdown') {
      const markdownPath = path.join(exportDir, `${baseName}.md`)
      const markdown = [
        `# ${post.title}`,
        '',
        ...(Array.isArray(post.subtitleLines) ? post.subtitleLines : []),
        '',
        post.plainTextSummary || '',
        '',
        '## 세 줄 요약',
        ...(Array.isArray(post.threeLineSummary) ? post.threeLineSummary.map((item) => `- ${item}`) : []),
        '',
        '## 원문 링크',
        ...(Array.isArray(post.sourceItems)
          ? post.sourceItems.map((item) => `- [${item.title}](${item.url})`)
          : []),
      ].join('\n')
      await writeAtomic(markdownPath, markdown, 'utf8')
      return { format: 'markdown', absolutePath: markdownPath, relativePath: toPortablePath(path.relative(workspaceRoot, markdownPath)) }
    }

    const htmlPath = path.join(exportDir, `${baseName}.html`)
    await writeAtomic(htmlPath, post.html || '', 'utf8')
    return { format: 'html', absolutePath: htmlPath, relativePath: toPortablePath(path.relative(workspaceRoot, htmlPath)) }
  }

  async function resolvePostFolder(workspaceRoot, id) {
    const post = await readPost(workspaceRoot, id)
    if (!post) {
      throw new Error('게시글을 찾지 못했습니다.')
    }

    return path.dirname(post.htmlFilePath)
  }

  async function hasPostWithDedupeKey(workspaceRoot, dedupeKey) {
    const { items } = await listPosts(workspaceRoot)
    return items.some((item) => item.dedupeKey === dedupeKey)
  }

  async function ensureInitialized(workspaceRoot) {
    const settings = await getSettings(workspaceRoot)
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    await mkdir(storagePaths.outputRoot, { recursive: true })
    await mkdir(storagePaths.mediaRoot, { recursive: true })
    await saveSettings(workspaceRoot, settings)
    await saveState(workspaceRoot, await getState(workspaceRoot), settings)
    await saveIndex(workspaceRoot, (await getIndex(workspaceRoot, settings)).items, settings)
    return { settings, storagePaths }
  }

  return {
    createDefaultSettings,
    createDefaultState,
    ensureInitialized,
    getSettings,
    saveSettings,
    getState,
    saveState,
    getIndex,
    saveIndex,
    listPosts,
    readPost,
    saveGeneratedPost,
    exportPost,
    resolvePostFolder,
    hasPostWithDedupeKey,
    resolveStoragePaths,
  }
}
