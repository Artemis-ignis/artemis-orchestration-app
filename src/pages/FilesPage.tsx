import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PageId } from '../crewData'
import { EmptyState, PageIntro, SearchField } from '../crewPageShared'
import {
  bytesLabel,
  changeTypeLabel,
  executionProviderLabel,
  formatDate,
  formatFriendlyModelName,
  formatRelative,
  getRelativeParentPath,
} from '../crewPageHelpers'
import { Icon } from '../icons'
import { useArtemisApp } from '../state/context'

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
  const [query, setQuery] = useState('')
  const [folderName, setFolderName] = useState('')
  const [rootInput, setRootInput] = useState('')
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
        setPreviewError(error instanceof Error ? error.message : '파일을 열지 못했습니다.')
      } finally {
        setPreviewLoading(false)
      }
    },
    [readWorkspaceFile],
  )

  const handleOpenEntry = useCallback(
    async (relativePath: string, kind: 'file' | 'folder') => {
      if (kind === 'folder') {
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
        description="실제 로컬 작업 폴더를 탐색하고, 파일을 열어 수정하고, 업로드와 폴더 생성을 바로 처리합니다."
        icon="files"
        title="내 파일"
      />

      <div className="panel-card files-shell__summary">
        <div className="files-shell__summaryHead">
          <div>
            <strong>연결된 작업 루트</strong>
            <p>{workspaceRootPath ? '루트 작업 폴더가 연결되어 있습니다.' : '작업 루트를 아직 불러오지 못했습니다.'}</p>
            <div className="files-shell__paths">
              <small className="mono">현재 폴더: {currentFolderLabel}</small>
              {workspaceCurrentPath ? (
                <small className="mono">
                  이 폴더 기준으로 채팅과 오케스트레이션이 실행됩니다.
                </small>
              ) : null}
            </div>
          </div>
          <div className="badge-row">
            <span className="chip chip--soft">표시 폴더 {shownFolderCount}개</span>
            <span className="chip chip--soft">표시 파일 {shownFileCount}개</span>
            <span className="chip chip--soft">현재 목록 파일 용량 {bytesLabel(shownTotalBytes)}</span>
            {protectedEntryCount > 0 ? (
              <span className="chip chip--soft">삭제 보호 {protectedEntryCount}개</span>
            ) : null}
          </div>
        </div>
        <div className="files-shell__summaryActions">
          <button
            className="ghost-button"
            onClick={() =>
              openChatWithWorkspace(
                `현재 작업 폴더는 "${currentFolderLabel}" 입니다.\n이 폴더 기준으로 파일을 읽고 필요한 수정 작업을 진행해줘.`,
              )
            }
            type="button"
          >
            채팅으로 작업 지시
          </button>
          <button className="ghost-button" onClick={() => void refreshWorkspace()} type="button">
            새로고침
          </button>
          {workspaceParentPath !== null ? (
            <button
              className="ghost-button"
              onClick={() => void openWorkspaceFolder(workspaceParentPath)}
              type="button"
            >
              상위 폴더
            </button>
          ) : null}
          <button className="ghost-button" onClick={() => void revealWorkspacePath()} type="button">
            탐색기에서 열기
          </button>
        </div>
      </div>

      {workspaceError ? (
        <div className="status-banner status-banner--error">
          <Icon name="warning" size={16} />
          <span>{workspaceError}</span>
        </div>
      ) : null}

      <div className="status-banner status-banner--info">
        <Icon name="warning" size={16} />
        <span>여기서 고른 루트와 현재 폴더 기준이 채팅과 오케스트레이션 실행에 전달됩니다.</span>
      </div>

      {workspaceEntries.length > 0 ? (
        <div className="status-banner status-banner--info">
          <Icon name="warning" size={16} />
          <span>앱 안에서 삭제한 항목은 즉시 로컬 파일시스템에 반영됩니다. 삭제 보호 항목은 안전상 비활성으로 유지됩니다.</span>
        </div>
      ) : null}

      {latestExecution ? (
        <section className="panel-card panel-card--muted">
          <div className="card-topline">
            <strong>최근 AI 실제 변경</strong>
            <small>
              {formatDate(latestExecution.receivedAt)} ·{' '}
              {executionProviderLabel(latestExecution.provider)} ·{' '}
              {formatFriendlyModelName(latestExecution.model)}
            </small>
          </div>
          <div className="badge-row">
            <span className="chip chip--soft">실행 폴더 {latestExecutionFolderLabel}</span>
            {hasLatestChangedFiles ? (
              <>
                {latestExecutionChangeSummary.created > 0 ? (
                  <span className="chip chip--soft">
                    생성 {latestExecutionChangeSummary.created}개
                  </span>
                ) : null}
                {latestExecutionChangeSummary.modified > 0 ? (
                  <span className="chip chip--soft">
                    수정 {latestExecutionChangeSummary.modified}개
                  </span>
                ) : null}
                {latestExecutionChangeSummary.deleted > 0 ? (
                  <span className="chip chip--soft">
                    삭제 {latestExecutionChangeSummary.deleted}개
                  </span>
                ) : null}
              </>
            ) : (
              <span className="chip chip--soft">변경 없음</span>
            )}
          </div>
          <div className="files-shell__paths">
            <small className="mono">작업 루트: 루트 작업 폴더</small>
            <small className="mono">실행 경로: {latestExecutionFolderLabel}</small>
          </div>
          <div className="files-shell__summaryActions">
            <button
              className="ghost-button"
              onClick={() => void openWorkspaceFolder(latestExecution.workspace.cwdRelativePath)}
              type="button"
            >
              실행 폴더 열기
            </button>
            <button
              className="ghost-button"
              onClick={() => void revealWorkspacePath(latestExecution.workspace.cwdRelativePath)}
              type="button"
            >
              탐색기에서 열기
            </button>
          </div>
          {latestChangedFiles.length > 0 ? (
            <>
              <div className="entity-list">
                {latestChangedFiles.slice(0, 8).map((item) => (
                  <button
                    key={`${item.changeType}:${item.relativePath}`}
                    className="agent-list-item"
                    onClick={() => void handleInspectChangedFile(item.relativePath, item.changeType)}
                    type="button"
                  >
                    <div>
                      <strong>{item.relativePath}</strong>
                      <small>
                        {changeTypeLabel(item.changeType)} · {formatRelative(item.updatedAt)}
                      </small>
                    </div>
                    <span className="chip chip--soft">{changeTypeLabel(item.changeType)}</span>
                  </button>
                ))}
              </div>
              {latestExecution.workspace.changeDetectionLimited ? (
                <p>변경 감지는 현재 작업 폴더 일부 범위만 표시했을 수 있습니다.</p>
              ) : null}
            </>
          ) : (
            <p>최근 실행에서 감지된 로컬 파일 변경은 없습니다.</p>
          )}
        </section>
      ) : null}

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
            placeholder="작업 루트 경로를 입력하세요."
            value={rootInput}
          />
        </label>
        {workspaceRootPath ? (
          <button
            className="ghost-button"
            onClick={() => setRootInput(workspaceRootPath)}
            type="button"
          >
            현재 루트 불러오기
          </button>
        ) : null}
        <button className="outline-button" disabled={!rootInput.trim()} type="submit">
          경로 연결
        </button>
      </form>

      <div className="files-toolbar">
        <SearchField onChange={setQuery} placeholder="현재 폴더 검색..." value={query} />
        <div className="files-toolbar__actions">
          <label className="inline-input">
            <input
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="새 폴더 이름"
              value={folderName}
            />
          </label>

          <button
            className="outline-button"
            disabled={!folderName.trim()}
            onClick={async () => {
              await createWorkspaceFolder(folderName)
              setFolderName('')
            }}
            type="button"
          >
            새 폴더
          </button>

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
          <button className="primary-button" onClick={() => fileInputRef.current?.click()} type="button">
            업로드
          </button>
        </div>
      </div>

      <div className="chip-wrap">
        <span className="chip is-active">{currentFolderLabel}</span>
        {workspaceLoading ? <span className="chip chip--soft">불러오는 중</span> : null}
        {hiddenSystemEntryCount > 0 ? (
          <button
            className={`chip ${workspaceShowSystemEntries ? 'is-active' : 'chip--soft'}`}
            onClick={() => void setWorkspaceSystemEntriesVisible(!workspaceShowSystemEntries)}
            type="button"
          >
            {workspaceShowSystemEntries
              ? `시스템 항목 ${hiddenSystemEntryCount}개 표시 중`
              : `시스템 항목 ${hiddenSystemEntryCount}개 숨김`}
          </button>
        ) : null}
      </div>

      <div className="files-layout">
        <div className="panel-card">
          {visibleItems.length > 0 ? (
            <div className="entity-list">
              {visibleItems.map((item) => (
                <div
                  key={item.relativePath}
                  className={`file-row ${selectedPath === item.relativePath ? 'is-selected' : ''}`}
                >
                  <button
                    className="file-row__open"
                    onClick={() => void handleOpenEntry(item.relativePath, item.kind)}
                    type="button"
                  >
                    <span className="file-row__icon">
                      <Icon name={item.kind === 'folder' ? 'folder' : 'files'} size={16} />
                    </span>
                    <div className="file-row__main">
                      <strong>{item.name}</strong>
                      <small>
                        {item.kind === 'folder'
                          ? `폴더 · ${formatRelative(item.updatedAt)}`
                          : `${item.mimeType} · ${bytesLabel(item.size)} · ${formatRelative(item.updatedAt)}`}
                      </small>
                    </div>
                  </button>
                  <div className="file-row__actions">
                    {latestChangeMap.get(item.relativePath) ? (
                      <span className="chip chip--soft">
                        AI{' '}
                        {changeTypeLabel(
                          latestChangeMap.get(item.relativePath) as
                            | 'created'
                            | 'modified'
                            | 'deleted',
                        )}
                      </span>
                    ) : null}
                    {!item.deletable ? <span className="chip chip--soft">삭제 보호</span> : null}
                    {item.kind === 'file' ? (
                      <button
                        className="ghost-button"
                        onClick={() => void handleOpenFile(item.relativePath)}
                        type="button"
                      >
                        열기
                      </button>
                    ) : (
                      <button
                        className="ghost-button"
                        onClick={() => void openWorkspaceFolder(item.relativePath)}
                        type="button"
                      >
                        열기
                      </button>
                    )}
                    <button
                      className="danger-button danger-button--subtle"
                      disabled={!item.deletable}
                      title={item.protectionReason ?? undefined}
                      onClick={async () => {
                        if (!item.deletable) {
                          return
                        }
                        if (!window.confirm(`${item.name}을(를) 삭제하시겠습니까?`)) {
                          return
                        }
                        await deleteWorkspaceEntry(item.relativePath)
                        if (selectedPath === item.relativePath) {
                          setSelectedPath(null)
                          setSelectedFileMeta(null)
                          setSelectedFileContent('')
                          setSelectedFileOriginalContent('')
                          setPreviewError(null)
                        }
                      }}
                      type="button"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : workspaceEntries.length === 0 ? (
            !workspaceShowSystemEntries && hiddenSystemEntryCount > 0 ? (
              <EmptyState
                action="시스템 항목 보기"
                description="현재 폴더에는 시스템 또는 빌드 항목만 있어 기본 표시에서 숨겼습니다."
                onAction={() => void setWorkspaceSystemEntriesVisible(true)}
                title="기본 표시 항목이 없습니다"
              />
            ) : (
              <EmptyState
                action="업로드"
                description="현재 폴더에 아직 파일이 없습니다. 로컬 파일을 올리거나 새 폴더를 만들어 주세요."
                onAction={() => fileInputRef.current?.click()}
                title="비어 있는 작업 폴더"
              />
            )
          ) : (
            <EmptyState
              action={
                !workspaceShowSystemEntries && hiddenSystemEntryCount > 0
                  ? '시스템 항목 보기'
                  : undefined
              }
              description={
                !workspaceShowSystemEntries && hiddenSystemEntryCount > 0
                  ? '검색어를 바꾸거나 시스템 항목 표시를 켜서 숨겨진 항목까지 확인해 주세요.'
                  : '검색어를 바꾸면 현재 폴더의 다른 항목을 바로 찾을 수 있습니다.'
              }
              onAction={
                !workspaceShowSystemEntries && hiddenSystemEntryCount > 0
                  ? () => void setWorkspaceSystemEntriesVisible(true)
                  : undefined
              }
              title="검색 결과가 없습니다"
            />
          )}
        </div>

        <div className="panel-card preview-card">
          {previewError ? (
            <div className="status-banner status-banner--error">
              <Icon name="warning" size={16} />
              <span>{previewError}</span>
            </div>
          ) : null}

          {previewLoading ? (
            <EmptyState
              description="선택한 파일 내용을 불러오는 중입니다."
              title="파일 미리보기 준비 중"
            />
          ) : hasFileSelection && selectedFileMeta ? (
            <>
              <div className="preview-card__header">
                <div>
                  <strong>{selectedFileMeta.name}</strong>
                  <small>
                    {selectedFileMeta.mimeType} · {bytesLabel(selectedFileMeta.size)} ·{' '}
                    {formatRelative(selectedFileMeta.updatedAt)}
                  </small>
                </div>
                <div className="badge-row">
                  <span className="chip chip--soft">
                    {selectedFileMeta.editable ? '텍스트 편집 가능' : '미리보기 전용'}
                  </span>
                  {!selectedFileMeta.deletable ? (
                    <span className="chip chip--soft">삭제 보호</span>
                  ) : null}
                  <button
                    className="ghost-button"
                    onClick={() =>
                      openChatWithWorkspace(
                        `대상 파일: ${selectedFileMeta.path}\n이 파일을 읽고 필요한 수정 사항을 적용해줘.`,
                      )
                    }
                    type="button"
                  >
                    채팅으로 수정 요청
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void revealWorkspacePath(selectedFileMeta.path)}
                    type="button"
                  >
                    위치 열기
                  </button>
                  <button
                    className="danger-button danger-button--subtle"
                    disabled={!selectedFileMeta.deletable}
                    title={selectedFileMeta.protectionReason ?? undefined}
                    onClick={async () => {
                      if (!selectedFileMeta.deletable) {
                        return
                      }
                      if (!window.confirm(`${selectedFileMeta.name}을(를) 삭제하시겠습니까?`)) {
                        return
                      }
                      await deleteWorkspaceEntry(selectedFileMeta.path)
                      setSelectedPath(null)
                      setSelectedFileMeta(null)
                      setSelectedFileContent('')
                      setSelectedFileOriginalContent('')
                      setPreviewError(null)
                    }}
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              </div>

              {!selectedFileMeta.deletable && selectedFileMeta.protectionReason ? (
                <div className="status-banner status-banner--info">
                  <Icon name="warning" size={16} />
                  <span>{selectedFileMeta.protectionReason}</span>
                </div>
              ) : null}

              {selectedFileMeta.editable ? (
                <div className="preview-editor">
                  <textarea
                    className="preview-editor__textarea"
                    onChange={(event) => setSelectedFileContent(event.target.value)}
                    spellCheck={false}
                    value={selectedFileContent}
                  />
                  <div className="preview-editor__footer">
                    <span className="composer__hint">
                      {previewSaving ? '저장 중' : '이 파일은 로컬 경로에 바로 저장됩니다.'}
                    </span>
                    <button
                      className="primary-button"
                      disabled={previewSaving || !selectedFileMeta.editable || !isFileDirty}
                      onClick={async () => {
                        setPreviewSaving(true)
                        setPreviewError(null)

                        try {
                          const saved = await saveWorkspaceFile(
                            selectedFileMeta.path,
                            selectedFileContent,
                          )
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
                          setPreviewError(
                            error instanceof Error ? error.message : '파일 저장에 실패했습니다.',
                          )
                        } finally {
                          setPreviewSaving(false)
                        }
                      }}
                      type="button"
                    >
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <pre className="preview-card__content">
                  이 파일 형식은 브라우저 안에서 직접 편집하지 않습니다. 위치 열기를 눌러 로컬 경로에서
                  확인하거나, 채팅에서 이 파일을 대상으로 작업 지시를 보내세요.
                </pre>
              )}
            </>
          ) : (
            <EmptyState
              description="왼쪽 목록에서 파일을 열면 여기서 바로 내용을 보고 저장할 수 있습니다."
              title="파일을 선택해 주세요"
            />
          )}
        </div>
      </div>
    </section>
  )
}

export default FilesPage
