import type { ReactNode } from 'react'
import { EmptyState, SearchField } from '../../crewPageShared'
import { bytesLabel, changeTypeLabel, executionProviderLabel, formatDate, formatFriendlyModelName, formatRelative } from '../../crewPageHelpers'
import { Icon } from '../../icons'
import { NoticeBanner, PanelCard, SectionHeader, SplitPane, StatusPill, Toolbar } from '../../components/ui/primitives'
import type { WorkspaceEntry } from '../../lib/workspaceClient'

type ChangedFile = {
  relativePath: string
  changeType: 'created' | 'modified' | 'deleted'
  updatedAt: string
}

type LatestExecutionRecord = {
  receivedAt: string
  provider: string
  model: string
  workspace: {
    cwdRelativePath: string
    changeDetectionLimited?: boolean
    changedFiles: ChangedFile[]
  }
}

export function FilesOverviewPanel({
  workspaceRootPath,
  currentFolderLabel,
  shownFolderCount,
  shownFileCount,
  shownTotalBytes,
  protectedEntryCount,
  workspaceCurrentPath,
  workspaceParentPath,
  onOpenChat,
  onRefresh,
  onOpenParent,
  onReveal,
}: {
  workspaceRootPath: string
  currentFolderLabel: string
  shownFolderCount: number
  shownFileCount: number
  shownTotalBytes: number
  protectedEntryCount: number
  workspaceCurrentPath: string
  workspaceParentPath: string | null
  onOpenChat: () => void
  onRefresh: () => void
  onOpenParent: () => void
  onReveal: () => void
}) {
  return (
    <PanelCard className="files-shell__summary" tone="muted">
      <SectionHeader
        title="연결된 작업 루트"
        description={
          workspaceRootPath
            ? '루트 작업 폴더와 현재 폴더 기준이 채팅과 오케스트레이션에 함께 전달됩니다.'
            : '작업 루트를 아직 불러오지 못했습니다.'
        }
        actions={
          <div className="chip-wrap">
            <StatusPill tone="muted">표시 폴더 {shownFolderCount}개</StatusPill>
            <StatusPill tone="muted">표시 파일 {shownFileCount}개</StatusPill>
            <StatusPill tone="muted">현재 목록 용량 {bytesLabel(shownTotalBytes)}</StatusPill>
            {protectedEntryCount > 0 ? <StatusPill tone="warning">삭제 보호 {protectedEntryCount}개</StatusPill> : null}
          </div>
        }
      />
      <div className="files-shell__paths">
        <small className="mono">현재 폴더: {currentFolderLabel}</small>
        {workspaceCurrentPath ? (
          <small className="mono">이 폴더 기준으로 채팅과 오케스트레이션이 실행됩니다.</small>
        ) : null}
      </div>
      <Toolbar
        left={
          <div className="files-shell__summaryActions">
            <button className="ghost-button" onClick={onOpenChat} type="button">
              채팅으로 작업 지시
            </button>
            <button className="ghost-button" onClick={onRefresh} type="button">
              새로고침
            </button>
            {workspaceParentPath !== null ? (
              <button className="ghost-button" onClick={onOpenParent} type="button">
                상위 폴더
              </button>
            ) : null}
          </div>
        }
        right={
          <button className="ghost-button" onClick={onReveal} type="button">
            탐색기에서 열기
          </button>
        }
      />
    </PanelCard>
  )
}

export function FilesNotices({
  workspaceError,
  hasEntries,
  pendingDelete,
  children,
}: {
  workspaceError: string | null
  hasEntries: boolean
  pendingDelete: boolean
  children?: ReactNode
}) {
  return (
    <div className="files-noticeStack">
      {workspaceError ? <NoticeBanner tone="danger">{workspaceError}</NoticeBanner> : null}
      <NoticeBanner tone="muted">여기서 고른 루트와 현재 폴더 기준이 채팅과 오케스트레이션 실행에 전달됩니다.</NoticeBanner>
      {hasEntries ? (
        <NoticeBanner tone="warning">
          앱 안에서 삭제한 항목은 즉시 로컬 파일시스템에 반영됩니다. 삭제 보호 항목은 안전상 비활성으로 유지됩니다.
        </NoticeBanner>
      ) : null}
      {pendingDelete ? (
        <NoticeBanner tone="warning">삭제 버튼을 한 번 더 눌러야 실제 삭제가 진행됩니다.</NoticeBanner>
      ) : null}
      {children}
    </div>
  )
}

