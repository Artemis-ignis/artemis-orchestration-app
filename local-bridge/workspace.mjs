import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const DEFAULT_WORKSPACE_ROOT = path.resolve(process.env.ARTEMIS_WORKSPACE_ROOT ?? process.cwd())

const MIME_TYPES = new Map([
  ['.css', 'text/css'],
  ['.csv', 'text/csv'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript'],
  ['.json', 'application/json'],
  ['.log', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.mjs', 'text/javascript'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ts', 'text/typescript'],
  ['.tsx', 'text/typescript'],
  ['.txt', 'text/plain'],
  ['.xml', 'application/xml'],
  ['.yaml', 'application/yaml'],
  ['.yml', 'application/yaml'],
])

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.log',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
  '.csv',
  '.svg',
])

const TEXT_FILE_NAMES = new Set([
  '.editorconfig',
  '.env',
  '.env.development',
  '.env.example',
  '.env.local',
  '.env.production',
  '.env.test',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
])

const FILE_NAME_MIME_TYPES = new Map([
  ['.editorconfig', 'text/plain'],
  ['.env', 'text/plain'],
  ['.env.development', 'text/plain'],
  ['.env.example', 'text/plain'],
  ['.env.local', 'text/plain'],
  ['.env.production', 'text/plain'],
  ['.env.test', 'text/plain'],
  ['.gitattributes', 'text/plain'],
  ['.gitignore', 'text/plain'],
  ['.npmrc', 'text/plain'],
  ['.nvmrc', 'text/plain'],
])

