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

function toPortablePath(value = '') {
  return value.split(path.sep).join('/')
}

function fromPortablePath(value = '') {
  return String(value).replace(/[\\/]+/g, path.sep)
}

function ensureValidName(name) {
  const trimmed = String(name || '').trim()

  if (!trimmed) {
    throw new Error('이름을 입력해 주세요.')
  }

  if (trimmed === '.' || trimmed === '..') {
    throw new Error('현재 또는 상위 경로 이름은 사용할 수 없습니다.')
  }

  if (/[\\/]/.test(trimmed)) {
    throw new Error('이름에는 경로 구분자를 넣을 수 없습니다.')
  }

  return trimmed
}

export async function resolveWorkspaceRoot(rootPath) {
  const resolved = path.resolve(String(rootPath || DEFAULT_WORKSPACE_ROOT).trim() || DEFAULT_WORKSPACE_ROOT)
  const targetStat = await stat(resolved).catch(() => null)

  if (!targetStat) {
    throw new Error('작업 폴더를 찾지 못했습니다.')
  }

  if (!targetStat.isDirectory()) {
    throw new Error('작업 폴더는 디렉터리여야 합니다.')
  }

  return resolved
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
    throw new Error('작업 폴더 바깥 경로는 사용할 수 없습니다.')
  }

  return {
    rootPath: normalizedRoot,
    absolutePath: resolved,
    relativePath: relative ? toPortablePath(relative) : '',
  }
}

function getMimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase()
  return MIME_TYPES.get(extension) ?? 'application/octet-stream'
}

function isTextFile(fileName, mimeType, size, buffer) {
  const extension = path.extname(fileName).toLowerCase()

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

function buildEntry(rootPath, absolutePath, targetStat) {
  const relativePath = toPortablePath(path.relative(rootPath, absolutePath))
  const name = path.basename(absolutePath)
  const kind = targetStat.isDirectory() ? 'folder' : 'file'
  const mimeType = kind === 'folder' ? 'inode/directory' : getMimeType(name)

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

export async function listWorkspace({ rootPath, currentPath = '' }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const target = resolveWorkspaceTarget(normalizedRoot, currentPath)
  const targetStat = await stat(target.absolutePath).catch(() => null)

  if (!targetStat || !targetStat.isDirectory()) {
    throw new Error('폴더를 찾지 못했습니다.')
  }

  const dirents = await readdir(target.absolutePath, { withFileTypes: true })
  const entries = await Promise.all(
    dirents.map(async (dirent) => {
      const absolutePath = path.join(target.absolutePath, dirent.name)
      const nextStat = await stat(absolutePath)
      return buildEntry(normalizedRoot, absolutePath, nextStat)
    }),
  )

  const sortedEntries = sortEntries(entries)
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
    },
  }
}

export async function readWorkspaceFileContent({ rootPath, filePath }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const target = resolveWorkspaceTarget(normalizedRoot, filePath)
  const targetStat = await stat(target.absolutePath).catch(() => null)

  if (!targetStat || !targetStat.isFile()) {
    throw new Error('파일을 찾지 못했습니다.')
  }

  const buffer = await readFile(target.absolutePath)
  const mimeType = getMimeType(path.basename(target.absolutePath))
  const editable = isTextFile(path.basename(target.absolutePath), mimeType, targetStat.size, buffer)

  return {
    rootPath: normalizedRoot,
    relativePath: target.relativePath,
    absolutePath: target.absolutePath,
    name: path.basename(target.absolutePath),
    mimeType,
    size: targetStat.size,
    updatedAt: targetStat.mtime.toISOString(),
    editable,
    content: editable ? buffer.toString('utf8') : '',
  }
}

export async function createWorkspaceFolder({ rootPath, currentPath = '', name }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const parent = resolveWorkspaceTarget(normalizedRoot, currentPath)
  const safeName = ensureValidName(name)
  const nextPath = path.join(parent.absolutePath, safeName)

  await mkdir(nextPath)
  return listWorkspace({ rootPath: normalizedRoot, currentPath: parent.relativePath })
}

export async function writeWorkspaceFileContent({ rootPath, filePath, content }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const target = resolveWorkspaceTarget(normalizedRoot, filePath)

  await writeFile(target.absolutePath, String(content ?? ''), 'utf8')
  return readWorkspaceFileContent({ rootPath: normalizedRoot, filePath: target.relativePath })
}

export async function uploadWorkspaceFiles({ rootPath, currentPath = '', files }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const parent = resolveWorkspaceTarget(normalizedRoot, currentPath)

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('업로드할 파일이 없습니다.')
  }

  for (const item of files) {
    const safeName = ensureValidName(item.name)
    const targetPath = path.join(parent.absolutePath, safeName)
    const bytes = Buffer.from(String(item.contentBase64 || ''), 'base64')
    await writeFile(targetPath, bytes)
  }

  return listWorkspace({ rootPath: normalizedRoot, currentPath: parent.relativePath })
}

export async function deleteWorkspaceEntry({ rootPath, targetPath }) {
  const normalizedRoot = await resolveWorkspaceRoot(rootPath)
  const target = resolveWorkspaceTarget(normalizedRoot, targetPath)

  if (!target.relativePath) {
    throw new Error('작업 폴더 루트는 삭제할 수 없습니다.')
  }

  await rm(target.absolutePath, { recursive: true, force: false })
  const parentPath = toPortablePath(path.dirname(target.relativePath)).replace(/^\.$/, '')
  return listWorkspace({ rootPath: normalizedRoot, currentPath: parentPath })
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