export function FilesRecentChangesPanel({
  latestExecution,
  latestExecutionFolderLabel,
  hasLatestChangedFiles,
  latestExecutionChangeSummary,
  onOpenExecutionFolder,
  onRevealExecutionFolder,
  onInspectChangedFile,
}: {
  latestExecution: LatestExecutionRecord | null
  latestExecutionFolderLabel: string
  hasLatestChangedFiles: boolean
  latestExecutionChangeSummary: {
    created: number
    modified: number
    deleted: number
  }
  onOpenExecutionFolder: () => void
  onRevealExecutionFolder: () => void
  onInspectChangedFile: (relativePath: string, changeType: 'created' | 'modified' | 'deleted') => void
}) {
  if (!latestExecution) {
    return null
  }

  return (
    <PanelCard tone="muted">
      <SectionHeader
        title="최근 AI 실제 변경"
        description={`${formatDate(latestExecution.receivedAt)} · ${executionProviderLabel(latestExecution.provider)} · ${formatFriendlyModelName(latestExecution.model)}`}
      />
      <div className="chip-wrap">
        <StatusPill tone="muted">실행 폴더 {latestExecutionFolderLabel}</StatusPill>
        {hasLatestChangedFiles ? (
          <>
            {latestExecutionChangeSummary.created > 0 ? <StatusPill tone="muted">생성 {latestExecutionChangeSummary.created}개</StatusPill> : null}
            {latestExecutionChangeSummary.modified > 0 ? <StatusPill tone="muted">수정 {latestExecutionChangeSummary.modified}개</StatusPill> : null}
            {latestExecutionChangeSummary.deleted > 0 ? <StatusPill tone="warning">삭제 {latestExecutionChangeSummary.deleted}개</StatusPill> : null}
          </>
        ) : (
          <StatusPill tone="muted">변경 없음</StatusPill>
        )}
      </div>
      <Toolbar
        left={
          <div className="files-shell__paths">
            <small className="mono">실행 경로: {latestExecutionFolderLabel}</small>
          </div>
        }
        right={
          <div className="files-shell__summaryActions">
            <button className="ghost-button" onClick={onOpenExecutionFolder} type="button">
              실행 폴더 열기
            </button>
            <button className="ghost-button" onClick={onRevealExecutionFolder} type="button">
              탐색기에서 열기
            </button>
          </div>
        }
      />
      {latestExecution.workspace.changedFiles.length > 0 ? (
        <div className="entity-list">
          {latestExecution.workspace.changedFiles.slice(0, 8).map((item) => (
            <button
              key={`${item.changeType}:${item.relativePath}`}
              className="agent-list-item"
              onClick={() => onInspectChangedFile(item.relativePath, item.changeType)}
              type="button"
            >
              <div>
                <strong>{item.relativePath}</strong>
                <small>
                  {changeTypeLabel(item.changeType)} · {formatRelative(item.updatedAt)}
                </small>
              </div>
              <StatusPill tone={item.changeType === 'deleted' ? 'warning' : 'muted'}>
                {changeTypeLabel(item.changeType)}
              </StatusPill>
            </button>
          ))}
        </div>
      ) : (
        <p className="files-emptyCopy">최근 실행에서 감지된 로컬 파일 변경은 없습니다.</p>
      )}
      {latestExecution.workspace.changeDetectionLimited ? (
        <p className="files-emptyCopy">변경 감지는 현재 작업 폴더 일부 범위만 표시했을 수 있습니다.</p>
      ) : null}
    </PanelCard>
  )
}

