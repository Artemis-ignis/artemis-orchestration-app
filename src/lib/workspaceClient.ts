type WorkspaceEntryKind = 'file' | 'folder'

export type WorkspaceEntry = {
  name: string
  kind: WorkspaceEntryKind
  relativePath: string
  absolutePath: string
  parentPath: string
  mimeType: string
  size: number
  updatedAt: string
  editable: boolean
}

export type WorkspaceListing = {
  ok: boolean
  rootPath: string
  currentPath: string
  absolutePath: string
  parentPath: string | null
  entries: WorkspaceEntry[]
  summary: {
    totalEntries: number
    fileCount: number
    folderCount: number
    totalBytes: number
  }
}

export type WorkspaceFile = {
  ok: boolean
  rootPath: string
  relativePath: string
  absolutePath: string
  name: string
  mimeType: string
  size: number
  updatedAt: string
  editable: boolean
  content: string
}

type WorkspaceDefault = {
  ok: boolean
  rootPath: string
}

async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = 20_000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('로컬 작업 폴더 응답 시간이 초과되었습니다.')
    }

    throw error
  } finally {
    window.clearTimeout(timer)
  }
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

function base64FromUint8Array(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return window.btoa(binary)
}

export async function fetchDefaultWorkspaceRoot(bridgeUrl: string) {
  const response = await fetchWithTimeout(`${bridgeUrl}/api/workspace/default`, undefined, 10_000)
  return readJson<WorkspaceDefault>(response)
}

export async function fetchWorkspaceListing({
  bridgeUrl,
  rootPath,
  currentPath = '',
}: {
  bridgeUrl: string
  rootPath?: string
  currentPath?: string
}) {
  const query = new URLSearchParams()

  if (rootPath) {
    query.set('rootPath', rootPath)
  }

  if (currentPath) {
    query.set('path', currentPath)
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  const response = await fetchWithTimeout(`${bridgeUrl}/api/workspace${suffix}`, undefined, 20_000)
  return readJson<WorkspaceListing>(response)
}

export async function fetchWorkspaceFile({
  bridgeUrl,
  rootPath,
  path,
}: {
  bridgeUrl: string
  rootPath: string
  path: string
}) {
  const query = new URLSearchParams({
    rootPath,
    path,
  })
  const response = await fetchWithTimeout(
    `${bridgeUrl}/api/workspace/file?${query.toString()}`,
    undefined,
    20_000,
  )
  return readJson<WorkspaceFile>(response)
}

export async function createWorkspaceFolderRequest({
  bridgeUrl,
  rootPath,
  currentPath,
  name,
}: {
  bridgeUrl: string
  rootPath: string
  currentPath: string
  name: string
}) {
  const response = await fetchWithTimeout(
    `${bridgeUrl}/api/workspace/folder`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        rootPath,
        currentPath,
        name,
      }),
    },
    20_000,
  )

  return readJson<WorkspaceListing>(response)
}

export async function saveWorkspaceFileRequest({
  bridgeUrl,
  rootPath,
  path,
  content,
}: {
  bridgeUrl: string
  rootPath: string
  path: string
  content: string
}) {
  const response = await fetchWithTimeout(
    `${bridgeUrl}/api/workspace/write`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        rootPath,
        path,
        content,
      }),
    },
    20_000,
  )

  return readJson<WorkspaceFile>(response)
}

export async function uploadWorkspaceFilesRequest({
  bridgeUrl,
  rootPath,
  currentPath,
  files,
}: {
  bridgeUrl: string
  rootPath: string
  currentPath: string
  files: FileList
}) {
  const payload = await Promise.all(
    Array.from(files).map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      return {
        name: file.name,
        mimeType: file.type,
        contentBase64: base64FromUint8Array(bytes),
      }
    }),
  )

  const response = await fetchWithTimeout(
    `${bridgeUrl}/api/workspace/upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        rootPath,
        currentPath,
        files: payload,
      }),
    },
    60_000,
  )

  return readJson<WorkspaceListing>(response)
}

export async function deleteWorkspaceEntryRequest({
  bridgeUrl,
  rootPath,
  path,
}: {
  bridgeUrl: string
  rootPath: string
  path: string
}) {
  const response = await fetchWithTimeout(
    `${bridgeUrl}/api/workspace/delete`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        rootPath,
        path,
      }),
    },
    20_000,
  )

  return readJson<WorkspaceListing>(response)
}

export async function revealWorkspacePathRequest({
  bridgeUrl,
  rootPath,
  path = '',
}: {
  bridgeUrl: string
  rootPath: string
  path?: string
}) {
  const response = await fetchWithTimeout(
    `${bridgeUrl}/api/workspace/reveal`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        rootPath,
        path,
      }),
    },
    10_000,
  )

  return readJson<{ ok: boolean; absolutePath: string }>(response)
}