const PROTECTED_DELETE_ROOT_NAMES = new Set(['.git', 'node_modules'])
const DEFAULT_HIDDEN_WORKSPACE_FOLDER_NAMES = new Set([
  '.artemis-logs',
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
const DEFAULT_HIDDEN_WORKSPACE_FILE_NAMES = new Set(['.ds_store', 'thumbs.db'])

function toPortablePath(value = '') {
  return value.split(path.sep).join('/')
}

function fromPortablePath(value = '') {
  return String(value).replace(/[\\/]+/g, path.sep)
}

function ensureValidName(name) {
  const trimmed = String(name || '').trim()

  if (!trimmed) {
    throw new Error('?대쫫???낅젰??二쇱꽭??')
  }

  if (trimmed === '.' || trimmed === '..') {
    throw new Error('?꾩옱 ?먮뒗 ?곸쐞 寃쎈줈 ?대쫫? ?ъ슜?????놁뒿?덈떎.')
  }

  if (/[\\/]/.test(trimmed)) {
    throw new Error('?대쫫?먮뒗 寃쎈줈 援щ텇?먮? ?ｌ쓣 ???놁뒿?덈떎.')
  }

  return trimmed
}

export async function resolveWorkspaceRoot(rootPath) {
  const requestedRoot = path.resolve(
    String(rootPath || DEFAULT_WORKSPACE_ROOT).trim() || DEFAULT_WORKSPACE_ROOT,
  )
  const requestedStat = await stat(requestedRoot).catch(() => null)

  if (requestedStat?.isDirectory()) {
    return requestedRoot
  }

  if (requestedStat && !requestedStat.isDirectory()) {
    throw new Error('작업 폴더는 디렉터리여야 합니다.')
  }

  if (requestedRoot !== DEFAULT_WORKSPACE_ROOT) {
    const fallbackStat = await stat(DEFAULT_WORKSPACE_ROOT).catch(() => null)
    if (fallbackStat?.isDirectory()) {
      return DEFAULT_WORKSPACE_ROOT
    }
  }

  throw new Error('작업 폴더를 찾지 못했습니다.')
}

export async function getDefaultWorkspace() {
  const rootPath = await resolveWorkspaceRoot(DEFAULT_WORKSPACE_ROOT)
  return { rootPath }
}

export function resolveWorkspaceTarget(rootPath, targetPath = '') {
  const normalizedRoot = path.resolve(rootPath)
  const resolved = path.resolve(normalizedRoot, fromPortablePath(targetPath || '.'))
  const relative = path.relative(normalizedRoot, resolved)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('?묒뾽 ?대뜑 諛붽묑 寃쎈줈???ъ슜?????놁뒿?덈떎.')
  }

  return {
    rootPath: normalizedRoot,
    absolutePath: resolved,
    relativePath: relative ? toPortablePath(relative) : '',
  }
}

function getMimeType(fileName) {
  const normalizedName = path.basename(fileName).toLowerCase()
  const exactMatch = FILE_NAME_MIME_TYPES.get(normalizedName)

  if (exactMatch) {
    return exactMatch
  }

  const extension = path.extname(fileName).toLowerCase()
  return MIME_TYPES.get(extension) ?? 'application/octet-stream'
}

function isTextFile(fileName, mimeType, size, buffer) {
  const normalizedName = path.basename(fileName).toLowerCase()
  const extension = path.extname(fileName).toLowerCase()

  if (TEXT_FILE_NAMES.has(normalizedName)) {
    return true
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return true
  }

  if (mimeType.startsWith('text/')) {
    return true
  }

  if (!buffer || size > 512_000) {
    return false
  }

  for (const byte of buffer) {
    if (byte === 0) {
      return false
    }
  }

  return true
}

function getDeleteProtection(relativePath) {
  if (!relativePath) {
    return {
      deletable: false,
      protectionReason: '?묒뾽 猷⑦듃 ?먯껜????젣?????놁뒿?덈떎.',
    }
  }

  const rootName = relativePath.split('/')[0]?.toLowerCase() ?? ''

  if (PROTECTED_DELETE_ROOT_NAMES.has(rootName)) {
    return {
      deletable: false,
      protectionReason: `${rootName} 寃쎈줈???꾨줈?앺듃 ?덉쟾???꾪빐 ???덉뿉????젣?섏? ?딆뒿?덈떎.`,
    }
  }

  return {
    deletable: true,
    protectionReason: null,
  }
}

function isWorkspaceSystemEntry(entry) {
  const normalizedName = entry.name.trim().toLowerCase()

  if (entry.kind === 'folder') {
    return DEFAULT_HIDDEN_WORKSPACE_FOLDER_NAMES.has(normalizedName)
  }

  return DEFAULT_HIDDEN_WORKSPACE_FILE_NAMES.has(normalizedName)
}

function buildEntry(rootPath, absolutePath, targetStat) {
  const relativePath = toPortablePath(path.relative(rootPath, absolutePath))
  const name = path.basename(absolutePath)
  const kind = targetStat.isDirectory() ? 'folder' : 'file'
  const mimeType = kind === 'folder' ? 'inode/directory' : getMimeType(name)
  const deleteProtection = getDeleteProtection(relativePath)

  return {
    name,
    kind,
    relativePath,
    absolutePath,
    parentPath: relativePath ? toPortablePath(path.dirname(relativePath)).replace(/^\.$/, '') : '',
    mimeType,
    size: kind === 'file' ? targetStat.size : 0,
    updatedAt: targetStat.mtime.toISOString(),
    editable: kind === 'file' ? isTextFile(name, mimeType, targetStat.size) : false,
    deletable: deleteProtection.deletable,
    protectionReason: deleteProtection.protectionReason,
  }
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'folder' ? -1 : 1
    }

    return left.name.localeCompare(right.name, 'ko-KR', { numeric: true, sensitivity: 'base' })
  })
}

export async function listWorkspace({ rootPath, currentPath = '', includeSystem = false }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const target = resolveWorkspaceTarget(normalizedRoot, currentPath)
  const targetStat = await stat(target.absolutePath).catch(() => null)

  if (!targetStat || !targetStat.isDirectory()) {
    throw new Error('?대뜑瑜?李얠? 紐삵뻽?듬땲??')
  }

  const dirents = await readdir(target.absolutePath, { withFileTypes: true })
  const entries = await Promise.all(
    dirents.map(async (dirent) => {
      const absolutePath = path.join(target.absolutePath, dirent.name)
      const nextStat = await stat(absolutePath)
      return buildEntry(normalizedRoot, absolutePath, nextStat)
    }),
  )

  const systemEntryCount = entries.filter((item) => isWorkspaceSystemEntry(item)).length
  const visibleEntries = includeSystem ? entries : entries.filter((item) => !isWorkspaceSystemEntry(item))
  const sortedEntries = sortEntries(visibleEntries)
  const fileCount = sortedEntries.filter((item) => item.kind === 'file').length
  const folderCount = sortedEntries.filter((item) => item.kind === 'folder').length
  const totalBytes = sortedEntries.reduce((sum, item) => sum + item.size, 0)
  const parentPath = target.relativePath
    ? toPortablePath(path.dirname(target.relativePath)).replace(/^\.$/, '')
    : null

  return {
    rootPath: normalizedRoot,
    currentPath: target.relativePath,
    absolutePath: target.absolutePath,
    parentPath,
    entries: sortedEntries,
    summary: {
      totalEntries: sortedEntries.length,
      fileCount,
      folderCount,
      totalBytes,
      systemEntryCount,
    },
  }
}