export function FilesBrowserLayout({
  list,
  inspector,
}: {
  list: ReactNode
  inspector: ReactNode
}) {
  return <SplitPane className="files-splitPane" primary={list} secondary={inspector} />
}

export function FilesBrowserPanel({
  query,
  onQueryChange,
  folderName,
  onFolderNameChange,
  onCreateFolder,
  onUpload,
  currentFolderLabel,
  workspaceLoading,
  hiddenSystemEntryCount,
  workspaceShowSystemEntries,
  onToggleSystemEntries,
  visibleItems,
  selectedPath,
  latestChangeMap,
  pendingDeletePath,
  onOpenEntry,
  onOpenFile,
  onDelete,
}: {
  query: string
  onQueryChange: (value: string) => void
  folderName: string
  onFolderNameChange: (value: string) => void
  onCreateFolder: () => void
  onUpload: () => void
  currentFolderLabel: string
  workspaceLoading: boolean
  hiddenSystemEntryCount: number
  workspaceShowSystemEntries: boolean
  onToggleSystemEntries: () => void
  visibleItems: WorkspaceEntry[]
  selectedPath: string | null
  latestChangeMap: Map<string, 'created' | 'modified' | 'deleted'>
  pendingDeletePath: string | null
  onOpenEntry: (relativePath: string, kind: 'file' | 'folder') => void
  onOpenFile: (relativePath: string) => void
  onDelete: (entry: WorkspaceEntry) => void
}) {
  return (
    <PanelCard className="files-browserPanel">
      <SectionHeader title="파일 목록" description="현재 폴더를 탐색하고 바로 열 수 있습니다." />
      <Toolbar
        className="files-toolbar"
        left={<SearchField onChange={onQueryChange} placeholder="현재 폴더 검색..." value={query} />}
        right={
          <div className="files-toolbar__actions">
            <label className="inline-input">
              <input onChange={(event) => onFolderNameChange(event.target.value)} placeholder="새 폴더 이름" value={folderName} />
            </label>
            <button className="outline-button" disabled={!folderName.trim()} onClick={onCreateFolder} type="button">
              새 폴더
            </button>
            <button className="primary-button" onClick={onUpload} type="button">
              업로드
            </button>
          </div>
        }
      />
      <div className="chip-wrap">
        <StatusPill tone="accent">{currentFolderLabel}</StatusPill>
        {workspaceLoading ? <StatusPill tone="muted">불러오는 중</StatusPill> : null}
        {hiddenSystemEntryCount > 0 ? (
          <button
            className={`chip ${workspaceShowSystemEntries ? 'is-active' : 'chip--soft'}`}
            onClick={onToggleSystemEntries}
            type="button"
          >
            {workspaceShowSystemEntries
              ? `시스템 항목 ${hiddenSystemEntryCount}개 표시 중`
              : `시스템 항목 ${hiddenSystemEntryCount}개 숨김`}
          </button>
        ) : null}
      </div>
      {visibleItems.length > 0 ? (
        <div className="entity-list">
          {visibleItems.map((item) => (
            <div key={item.relativePath} className={`file-row ${selectedPath === item.relativePath ? 'is-selected' : ''}`}>
              <button className="file-row__open" onClick={() => onOpenEntry(item.relativePath, item.kind)} type="button">
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
                  <StatusPill tone="muted">
                    AI {changeTypeLabel(latestChangeMap.get(item.relativePath) as 'created' | 'modified' | 'deleted')}
                  </StatusPill>
                ) : null}
                {!item.deletable ? <StatusPill tone="muted">삭제 보호</StatusPill> : null}
                <button
                  className="ghost-button"
                  onClick={() => (item.kind === 'file' ? onOpenFile(item.relativePath) : onOpenEntry(item.relativePath, 'folder'))}
                  type="button"
                >
                  열기
                </button>
                <button
                  className="danger-button danger-button--subtle"
                  disabled={!item.deletable}
                  onClick={() => onDelete(item)}
                  title={item.protectionReason ?? undefined}
                  type="button"
                >
                  {pendingDeletePath === item.relativePath ? '삭제 확인' : '삭제'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState description="검색어를 바꾸거나 파일을 업로드하면 이 영역에 항목이 채워집니다." title="표시할 파일이 없습니다" />
      )}
    </PanelCard>
  )
}

export function FileInspectorPanel({
  previewError,
  previewLoading,
  hasFileSelection,
  selectedFileMeta,
  selectedFileContent,
  onContentChange,
  onOpenChat,
  onReveal,
  onDelete,
  pendingDeletePath,
  previewSaving,
  canSave,
  onSave,
}: {
  previewError: string | null
  previewLoading: boolean
  hasFileSelection: boolean
  selectedFileMeta: {
    path: string
    name: string
    mimeType: string
    size: number
    updatedAt: string
    editable: boolean
    deletable: boolean
    protectionReason: string | null
  } | null
  selectedFileContent: string
  onContentChange: (value: string) => void
  onOpenChat: () => void
  onReveal: () => void
  onDelete: () => void
  pendingDeletePath: string | null
  previewSaving: boolean
  canSave: boolean
  onSave: () => void
}) {
  return (
    <PanelCard className="preview-card">
      {previewError ? <NoticeBanner tone="danger">{previewError}</NoticeBanner> : null}
      {previewLoading ? (
        <EmptyState description="선택한 파일 내용을 불러오는 중입니다." title="파일 미리보기 준비 중" />
      ) : hasFileSelection && selectedFileMeta ? (
        <>
          <SectionHeader
            title={selectedFileMeta.name}
            description={`${selectedFileMeta.mimeType} · ${bytesLabel(selectedFileMeta.size)} · ${formatRelative(selectedFileMeta.updatedAt)}`}
            actions={
              <div className="badge-row">
                <StatusPill tone="muted">{selectedFileMeta.editable ? '텍스트 편집 가능' : '미리보기 전용'}</StatusPill>
                {!selectedFileMeta.deletable ? <StatusPill tone="warning">삭제 보호</StatusPill> : null}
              </div>
            }
          />
          <Toolbar
            right={
              <div className="badge-row">
                <button className="ghost-button" onClick={onOpenChat} type="button">
                  채팅으로 수정 요청
                </button>
                <button className="ghost-button" onClick={onReveal} type="button">
                  위치 열기
                </button>
                <button
                  className="danger-button danger-button--subtle"
                  disabled={!selectedFileMeta.deletable}
                  onClick={onDelete}
                  title={selectedFileMeta.protectionReason ?? undefined}
                  type="button"
                >
                  {pendingDeletePath === selectedFileMeta.path ? '삭제 확인' : '삭제'}
                </button>
              </div>
            }
          />
          {!selectedFileMeta.deletable && selectedFileMeta.protectionReason ? (
            <NoticeBanner tone="warning">{selectedFileMeta.protectionReason}</NoticeBanner>
          ) : null}
          {selectedFileMeta.editable ? (
            <div className="preview-editor">
              <textarea
                className="preview-editor__textarea"
                onChange={(event) => onContentChange(event.target.value)}
                spellCheck={false}
                value={selectedFileContent}
              />
              <div className="preview-editor__footer">
                <span className="composer__hint">{previewSaving ? '저장 중' : '이 파일은 로컬 경로에 바로 저장됩니다.'}</span>
                <button className="primary-button" disabled={!canSave || previewSaving} onClick={onSave} type="button">
                  저장
                </button>
              </div>
            </div>
          ) : (
            <pre className="preview-card__content">
              이 파일 형식은 브라우저 안에서 직접 편집하지 않습니다. 위치 열기를 눌러 로컬 경로에서 확인하거나, 채팅에서 이 파일을 대상으로 작업 지시를 보내세요.
            </pre>
          )}
        </>
      ) : (
        <EmptyState description="왼쪽 목록에서 파일을 열면 여기서 바로 내용을 보고 저장할 수 있습니다." title="파일을 선택해 주세요" />
      )}
    </PanelCard>
  )
}
