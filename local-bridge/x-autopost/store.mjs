import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nowIso, toPortablePath } from '../auto-posts/normalize.mjs'
import {
  createDefaultXAutopostLogs,
  createDefaultXAutopostQueue,
  createDefaultXAutopostSettings,
  createDefaultXAutopostState,
  mergeXAutopostSettings,
} from './config.mjs'

async function readJsonFile(targetPath, fallback) {
  try {
    const raw = await readFile(targetPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeAtomic(targetPath, content) {
  await mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, content, 'utf8')
  await rename(tempPath, targetPath)
}

function sortQueue(items = []) {
  const priority = {
    scheduled: 0,
    approved: 1,
    draft: 2,
    failed: 3,
    skipped: 4,
    posted: 5,
  }

  return [...items].sort((left, right) => {
    const leftRank = priority[left.status] ?? 99
    const rightRank = priority[right.status] ?? 99
    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    const leftTime = Date.parse(left.scheduledAt || left.updatedAt || left.createdAt || 0)
    const rightTime = Date.parse(right.scheduledAt || right.updatedAt || right.createdAt || 0)
    const passiveStatuses = new Set(['posted', 'skipped', 'failed'])
    return passiveStatuses.has(left.status) || passiveStatuses.has(right.status)
      ? rightTime - leftTime
      : leftTime - rightTime
  })
}

function trimLogs(items = []) {
  return [...items]
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0))
    .slice(0, 400)
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
    settingsPath: path.join(outputRoot, 'settings.json'),
    statePath: path.join(outputRoot, 'state.json'),
    queuePath: path.join(outputRoot, 'queue.json'),
    logsPath: path.join(outputRoot, 'logs.json'),
  }
}

export function createXAutopostStore() {
  async function getSettings(workspaceRoot) {
    const defaults = createDefaultXAutopostSettings()
    const storagePaths = resolveStoragePaths(workspaceRoot, defaults)
    const saved = await readJsonFile(storagePaths.settingsPath, defaults)
    return mergeXAutopostSettings(defaults, saved)
  }

  async function saveSettings(workspaceRoot, patch = {}) {
    const current = await getSettings(workspaceRoot)
    const next = mergeXAutopostSettings(current, patch)
    const storagePaths = resolveStoragePaths(workspaceRoot, next)
    await mkdir(storagePaths.outputRoot, { recursive: true })
    await writeAtomic(storagePaths.settingsPath, JSON.stringify(next, null, 2))
    return next
  }

  async function getState(workspaceRoot, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const fallback = createDefaultXAutopostState(settings)
    const saved = await readJsonFile(storagePaths.statePath, fallback)
    return {
      ...fallback,
      ...saved,
      postedDraftIds: Array.isArray(saved.postedDraftIds) ? saved.postedDraftIds.slice(-300) : [],
      skippedDraftIds: Array.isArray(saved.skippedDraftIds) ? saved.skippedDraftIds.slice(-300) : [],
      updatedAt: saved.updatedAt || fallback.updatedAt,
    }
  }

  async function saveState(workspaceRoot, patch = {}, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const current = await getState(workspaceRoot, settings)
    const next = {
      ...current,
      ...patch,
      postedDraftIds: Array.isArray(patch.postedDraftIds) ? patch.postedDraftIds.slice(-300) : current.postedDraftIds,
      skippedDraftIds: Array.isArray(patch.skippedDraftIds) ? patch.skippedDraftIds.slice(-300) : current.skippedDraftIds,
      updatedAt: nowIso(),
    }
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    await mkdir(storagePaths.outputRoot, { recursive: true })
    await writeAtomic(storagePaths.statePath, JSON.stringify(next, null, 2))
    return next
  }

  async function getQueue(workspaceRoot, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const saved = await readJsonFile(storagePaths.queuePath, createDefaultXAutopostQueue())
    return Array.isArray(saved) ? sortQueue(saved).slice(0, settings.maxQueueItems) : []
  }

  async function saveQueue(workspaceRoot, items, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const payload = sortQueue(items).slice(0, settings.maxQueueItems)
    await mkdir(storagePaths.outputRoot, { recursive: true })
    await writeAtomic(storagePaths.queuePath, JSON.stringify(payload, null, 2))
    return payload
  }

  async function getLogs(workspaceRoot, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const saved = await readJsonFile(storagePaths.logsPath, createDefaultXAutopostLogs())
    return Array.isArray(saved) ? trimLogs(saved) : []
  }

  async function saveLogs(workspaceRoot, items, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    const payload = trimLogs(items)
    await mkdir(storagePaths.outputRoot, { recursive: true })
    await writeAtomic(storagePaths.logsPath, JSON.stringify(payload, null, 2))
    return payload
  }

  async function appendLog(workspaceRoot, entry, explicitSettings = null) {
    const settings = explicitSettings ?? (await getSettings(workspaceRoot))
    const currentLogs = await getLogs(workspaceRoot, settings)
    const nextEntry = {
      id: entry.id || `x-autopost-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: entry.createdAt || nowIso(),
      level: entry.level || 'info',
      action: entry.action || 'note',
      message: entry.message || '',
      draftId: entry.draftId || null,
      meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : null,
    }
    await saveLogs(workspaceRoot, [nextEntry, ...currentLogs], settings)
    return nextEntry
  }

  async function ensureInitialized(workspaceRoot) {
    const settings = await getSettings(workspaceRoot)
    const storagePaths = resolveStoragePaths(workspaceRoot, settings)
    await mkdir(storagePaths.outputRoot, { recursive: true })
    await Promise.all([
      getState(workspaceRoot, settings),
      getQueue(workspaceRoot, settings),
      getLogs(workspaceRoot, settings),
    ])
    return { settings, storagePaths }
  }

  async function listQueue(workspaceRoot) {
    const settings = await getSettings(workspaceRoot)
    const [items, state, logs] = await Promise.all([
      getQueue(workspaceRoot, settings),
      getState(workspaceRoot, settings),
      getLogs(workspaceRoot, settings),
    ])
    return { settings, state, items, logs }
  }

  return {
    ensureInitialized,
    getSettings,
    saveSettings,
    getState,
    saveState,
    getQueue,
    saveQueue,
    getLogs,
    saveLogs,
    appendLog,
    listQueue,
    resolveStoragePaths,
    toPortablePath,
  }
}