export async function readWorkspaceFileContent({ rootPath, filePath }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const target = resolveWorkspaceTarget(normalizedRoot, filePath)
  const targetStat = await stat(target.absolutePath).catch(() => null)

  if (!targetStat || !targetStat.isFile()) {
    throw new Error('?뚯씪??李얠? 紐삵뻽?듬땲??')
  }

  const buffer = await readFile(target.absolutePath)
  const mimeType = getMimeType(path.basename(target.absolutePath))
  const editable = isTextFile(path.basename(target.absolutePath), mimeType, targetStat.size, buffer)
  const deleteProtection = getDeleteProtection(target.relativePath)

  return {
    rootPath: normalizedRoot,
    relativePath: target.relativePath,
    absolutePath: target.absolutePath,
    name: path.basename(target.absolutePath),
    mimeType,
    size: targetStat.size,
    updatedAt: targetStat.mtime.toISOString(),
    editable,
    deletable: deleteProtection.deletable,
    protectionReason: deleteProtection.protectionReason,
    content: editable ? buffer.toString('utf8') : '',
  }
}

export async function createWorkspaceFolder({ rootPath, currentPath = '', name, includeSystem = false }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const parent = resolveWorkspaceTarget(normalizedRoot, currentPath)
  const safeName = ensureValidName(name)
  const nextPath = path.join(parent.absolutePath, safeName)

  await mkdir(nextPath)
  return listWorkspace({ rootPath: normalizedRoot, currentPath: parent.relativePath, includeSystem })
}

export async function writeWorkspaceFileContent({ rootPath, filePath, content }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const target = resolveWorkspaceTarget(normalizedRoot, filePath)

  await writeFile(target.absolutePath, String(content ?? ''), 'utf8')
  return readWorkspaceFileContent({ rootPath: normalizedRoot, filePath: target.relativePath })
}

export async function uploadWorkspaceFiles({
  rootPath,
  currentPath = '',
  files,
  includeSystem = false,
}) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const parent = resolveWorkspaceTarget(normalizedRoot, currentPath)

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('?낅줈?쒗븷 ?뚯씪???놁뒿?덈떎.')
  }

  for (const item of files) {
    const safeName = ensureValidName(item.name)
    const targetPath = path.join(parent.absolutePath, safeName)
    const bytes = Buffer.from(String(item.contentBase64 || ''), 'base64')
    await writeFile(targetPath, bytes)
  }

  return listWorkspace({ rootPath: normalizedRoot, currentPath: parent.relativePath, includeSystem })
}

export async function deleteWorkspaceEntry({ rootPath, targetPath, includeSystem = false }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const target = resolveWorkspaceTarget(normalizedRoot, targetPath)
  const deleteProtection = getDeleteProtection(target.relativePath)

  if (!deleteProtection.deletable) {
    throw new Error(deleteProtection.protectionReason)
  }

  await rm(target.absolutePath, { recursive: true, force: false })
  const parentPath = toPortablePath(path.dirname(target.relativePath)).replace(/^\.$/, '')
  return listWorkspace({ rootPath: normalizedRoot, currentPath: parentPath, includeSystem })
}

export async function revealWorkspacePath({ rootPath, targetPath = '' }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const target = resolveWorkspaceTarget(normalizedRoot, targetPath)

  const child = spawn('explorer.exe', [target.absolutePath], {
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  return { ok: true, absolutePath: target.absolutePath }
}
