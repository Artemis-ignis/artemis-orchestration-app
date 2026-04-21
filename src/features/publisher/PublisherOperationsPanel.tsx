import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { EmptyState } from '../../crewPageShared'
import { formatDate, formatRelative } from '../../crewPageHelpers'
import { Icon } from '../../icons'
import type {
  PublisherDossier,
  PublisherDraft,
  PublisherLog,
  PublisherMetrics,
  PublisherRuntimeStatus,
  PublisherSettings,
  PublisherState,
  PublishedPost,
} from '../../types/publisher'
import { PublisherArticle } from './PublisherArticle'
import {
  dossierStatusLabel,
  draftStatusLabel,
  publisherModeLabel,
  sourceTypeLabel,
  summaryTypeLabel,
} from './publisherUi'

type ProviderOption = { value: string; label: string }

type PublisherOperationsPanelProps = {
  actionMessage: string | null
  dossiers: PublisherDossier[]
  isWorking: boolean
  publisherState: PublisherState
  publisherSettings: PublisherSettings
  publisherSettingsDraft: PublisherSettings
  setPublisherSettingsDraft: Dispatch<SetStateAction<PublisherSettings>>
  publisherMetrics: PublisherMetrics
  internalPublisherStatus: PublisherRuntimeStatus
  xCrossPostStatus: PublisherRuntimeStatus | null
  providerOptions: ProviderOption[]
  providerFilter: string
  setProviderFilter: (value: string) => void
  statusFilter: string
  setStatusFilter: (value: string) => void
  filteredDrafts: PublisherDraft[]
  selectedDraftId: string | null
  onSelectDraft: (id: string) => void
  selectedDraft: PublisherDraft | null
  selectedDraftLogs: PublisherLog[]
  filteredPublishedItems: PublishedPost[]
  selectedPublishedId: string | null
  onSelectPublished: (id: string) => void
  selectedPublished: PublishedPost | null
  selectedDossierId: string | null
  onSelectDossier: (id: string) => void
  selectedDossier: PublisherDossier | null
  onCreateDraft: () => Promise<void>
  onRefresh: () => Promise<void>
  onSaveSettings: () => Promise<void>
  onApproveDraft: (draftId: string) => Promise<void>
  onPublishDraft: (draftId: string) => Promise<void>
  onRejectDraft: (draftId: string) => Promise<void>
}

