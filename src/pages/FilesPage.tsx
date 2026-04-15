import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PageId } from '../crewData'
import { PageIntro } from '../crewPageShared'
import { getRelativeParentPath } from '../crewPageHelpers'
import {
  FilesBrowserLayout,
  FilesBrowserPanel,
  FileInspectorPanel,
  FilesNotices,
  FilesOverviewPanel,
  FilesRecentChangesPanel,
} from '../features/files/FilesSections'
import { useArtemisApp } from '../state/context'

function getWorkspaceRootLabel(path: string) {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function FilesPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    connectWorkspace,
    createWorkspaceFolder,
    deleteWorkspaceEntry,
    latestExecution,
    openWorkspaceFolder,
    readWorkspaceFile,
    refreshWorkspace,
    revealWorkspacePath,
    saveWorkspaceFile,
    uploadWorkspaceFiles,
    workspaceCurrentPath,
    workspaceEntries,
    workspaceError,
    workspaceLoading,
    workspaceParentPath,
    workspaceRootPath,
    workspaceShowSystemEntries,
    workspaceSummary,
    setComposerText,
    setWorkspaceSystemEntriesVisible,
  } = useArtemisApp()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previousWorkspaceRootPathRef = useRef('')
  const [query, setQuery] = useState('')
  const [folderName, setFolderName] = useState('')
  const [rootInput, setRootInput] = useState('')
  const [isRootEditorOpen, setIsRootEditorOpen] = useState(false)
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedFileContent, setSelectedFileContent] = useState('')
  const [selectedFileOriginalContent, setSelectedFileOriginalContent] = useState('')
  const [selectedFileMeta, setSelectedFileMeta] = useState<{
    path: string
    name: string
    mimeType: string
    size: number
    updatedAt: string
    editable: boolean
    deletable: boolean
    protectionReason: string | null
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewSaving, setPreviewSaving] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const latestChangedFiles = useMemo(
    () => latestExecution?.workspace.changedFiles ?? [],
    [latestExecution],
  )
  const latestChangeMap = useMemo(
    () => new Map(latestChangedFiles.map((item) => [item.relativePath, item.changeType])),
    [latestChangedFiles],
  )
  const hiddenSystemEntryCount = workspaceSummary.systemEntryCount

  useEffect(() => {
    if (!selectedPath) {
      return
    }

    if (workspaceEntries.some((item) => item.relativePath === selectedPath)) {
      return
    }

    setSelectedPath(null)
    setSelectedFileMeta(null)
    setSelectedFileContent('')
    setSelectedFileOriginalContent('')
    setPreviewError(null)
  }, [selectedPath, workspaceEntries])

  useEffect(() => {
    if (!workspaceRootPath) {
      previousWorkspaceRootPathRef.current = ''
      return
    }

    setRootInput((current) => {
      if (!current.trim() || current === previousWorkspaceRootPathRef.current) {
        return workspaceRootPath
      }

      return current
    })
    previousWorkspaceRootPathRef.current = workspaceRootPath
  }, [workspaceRootPath])

  useEffect(() => {
    setIsRootEditorOpen(!workspaceRootPath)
  }, [workspaceRootPath])

  useEffect(() => {
    if (!pendingDeletePath) {
      return
    }

    const timer = window.setTimeout(() => {
      setPendingDeletePath(null)
    }, 4_000)

    return () => window.clearTimeout(timer)
  }, [pendingDeletePath])

  const visibleItems = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()

    return workspaceEntries.filter((item) => {
      if (!keyword) return true
      return (
        item.name.toLowerCase().includes(keyword) ||
        item.relativePath.toLowerCase().includes(keyword) ||
        item.mimeType.toLowerCase().includes(keyword)
      )
    })
  }, [deferredQuery, workspaceEntries])

  const selectedEntry = selectedPath
    ? workspaceEntries.find((item) => item.relativePath === selectedPath) ?? null
    : null

  const handleOpenFile = useCallback(
    async (relativePath: string) => {
      setPendingDeletePath(null)
      setSelectedPath(relativePath)
      setPreviewError(null)
      setPreviewLoading(true)

      try {
        const file = await readWorkspaceFile(relativePath)
        setSelectedFileMeta({
          path: file.relativePath,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          updatedAt: file.updatedAt,
          editable: file.editable,
          deletable: file.deletable,
          protectionReason: file.protectionReason,
        })
        setSelectedFileContent(file.content)
        setSelectedFileOriginalContent(file.content)
      } catch (error) {
        setSelectedFileMeta(null)
        setSelectedFileContent('')
        setSelectedFileOriginalContent('')
        setPreviewError(error instanceof Error ? error.message : '파일을 읽지 못했습니다.')
      } finally {
        setPreviewLoading(false)
      }
    },
    [readWorkspaceFile],
  )

  const handleOpenEntry = useCallback(
    async (relativePath: string, kind: 'file' | 'folder') => {
      if (kind === 'folder') {
        setPendingDeletePath(null)
        setSelectedPath(null)
        setSelectedFileMeta(null)
        setSelectedFileContent('')
        setSelectedFileOriginalContent('')
        setPreviewError(null)
        await openWorkspaceFolder(relativePath)
        return
      }

      await handleOpenFile(relativePath)
    },
    [handleOpenFile, openWorkspaceFolder],
  )

  const handleInspectChangedFile = useCallback(
    async (relativePath: string, changeType: 'created' | 'modified' | 'deleted') => {
      const parentPath = getRelativeParentPath(relativePath)
      await openWorkspaceFolder(parentPath)

      if (changeType !== 'deleted') {
        await handleOpenFile(relativePath)
      }
    },
    [handleOpenFile, openWorkspaceFolder],
  )

  const currentFolderLabel = workspaceCurrentPath || '루트'
  const workspaceRootLabel = workspaceRootPath ? getWorkspaceRootLabel(workspaceRootPath) : ''
  const shownFolderCount = workspaceSummary.folderCount
  const shownFileCount = workspaceSummary.fileCount
  const shownTotalBytes = workspaceSummary.totalBytes
  const protectedEntryCount = workspaceEntries.filter((item) => !item.deletable).length
  const hasFileSelection = Boolean(selectedFileMeta && selectedEntry?.kind === 'file')
  const isFileDirty =
    Boolean(selectedFileMeta?.editable) &&
    selectedFileMeta != null &&
    selectedFileContent !== selectedFileOriginalContent

  const latestExecutionChangeSummary = useMemo(
    () =>
      latestChangedFiles.reduce(
        (summary, item) => {
          summary[item.changeType] += 1
          return summary
        },
        { created: 0, modified: 0, deleted: 0 },
      ),
    [latestChangedFiles],
  )
  const latestExecutionFolderLabel = latestExecution?.workspace.cwdRelativePath || '루트'
  const hasLatestChangedFiles =
    latestExecutionChangeSummary.created +
      latestExecutionChangeSummary.modified +
      latestExecutionChangeSummary.deleted >
    0

  const openChatWithWorkspace = (prompt: string) => {
    setComposerText(prompt)
    onNavigate('chat')
  }

  return (
    <section className="page">
      <PageIntro
        description="로컬 작업 폴더를 탐색하고, 파일을 읽고 수정하고, 업로드와 폴더 생성을 한 작업면 안에서 처리합니다."
        icon="files"
        title="내 파일"
      />

      <FilesOverviewPanel
        currentFolderLabel={currentFolderLabel}
        onOpenChat={() =>
          openChatWithWorkspace(
            `현재 작업 폴더는 "${currentFolderLabel}" 입니다.\n이 폴더 기준으로 파일을 읽고 필요한 수정 작업을 진행해줘.`,
          )
        }
        onOpenParent={() => void openWorkspaceFolder(workspaceParentPath ?? '')}
        onRefresh={() => void refreshWorkspace()}
        onReveal={() => void revealWorkspacePath()}
        protectedEntryCount={protectedEntryCount}
        shownFileCount={shownFileCount}
        shownFolderCount={shownFolderCount}
        shownTotalBytes={shownTotalBytes}
        workspaceCurrentPath={workspaceCurrentPath}
        workspaceParentPath={workspaceParentPath}
        workspaceRootPath={workspaceRootPath}
      />

      <FilesNotices
        hasEntries={workspaceEntries.length > 0}
        pendingDelete={Boolean(pendingDeletePath)}
        workspaceError={workspaceError}
      />

      <FilesRecentChangesPanel
        hasLatestChangedFiles={hasLatestChangedFiles}
        latestExecution={latestExecution}
        latestExecutionChangeSummary={latestExecutionChangeSummary}
        latestExecutionFolderLabel={latestExecutionFolderLabel}
        onInspectChangedFile={(relativePath, changeType) =>
          void handleInspectChangedFile(relativePath, changeType)
        }
        onOpenExecutionFolder={() => void openWorkspaceFolder(latestExecution?.workspace.cwdRelativePath ?? '')}
        onRevealExecutionFolder={() => void revealWorkspacePath(latestExecution?.workspace.cwdRelativePath)}
      />

      {workspaceRootPath && !isRootEditorOpen ? (
        <section className="files-rootCard">
          <div className="files-rootCard__copy">
            <strong>작업 루트</strong>
            <span>{workspaceRootLabel}</span>
            <small>현재 연결된 루트를 기준으로 채팅과 오케스트레이션이 파일 작업을 이어갑니다.</small>
          </div>
          <div className="files-rootCard__actions">
            <button
              className="ghost-button"
              onClick={() => {
                setRootInput(workspaceRootPath)
                setIsRootEditorOpen(true)
              }}
              type="button"
            >
              경로 편집
            </button>
            <button className="ghost-button" onClick={() => void revealWorkspacePath()} type="button">
              탐색기에서 열기
            </button>
          </div>
        </section>
      ) : (
        <form
          className="files-connect"
          onSubmit={(event) => {
            event.preventDefault()
            if (!rootInput.trim()) {
              return
            }
            void connectWorkspace(rootInput.trim())
          }}
        >
          <label className="inline-input files-connect__input">
            <input
              onChange={(event) => setRootInput(event.target.value)}
              placeholder="작업 루트 경로를 입력해 주세요"
              value={rootInput}
            />
          </label>
          {workspaceRootPath ? (
            <>
              <button className="ghost-button" onClick={() => setRootInput(workspaceRootPath)} type="button">
                현재 루트 불러오기
              </button>
              <button className="ghost-button" onClick={() => setIsRootEditorOpen(false)} type="button">
                편집 닫기
              </button>
            </>
          ) : null}
          <button className="outline-button" disabled={!rootInput.trim()} type="submit">
            경로 연결
          </button>
        </form>
      )}

      <input
        hidden
        multiple
        onChange={(event) => {
          if (event.target.files) {
            void uploadWorkspaceFiles(event.target.files)
          }
          event.target.value = ''
        }}
        ref={fileInputRef}
        type="file"
      />

      <FilesBrowserLayout
        list={
          <FilesBrowserPanel
            currentFolderLabel={currentFolderLabel}
            folderName={folderName}
            hiddenSystemEntryCount={hiddenSystemEntryCount}
            latestChangeMap={latestChangeMap}
            onCreateFolder={async () => {
              await createWorkspaceFolder(folderName)
              setFolderName('')
            }}
            onDelete={(item) => {
              void (async () => {
                if (!item.deletable) {
                  return
                }
                if (pendingDeletePath !== item.relativePath) {
                  setPendingDeletePath(item.relativePath)
                  return
                }
                if (!window.confirm(`${item.name} 파일을 삭제하시겠습니까?`)) {
                  setPendingDeletePath(null)
                  return
                }
                await deleteWorkspaceEntry(item.relativePath)
                setPendingDeletePath(null)
                if (selectedPath === item.relativePath) {
                  setSelectedPath(null)
                  setSelectedFileMeta(null)
                  setSelectedFileContent('')
                  setSelectedFileOriginalContent('')
                  setPreviewError(null)
                }
              })()
            }}
            onFolderNameChange={setFolderName}
            onOpenEntry={(relativePath, kind) => void handleOpenEntry(relativePath, kind)}
            onOpenFile={(relativePath) => void handleOpenFile(relativePath)}
            onQueryChange={setQuery}
            onToggleSystemEntries={() =>
              void setWorkspaceSystemEntriesVisible(!workspaceShowSystemEntries)
            }
            onUpload={() => fileInputRef.current?.click()}
            pendingDeletePath={pendingDeletePath}
            query={query}
            selectedPath={selectedPath}
            visibleItems={visibleItems}
            workspaceLoading={workspaceLoading}
            workspaceShowSystemEntries={workspaceShowSystemEntries}
          />
        }
        inspector={
          <FileInspectorPanel
            canSave={Boolean(selectedFileMeta?.editable) && isFileDirty}
            hasFileSelection={hasFileSelection}
            onContentChange={setSelectedFileContent}
            onDelete={() => {
              void (async () => {
                if (!selectedFileMeta?.deletable) {
                  return
                }
                if (pendingDeletePath !== selectedFileMeta.path) {
                  setPendingDeletePath(selectedFileMeta.path)
                  return
                }
                if (!window.confirm(`${selectedFileMeta.name} 파일을 삭제하시겠습니까?`)) {
                  setPendingDeletePath(null)
                  return
                }
                await deleteWorkspaceEntry(selectedFileMeta.path)
                setPendingDeletePath(null)
                setSelectedPath(null)
                setSelectedFileMeta(null)
                setSelectedFileContent('')
                setSelectedFileOriginalContent('')
                setPreviewError(null)
              })()
            }}
            onOpenChat={() =>
              openChatWithWorkspace(
                `대상 파일: ${selectedFileMeta?.path ?? ''}\n이 파일을 읽고 필요한 수정 사항을 적용해줘.`,
              )
            }
            onReveal={() => void revealWorkspacePath(selectedFileMeta?.path)}
            onSave={() => {
              void (async () => {
                if (!selectedFileMeta?.editable) {
                  return
                }
                setPreviewSaving(true)
                setPreviewError(null)
                try {
                  const saved = await saveWorkspaceFile(selectedFileMeta.path, selectedFileContent)
                  setSelectedFileMeta({
                    path: saved.relativePath,
                    name: saved.name,
                    mimeType: saved.mimeType,
                    size: saved.size,
                    updatedAt: saved.updatedAt,
                    editable: saved.editable,
                    deletable: saved.deletable,
                    protectionReason: saved.protectionReason,
                  })
                  setSelectedFileContent(saved.content)
                  setSelectedFileOriginalContent(saved.content)
                } catch (error) {
                  setPreviewError(error instanceof Error ? error.message : '파일 저장에 실패했습니다.')
                } finally {
                  setPreviewSaving(false)
                }
              })()
            }}
            pendingDeletePath={pendingDeletePath}
            previewError={previewError}
            previewLoading={previewLoading}
            previewSaving={previewSaving}
            selectedFileContent={selectedFileContent}
            selectedFileMeta={selectedFileMeta}
          />
        }
      />
    </section>
  )
}

export default FilesPage