function compactText(value: string, maxLength = 220) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return !normalized ? '' : normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}…` : normalized
}

function extractDraftHeadline(text: string, fallback: string) {
  const inlineMatch = String(text ?? '').match(/^제목[:：]\s*(.+)$/m)
  if (inlineMatch?.[1]) {
    return inlineMatch[1].trim()
  }

  const blockMatch = String(text ?? '').match(/^제목\s*$\s*([\s\S]+?)$/m)
  if (blockMatch?.[1]) {
    const nextLine = blockMatch[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    if (nextLine) {
      return nextLine
    }
  }

  return fallback
}

function extractDraftLead(text: string, fallback: string) {
  const inlineMatch = String(text ?? '').match(/^(리드|의미|요약)[:：]\s*(.+)$/m)
  if (inlineMatch?.[2]) {
    return inlineMatch[2].trim()
  }
  return fallback
}

function publisherStateLabel(status: PublisherRuntimeStatus | null) {
  if (!status) return '사용 안 함'
  if (status.ready) return '준비됨'
  if (status.enabled) return '활성됨'
  return '사용 안 함'
}

function timelineKindLabel(kind: PublisherDossier['timeline'][number]['kind']) {
  switch (kind) {
    case 'published':
      return '게시'
    case 'scheduled':
      return '예약'
    case 'skipped':
      return '제외'
    case 'log':
      return '로그'
    default:
      return '초안'
  }
}

function MessageBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="status-banner status-banner--info">
      <Icon name="spark" size={16} />
      <span>{message}</span>
    </div>
  )
}

function SettingsGrid({
  draft,
  setDraft,
  onSave,
  isWorking,
}: {
  draft: PublisherSettings
  setDraft: Dispatch<SetStateAction<PublisherSettings>>
  onSave: () => Promise<void>
  isWorking: boolean
}) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <h2>운영 정책</h2>
        <span className="chip chip--soft">{draft.generationModel}</span>
      </div>
      <div className="auto-post-settings-grid">
        <label className="field">
          <span>모드</span>
          <select
            value={draft.mode}
            onChange={(event) =>
              setDraft((current) => ({ ...current, mode: event.target.value as PublisherSettings['mode'] }))
            }
          >
            <option value="dry-run">시뮬레이션</option>
            <option value="approval">승인 대기</option>
            <option value="auto">자동 게시</option>
          </select>
        </label>
        <label className="field">
          <span>생성 모델</span>
          <input
            value={draft.generationModel}
            onChange={(event) => setDraft((current) => ({ ...current, generationModel: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>기본 생성 수</span>
          <input
            type="number"
            min={1}
            max={20}
            value={draft.defaultQueueLimit}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                defaultQueueLimit: Number(event.target.value || current.defaultQueueLimit),
              }))
            }
          />
        </label>
        <label className="field">
          <span>시간당 최대</span>
          <input
            type="number"
            min={1}
            max={24}
            value={draft.maxPerHour}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                maxPerHour: Number(event.target.value || current.maxPerHour),
              }))
            }
          />
        </label>
        <label className="field">
          <span>최소 간격(분)</span>
          <input
            type="number"
            min={1}
            value={draft.minIntervalMinutes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                minIntervalMinutes: Number(event.target.value || current.minIntervalMinutes),
              }))
            }
          />
        </label>
        <label className="field">
          <span>하루 최대</span>
          <input
            type="number"
            min={1}
            value={draft.maxPerDay}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                maxPerDay: Number(event.target.value || current.maxPerDay),
              }))
            }
          />
        </label>
        <label className="field">
          <span>최소 신규성</span>
          <input
            type="number"
            min={0}
            max={1}
            step="0.01"
            value={draft.minNoveltyScore}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                minNoveltyScore: Number(event.target.value || current.minNoveltyScore),
              }))
            }
          />
        </label>
        <label className="field">
          <span>내부 게시</span>
          <select
            value={draft.publishInternalEnabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                publishInternalEnabled: event.target.value === 'enabled',
              }))
            }
          >
            <option value="enabled">활성</option>
            <option value="disabled">비활성</option>
          </select>
        </label>
        <label className="field">
          <span>X 크로스포스트</span>
          <select
            value={draft.publishXEnabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                publishXEnabled: event.target.value === 'enabled',
              }))
            }
          >
            <option value="disabled">비활성</option>
            <option value="enabled">활성</option>
          </select>
        </label>
        <label className="field">
          <span>arXiv</span>
          <select
            value={draft.ingestArxivEnabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                ingestArxivEnabled: event.target.value === 'enabled',
              }))
            }
          >
            <option value="enabled">활성</option>
            <option value="disabled">비활성</option>
          </select>
        </label>
        <label className="field">
          <span>Crossref</span>
          <select
            value={draft.ingestCrossrefEnabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                ingestCrossrefEnabled: event.target.value === 'enabled',
              }))
            }
          >
            <option value="enabled">활성</option>
            <option value="disabled">비활성</option>
          </select>
        </label>
        <label className="field">
          <span>Semantic Scholar</span>
          <select
            value={draft.ingestSemanticScholarEnabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                ingestSemanticScholarEnabled: event.target.value === 'enabled',
              }))
            }
          >
            <option value="enabled">활성</option>
            <option value="disabled">비활성</option>
          </select>
        </label>
        <label className="field">
          <span>News API</span>
          <select
            value={draft.ingestNewsApiEnabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                ingestNewsApiEnabled: event.target.value === 'enabled',
              }))
            }
          >
            <option value="disabled">비활성</option>
            <option value="enabled">활성</option>
          </select>
        </label>
        <label className="field">
          <span>RSS / Atom</span>
          <select
            value={draft.ingestRssEnabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                ingestRssEnabled: event.target.value === 'enabled',
              }))
            }
          >
            <option value="disabled">비활성</option>
            <option value="enabled">활성</option>
          </select>
        </label>
        <label className="field">
          <span>기존 시그널 연동</span>
          <select
            value={draft.ingestLegacySignalsEnabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                ingestLegacySignalsEnabled: event.target.value === 'enabled',
              }))
            }
          >
            <option value="enabled">활성</option>
            <option value="disabled">비활성</option>
          </select>
        </label>
        <label className="field field--full">
          <span>수집 질의</span>
          <input
            value={draft.ingestQuery}
            onChange={(event) => setDraft((current) => ({ ...current, ingestQuery: event.target.value }))}
          />
        </label>
        <label className="field field--full">
          <span>RSS / Atom 피드</span>
          <textarea
            rows={3}
            value={draft.rssFeeds.join('\n')}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                rssFeeds: event.target.value
                  .split(/\r?\n/)
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              }))
            }
          />
        </label>
      </div>
      <div className="badge-row">
        <button className="primary-button" disabled={isWorking} onClick={() => void onSave()} type="button">
          설정 저장
        </button>
      </div>
    </section>
  )
}

function SourceStatusCard({ publisherState }: { publisherState: PublisherState }) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <h2>활성 소스 현황</h2>
        <span className="chip chip--soft">{publisherState.providerStats.length}개</span>
      </div>
      {publisherState.providerStats.length > 0 ? (
        <div className="run-card__logs">
          {publisherState.providerStats.map((stat) => (
            <div
              key={stat.provider}
              className={`run-log run-log--${stat.lastError ? 'error' : stat.enabled ? 'success' : 'info'}`}
            >
              <span>{stat.label}</span>
              <p>
                수집 {stat.lastFetchedCount} / 초안 {stat.lastDraftCount} / 제외 {stat.lastSkippedCount}
                {stat.lastFetchedAt ? ` · 최근 ${formatRelative(stat.lastFetchedAt)}` : ''}
                {stat.lastError ? ` · 오류: ${stat.lastError}` : ''}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          description="한 번 이상 수집을 실행하면 소스별 수집량과 오류 상태가 여기에 기록됩니다."
          title="소스 기록이 없습니다"
        />
      )}
    </section>
  )
}

function DossierDetail({ dossier }: { dossier: PublisherDossier }) {
  return (
    <section className="panel-card panel-card--detail publisher-detail">
      <div className="panel-card__header">
        <div>
          <h2>{dossier.title}</h2>
          <p className="settings-card__lead">{dossier.lead}</p>
        </div>
        <div className="badge-row">
          <span className="chip chip--soft">{dossierStatusLabel(dossier.status)}</span>
          <span className="chip chip--soft">소스 {dossier.sourceCount}</span>
          <span className="chip chip--soft">게시 {dossier.publishedCount}</span>
        </div>
      </div>

      <p className="publisher-dossier-summary">{dossier.summary}</p>

      <div className="badge-row">
        {dossier.providerLabels.map((item) => (
          <span key={item} className="chip chip--soft">
            {item}
          </span>
        ))}
        {dossier.tags.map((item) => (
          <span key={item} className="chip chip--soft">
            {item}
          </span>
        ))}
      </div>

      {dossier.keyPoints.length > 0 ? (
        <section className="publisher-dossier-block">
          <h3>핵심 포인트</h3>
          <ul className="publisher-key-points">
            {dossier.keyPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="publisher-dossier-block">
        <h3>관련 소스</h3>
        <div className="publisher-source-list">
          {dossier.sourceItems.map((item) => (
            <article key={item.id} className="publisher-source-item">
              <div className="card-topline">
                <span className="chip chip--soft">{item.provider}</span>
                <small>{item.publishedAt ? formatDate(item.publishedAt) : '시간 미상'}</small>
              </div>
              <strong>{item.title}</strong>
              <p>{compactText(item.abstractOrSnippet, 180)}</p>
              <div className="badge-row">
                <span className="chip chip--soft">{sourceTypeLabel(item.sourceType)}</span>
                {item.doi ? <span className="chip chip--soft">DOI</span> : null}
                {item.arxivId ? <span className="chip chip--soft">arXiv</span> : null}
              </div>
              {item.sourceUrl ? (
                <button
                  className="ghost-button"
                  onClick={() => window.open(item.sourceUrl, '_blank', 'noopener,noreferrer')}
                  type="button"
                >
                  원문 열기
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="publisher-dossier-block">
        <h3>업데이트 타임라인</h3>
        <div className="publisher-timeline">
          {dossier.timeline.map((item) => (
            <article key={item.id} className="publisher-timeline__item">
              <div className="card-topline">
                <span className="chip chip--soft">{timelineKindLabel(item.kind)}</span>
                <small>{item.createdAt ? formatDate(item.createdAt) : '시간 미상'}</small>
              </div>
              <strong>{item.title}</strong>
              {item.detail ? <p>{item.detail}</p> : null}
              {item.sourceUrl ? (
                <button
                  className="ghost-button"
                  onClick={() => window.open(item.sourceUrl, '_blank', 'noopener,noreferrer')}
                  type="button"
                >
                  링크 열기
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function DraftDetail({
  draft,
  logs,
  isWorking,
  onApprove,
  onPublish,
  onReject,
}: {
  draft: PublisherDraft
  logs: PublisherLog[]
  isWorking: boolean
  onApprove: (id: string) => Promise<void>
  onPublish: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
}) {
  const displayTitle = extractDraftHeadline(draft.generatedText, draft.sourceTitle)
  const displayLead = extractDraftLead(draft.generatedText, draft.subtitle || draft.sourceSummary)

  return (
    <section className="panel-card panel-card--detail publisher-detail">
      <div className="panel-card__header">
        <div>
          <h2>{displayTitle}</h2>
          <p className="settings-card__lead">
            {draft.sourceLabel} / {summaryTypeLabel(draft.summaryType)} /{' '}
            {draft.sourcePublishedAt ? formatDate(draft.sourcePublishedAt) : '시간 미상'}
          </p>
        </div>
        <div className="badge-row">
          <span className="chip chip--soft">{draftStatusLabel(draft.status)}</span>
          <span className="chip chip--soft">{sourceTypeLabel(draft.sourceType)}</span>
          <span className="chip chip--soft">신규성 {draft.noveltyScore.toFixed(2)}</span>
        </div>
      </div>

      <div className="badge-row">
        <button
          className="primary-button"
          disabled={isWorking || draft.status !== 'draft'}
          onClick={() => void onApprove(draft.id)}
          type="button"
        >
          승인
        </button>
        <button className="ghost-button" disabled={isWorking} onClick={() => void onPublish(draft.id)} type="button">
          지금 게시
        </button>
        <button className="ghost-button" disabled={isWorking} onClick={() => void onReject(draft.id)} type="button">
          큐에서 제외
        </button>
        {draft.sourceUrl ? (
          <button
            className="ghost-button"
            onClick={() => window.open(draft.sourceUrl, '_blank', 'noopener,noreferrer')}
            type="button"
          >
            원문 열기
          </button>
        ) : null}
      </div>

      <div className="badge-row">
        <span className="chip chip--soft">대상 {draft.publishTarget === 'internal' ? '내부 게시' : 'X'}</span>
        {draft.crossPostToX ? <span className="chip chip--soft">X 크로스포스트 예정</span> : null}
        {draft.scheduledAt ? <span className="chip chip--soft">예약 {formatDate(draft.scheduledAt)}</span> : null}
        {draft.dossierId ? <span className="chip chip--soft">이슈 묶음 연결됨</span> : null}
      </div>

      {draft.errorReason ? (
        <div className="status-banner status-banner--warning">
          <Icon name="warning" size={16} />
          <span>{draft.errorReason}</span>
        </div>
      ) : null}

      <PublisherArticle
        title={displayTitle}
        excerpt={displayLead}
        body={draft.generatedText}
        sourceUrl={draft.sourceUrl}
        sourceLabel={draft.sourceLabel}
        category={draft.category}
        summaryType={summaryTypeLabel(draft.summaryType)}
        publishedAt={draft.sourcePublishedAt}
        authors={draft.authors}
        tags={draft.tags}
      />

      <section className="publisher-dossier-block">
        <h3>최근 로그</h3>
        <div className="run-card__logs">
          {logs.map((item) => (
            <div
              key={item.id}
              className={`run-log run-log--${item.level === 'warning' ? 'error' : item.level}`}
            >
              <span>{formatDate(item.createdAt)}</span>
              <p>{item.message}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

function PublishedDetail({ item }: { item: PublishedPost }) {
  return (
    <section className="panel-card panel-card--detail publisher-detail">
      <div className="panel-card__header">
        <div>
          <h2>{item.title}</h2>
          <p className="settings-card__lead">
            {item.sourceLabel || item.provider} / {summaryTypeLabel(item.summaryType)} / {formatDate(item.publishedAt)}
          </p>
        </div>
        <div className="badge-row">
          <span className="chip chip--soft">내부 게시됨</span>
          <span className="chip chip--soft">{sourceTypeLabel(item.sourceType)}</span>
          {item.category ? <span className="chip chip--soft">{item.category}</span> : null}
        </div>
      </div>

      <PublisherArticle
        title={item.title}
        excerpt={item.excerpt}
        body={item.body}
        sourceUrl={item.sourceUrl}
        sourceLabel={item.sourceLabel || item.provider}
        category={item.category}
        summaryType={summaryTypeLabel(item.summaryType)}
        publishedAt={item.publishedAt}
        authors={item.authors}
        tags={item.tags}
      />
    </section>
  )
}

function QueueSection<T extends { id: string }>({
  title,
  countLabel,
  items,
  selectedId,
  onSelect,
  emptyTitle,
  emptyDescription,
  renderMeta,
}: {
  title: string
  countLabel: string
  items: T[]
  selectedId: string | null
  onSelect: (id: string) => void
  emptyTitle: string
  emptyDescription: string
  renderMeta: (item: T) => ReactNode
}) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <h2>{title}</h2>
        <span className="chip chip--soft">{countLabel}</span>
      </div>
      {items.length > 0 ? (
        <div className="publisher-queue">
          {items.map((item) => (
            <button
              key={item.id}
              className={`auto-post-card publisher-queue-card ${selectedId === item.id ? 'is-active' : ''}`}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <div className="auto-post-card__body">{renderMeta(item)}</div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState description={emptyDescription} title={emptyTitle} />
      )}
    </section>
  )
}

export function PublisherOperationsPanel(props: PublisherOperationsPanelProps) {
  const {
    actionMessage,
    dossiers,
    isWorking,
    publisherState,
    publisherSettings,
    publisherSettingsDraft,
    setPublisherSettingsDraft,
    publisherMetrics,
    internalPublisherStatus,
    xCrossPostStatus,
    providerOptions,
    providerFilter,
    setProviderFilter,
    statusFilter,
    setStatusFilter,
    filteredDrafts,
    selectedDraftId,
    onSelectDraft,
    selectedDraft,
    selectedDraftLogs,
    filteredPublishedItems,
    selectedPublishedId,
    onSelectPublished,
    selectedPublished,
    selectedDossierId,
    onSelectDossier,
    selectedDossier,
    onCreateDraft,
    onRefresh,
    onSaveSettings,
    onApproveDraft,
    onPublishDraft,
    onRejectDraft,
  } = props

  return (
    <div className="publisher-shell signals-ops-shell publisher-shell--wire">
      <div className="publisher-side signals-ops-side">
        <section className="panel-card publisher-overviewCard">
          <div className="panel-card__header">
            <div>
              <h2>아르테미스 와이어 운영</h2>
              <p className="settings-card__lead">
                같은 이슈의 소스를 묶어 추적하고, 초안 생성부터 승인·예약·내부 게시까지 한 화면에서 관리합니다.
              </p>
            </div>
            <span className={`chip ${publisherState.inProgress ? 'is-active' : 'chip--soft'}`}>
              {publisherModeLabel(publisherSettings.mode)}
            </span>
          </div>

          <MessageBanner message={actionMessage} />

          <div className="stack-grid stack-grid--compact">
            <div className="summary-row">
              <span>내부 게시기</span>
              <strong>{publisherStateLabel(internalPublisherStatus)}</strong>
            </div>
            <div className="summary-row">
              <span>X 크로스포스트</span>
              <strong>{publisherStateLabel(xCrossPostStatus)}</strong>
            </div>
            <div className="summary-row">
              <span>라이브 이슈 묶음</span>
              <strong>{publisherMetrics.dossierCount}개</strong>
            </div>
            <div className="summary-row">
              <span>최근 게시</span>
              <strong>{publisherState.lastPublishedAt ? formatDate(publisherState.lastPublishedAt) : '없음'}</strong>
            </div>
            <div className="summary-row">
              <span>다음 수집</span>
              <strong>{publisherState.nextIngestAt ? formatDate(publisherState.nextIngestAt) : '대기 중'}</strong>
            </div>
            <div className="summary-row">
              <span>다음 발행</span>
              <strong>{publisherState.nextPublishAt ? formatDate(publisherState.nextPublishAt) : '없음'}</strong>
            </div>
          </div>

          {publisherState.lastError ? (
            <div className="status-banner status-banner--warning">
              <Icon name="warning" size={16} />
              <span>{publisherState.lastError}</span>
            </div>
          ) : null}

          <p className="settings-card__lead">{internalPublisherStatus.detail}</p>
          {xCrossPostStatus ? <p className="settings-card__lead">X: {xCrossPostStatus.detail}</p> : null}

          <div className="badge-row">
            <span className="chip chip--soft">1시간 {publisherMetrics.publishedCount1h}/{publisherSettings.maxPerHour}</span>
            <span className="chip chip--soft">24시간 {publisherMetrics.publishedCount24h}/{publisherSettings.maxPerDay}</span>
            <span className="chip chip--soft">승인 대기 {publisherMetrics.draftCount}</span>
            <span className="chip chip--soft">예약 {publisherMetrics.scheduledCount}</span>
            <span className="chip chip--soft">실패 {publisherMetrics.failedCount}</span>
          </div>

          <div className="badge-row">
            <button className="primary-button" disabled={isWorking} onClick={() => void onCreateDraft()} type="button">
              현재 카테고리로 초안 생성
            </button>
            <button className="ghost-button" disabled={isWorking} onClick={() => void onRefresh()} type="button">
              상태 새로고침
            </button>
          </div>
        </section>

        <SettingsGrid
          draft={publisherSettingsDraft}
          setDraft={setPublisherSettingsDraft}
          onSave={onSaveSettings}
          isWorking={isWorking}
        />

        <SourceStatusCard publisherState={publisherState} />

        <QueueSection
          title="라이브 이슈 묶음"
          countLabel={`${dossiers.length}개`}
          items={dossiers}
          selectedId={selectedDossierId}
          onSelect={onSelectDossier}
          emptyTitle="아직 이슈 묶음이 없습니다"
          emptyDescription="와이어가 초안이나 게시물을 만들기 시작하면 같은 주제를 묶은 이슈 묶음이 여기에 쌓입니다."
          renderMeta={(item: PublisherDossier) => (
            <>
              <div className="card-topline">
                <span className="chip chip--soft">{dossierStatusLabel(item.status)}</span>
                <small>{item.lastUpdatedAt ? formatDate(item.lastUpdatedAt) : '방금'}</small>
              </div>
              <strong>{item.title}</strong>
              <p>{item.summary}</p>
              <div className="badge-row">
                <span className="chip chip--soft">소스 {item.sourceCount}</span>
                <span className="chip chip--soft">초안 {item.draftCount}</span>
                <span className="chip chip--soft">게시 {item.publishedCount}</span>
              </div>
            </>
          )}
        />

        <section className="panel-card publisher-queueCard">
          <div className="panel-card__header">
            <h2>게시 큐</h2>
            <span className="chip chip--soft">{filteredDrafts.length}개</span>
          </div>
          <div className="auto-post-settings-grid">
            <label className="field">
              <span>소스 필터</span>
              <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
                <option value="all">전체</option>
                {providerOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>상태 필터</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">전체</option>
                <option value="draft">초안</option>
                <option value="approved">승인됨</option>
                <option value="scheduled">예약됨</option>
                <option value="published">게시됨</option>
                <option value="failed">실패</option>
                <option value="skipped">건너뜀</option>
                <option value="disabled">비활성</option>
              </select>
            </label>
          </div>
          {filteredDrafts.length > 0 ? (
            <div className="publisher-queue">
              {filteredDrafts.map((item) => (
                <button
                  key={item.id}
                  className={`auto-post-card publisher-queue-card ${selectedDraftId === item.id ? 'is-active' : ''}`}
                  onClick={() => onSelectDraft(item.id)}
                  type="button"
                >
                  <div className="auto-post-card__body">
                    <div className="card-topline">
                      <span className="chip chip--soft">{item.sourceLabel || item.provider}</span>
                      <small>{formatDate(item.updatedAt)}</small>
                    </div>
                    <strong>{extractDraftHeadline(item.generatedText, item.sourceTitle)}</strong>
                    <p>{compactText(extractDraftLead(item.generatedText, item.sourceSummary), 140)}</p>
                    <div className="badge-row">
                      <span className="chip chip--soft">{draftStatusLabel(item.status)}</span>
                      <span className="chip chip--soft">{sourceTypeLabel(item.sourceType)}</span>
                      <span className="chip chip--soft">{item.category}</span>
                      <span className="chip chip--soft">신규성 {item.noveltyScore.toFixed(2)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              description="실시간 시그널에서 초안을 만들거나 현재 카테고리 기준으로 와이어 초안을 채우면 여기에 쌓입니다."
              action="지금 초안 만들기"
              onAction={() => void onCreateDraft()}
              title="아르테미스 와이어 큐가 비어 있습니다"
            />
          )}
        </section>

        <QueueSection
          title="게시 이력"
          countLabel={`${filteredPublishedItems.length}개`}
          items={filteredPublishedItems}
          selectedId={selectedPublishedId}
          onSelect={onSelectPublished}
          emptyTitle="아르테미스 와이어 게시 이력이 없습니다"
          emptyDescription="승인된 초안이 발행되면 내부 사이트 게시 이력이 여기에 쌓입니다."
          renderMeta={(item: PublishedPost) => (
            <>
              <div className="card-topline">
                <span className="chip chip--soft">{item.sourceLabel || item.provider}</span>
                <small>{formatDate(item.publishedAt)}</small>
              </div>
              <strong>{item.title}</strong>
              <p>{compactText(item.excerpt, 160)}</p>
              <div className="badge-row">
                <span className="chip chip--soft">{summaryTypeLabel(item.summaryType)}</span>
                <span className="chip chip--soft">{sourceTypeLabel(item.sourceType)}</span>
                {item.category ? <span className="chip chip--soft">{item.category}</span> : null}
              </div>
            </>
          )}
        />
      </div>

      <div className="publisher-main signals-ops-detail">
        {selectedDossier ? (
          <DossierDetail dossier={selectedDossier} />
        ) : selectedDraft ? (
          <DraftDetail
            draft={selectedDraft}
            logs={selectedDraftLogs}
            isWorking={isWorking}
            onApprove={onApproveDraft}
            onPublish={onPublishDraft}
            onReject={onRejectDraft}
          />
        ) : selectedPublished ? (
          <PublishedDetail item={selectedPublished} />
        ) : (
          <section className="panel-card panel-card--detail publisher-detail">
            <EmptyState
              description="왼쪽에서 이슈 묶음, 와이어 초안, 또는 게시 이력을 선택하면 같은 주제의 흐름과 실제 게시 내용을 여기서 읽을 수 있습니다."
              title="상세 항목을 선택해 주세요"
            />
          </section>
        )}
      </div>
    </div>
  )
}
