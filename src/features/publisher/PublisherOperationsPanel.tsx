import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { DisclosureSection, EmptyState } from '../../crewPageShared'
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

function compactText(value: string, maxLength = 180) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '설명이 아직 없습니다.'
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized
}

function extractDraftHeadline(draft: PublisherDraft) {
  const lines = String(draft.generatedText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const explicitTitle = lines.find((line) => /^제목[:：]\s*/.test(line))
  if (explicitTitle) {
    return explicitTitle.replace(/^제목[:：]\s*/, '').trim() || draft.sourceTitle
  }
  return draft.sourceTitle
}

function extractDraftLead(draft: PublisherDraft) {
  const lines = String(draft.generatedText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const leadLine = lines.find((line) => /^(리드|요약|핵심)[:：]\s*/.test(line))
  if (leadLine) {
    return leadLine.replace(/^(리드|요약|핵심)[:：]\s*/, '').trim() || draft.sourceSummary
  }
  return draft.subtitle || draft.sourceSummary
}

function publisherStatusSummary(status: PublisherRuntimeStatus | null) {
  if (!status) {
    return '미설정'
  }
  if (status.ready) {
    return '정상'
  }
  if (status.enabled) {
    return '확인 필요'
  }
  return '꺼짐'
}

function publisherStatusTone(status: PublisherRuntimeStatus | null) {
  if (!status) return 'muted'
  if (status.ready) return 'is-active'
  if (status.enabled) return 'chip--soft'
  return 'chip--soft'
}

function timelineKindLabel(kind: PublisherDossier['timeline'][number]['kind']) {
  switch (kind) {
    case 'published':
      return '발행'
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

function QueueSection<T extends { id: string }>({
  title,
  countLabel,
  items,
  selectedId,
  onSelect,
  emptyTitle,
  emptyDescription,
  headerAction,
  renderMeta,
}: {
  title: string
  countLabel: string
  items: T[]
  selectedId: string | null
  onSelect: (id: string) => void
  emptyTitle: string
  emptyDescription: string
  headerAction?: ReactNode
  renderMeta: (item: T) => ReactNode
}) {
  return (
    <section className="panel-card publisher-queueCard">
      <div className="panel-card__header">
        <h2>{title}</h2>
        <div className="badge-row">
          <span className="chip chip--soft">{countLabel}</span>
          {headerAction}
        </div>
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

function SettingsDisclosure({
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
    <DisclosureSection
      className="disclosure--soft"
      title="설정"
      summary="모드, 빈도, 게시 채널"
    >
      <div className="auto-post-settings-grid">
        <label className="field">
          <span>모드</span>
          <select
            value={draft.mode}
            onChange={(event) =>
              setDraft((current) => ({ ...current, mode: event.target.value as PublisherSettings['mode'] }))
            }
          >
            <option value="approval">검토 후 게시</option>
            <option value="dry-run">시뮬레이션</option>
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
            min={1}
            type="number"
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
            min={1}
            type="number"
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
            min={1}
            type="number"
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
            <option value="enabled">켜기</option>
            <option value="disabled">끄기</option>
          </select>
        </label>
        <label className="field">
          <span>X 교차 게시</span>
          <select
            value={draft.publishXEnabled ? 'enabled' : 'disabled'}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                publishXEnabled: event.target.value === 'enabled',
              }))
            }
          >
            <option value="disabled">끄기</option>
            <option value="enabled">켜기</option>
          </select>
        </label>
        <label className="field field--full">
          <span>수집 질의</span>
          <input
            value={draft.ingestQuery}
            onChange={(event) => setDraft((current) => ({ ...current, ingestQuery: event.target.value }))}
          />
        </label>
      </div>
      <div className="badge-row">
        <button className="primary-button" disabled={isWorking} onClick={() => void onSave()} type="button">
          설정 저장
        </button>
      </div>
    </DisclosureSection>
  )
}

function SourceStatusDisclosure({ publisherState }: { publisherState: PublisherState }) {
  return (
    <DisclosureSection
      className="disclosure--soft"
      title="소스 상태"
      summary="수집기별 최근 상태"
    >
      {publisherState.providerStats.length > 0 ? (
        <div className="run-card__logs">
          {publisherState.providerStats.map((stat) => (
            <div
              key={stat.provider}
              className={`run-log run-log--${stat.lastError ? 'error' : stat.enabled ? 'success' : 'info'}`}
            >
              <span>{stat.label}</span>
              <p>
                수집 {stat.lastFetchedCount} · 초안 {stat.lastDraftCount} · 제외 {stat.lastSkippedCount}
                {stat.lastFetchedAt ? ` · 최근 ${formatRelative(stat.lastFetchedAt)}` : ''}
                {stat.lastError ? ` · 오류: ${stat.lastError}` : ''}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          description="수집기가 한 번이라도 돌면 여기에서 소스별 상태를 확인할 수 있습니다."
          title="아직 소스 기록이 없습니다"
        />
      )}
    </DisclosureSection>
  )
}

function DossierDetail({ dossier }: { dossier: PublisherDossier }) {
  return (
    <section className="panel-card panel-card--detail publisher-detail">
      <div className="panel-card__header">
        <div>
          <h2>{dossier.title}</h2>
          <p className="settings-card__lead">{dossier.lead || dossier.summary}</p>
        </div>
        <div className="badge-row">
          <span className="chip chip--soft">{dossierStatusLabel(dossier.status)}</span>
          <span className="chip chip--soft">소스 {dossier.sourceCount}</span>
          <span className="chip chip--soft">발행 {dossier.publishedCount}</span>
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
                {item.sourceUrl ? (
                  <button
                    className="ghost-button ghost-button--compact"
                    onClick={() => window.open(item.sourceUrl, '_blank', 'noopener,noreferrer')}
                    type="button"
                  >
                    원문 열기
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {dossier.timeline.length > 0 ? (
        <DisclosureSection
          className="disclosure--soft"
          title="업데이트 기록"
          summary="초안, 발행, 로그 흐름"
        >
          <div className="publisher-timeline">
            {dossier.timeline.map((item) => (
              <article key={item.id} className="publisher-timeline__item">
                <div className="card-topline">
                  <span className="chip chip--soft">{timelineKindLabel(item.kind)}</span>
                  <small>{item.createdAt ? formatDate(item.createdAt) : '시간 미상'}</small>
                </div>
                <strong>{item.title}</strong>
                {item.detail ? <p>{compactText(item.detail, 200)}</p> : null}
              </article>
            ))}
          </div>
        </DisclosureSection>
      ) : null}
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
  const title = extractDraftHeadline(draft)
  const lead = extractDraftLead(draft)

  return (
    <section className="panel-card panel-card--detail publisher-detail">
      <div className="panel-card__header">
        <div>
          <h2>{title}</h2>
          <p className="settings-card__lead">
            {draft.sourceLabel || draft.provider} · {summaryTypeLabel(draft.summaryType)} ·{' '}
            {draft.sourcePublishedAt ? formatDate(draft.sourcePublishedAt) : '시간 미상'}
          </p>
        </div>
        <div className="badge-row">
          <span className="chip chip--soft">{draftStatusLabel(draft.status)}</span>
          <span className="chip chip--soft">{sourceTypeLabel(draft.sourceType)}</span>
          <span className="chip chip--soft">주제 점수 {draft.noveltyScore.toFixed(2)}</span>
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
          제외
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

      {draft.errorReason ? (
        <div className="status-banner status-banner--warning">
          <Icon name="warning" size={16} />
          <span>{draft.errorReason}</span>
        </div>
      ) : null}

      <PublisherArticle
        title={title}
        excerpt={lead}
        body={draft.generatedText}
        sourceUrl={draft.sourceUrl}
        sourceLabel={draft.sourceLabel}
        category={draft.category}
        summaryType={summaryTypeLabel(draft.summaryType)}
        publishedAt={draft.sourcePublishedAt}
        authors={draft.authors}
        tags={draft.tags}
      />

      {logs.length > 0 ? (
        <DisclosureSection className="disclosure--soft" title="실행 로그" summary="생성·승인·게시 로그">
          <div className="run-card__logs">
            {logs.map((item) => (
              <div key={item.id} className={`run-log run-log--${item.level === 'warning' ? 'error' : item.level}`}>
                <span>{formatDate(item.createdAt)}</span>
                <p>{item.message}</p>
              </div>
            ))}
          </div>
        </DisclosureSection>
      ) : null}
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
            {item.sourceLabel || item.provider} · {summaryTypeLabel(item.summaryType)} · {formatDate(item.publishedAt)}
          </p>
        </div>
        <div className="badge-row">
          <span className="chip chip--soft">내부 게시</span>
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
              <h2>발행 운영</h2>
              <p className="settings-card__lead">
                초안 생성, 검토, 내부 게시 상태를 한 화면에서 정리합니다.
              </p>
            </div>
            <span className={`chip ${publisherState.inProgress ? 'is-active' : 'chip--soft'}`}>
              {publisherModeLabel(publisherSettings.mode)}
            </span>
          </div>

          <MessageBanner message={actionMessage} />

          <div className="stack-grid stack-grid--compact">
            <div className="summary-row">
              <span>내부 게시</span>
              <strong>{publisherStatusSummary(internalPublisherStatus)}</strong>
            </div>
            <div className="summary-row">
              <span>X 교차 게시</span>
              <strong>{publisherStatusSummary(xCrossPostStatus)}</strong>
            </div>
            <div className="summary-row">
              <span>검토 대기</span>
              <strong>{publisherMetrics.draftCount}건</strong>
            </div>
            <div className="summary-row">
              <span>주제 묶음</span>
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
          </div>

          {publisherState.lastError ? (
            <div className="status-banner status-banner--warning">
              <Icon name="warning" size={16} />
              <span>{publisherState.lastError}</span>
            </div>
          ) : null}

          <div className="badge-row">
            <span className={`chip ${publisherStatusTone(internalPublisherStatus)}`}>{internalPublisherStatus.detail}</span>
            {xCrossPostStatus ? <span className="chip chip--soft">{xCrossPostStatus.detail}</span> : null}
          </div>

          <div className="badge-row">
            <button className="primary-button" disabled={isWorking} onClick={() => void onCreateDraft()} type="button">
              초안 생성
            </button>
            <button className="ghost-button" disabled={isWorking} onClick={() => void onRefresh()} type="button">
              새로고침
            </button>
          </div>
        </section>

        <QueueSection
          title="검토 대기"
          countLabel={`${filteredDrafts.length}건`}
          headerAction={
            <div className="badge-row">
              <label className="field">
                <span>소스</span>
                <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
                  <option value="all">모든 소스</option>
                  {providerOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>상태</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">모든 상태</option>
                  <option value="draft">초안</option>
                  <option value="approved">승인</option>
                  <option value="scheduled">예약</option>
                  <option value="published">게시</option>
                  <option value="failed">실패</option>
                  <option value="skipped">제외</option>
                  <option value="disabled">비활성</option>
                </select>
              </label>
            </div>
          }
          items={filteredDrafts}
          selectedId={selectedDraftId}
          onSelect={onSelectDraft}
          emptyTitle="검토 대기 중인 초안이 없습니다"
          emptyDescription="지금 초안 생성을 실행하면 여기에서 검토 대기 목록을 확인할 수 있습니다."
          renderMeta={(item: PublisherDraft) => (
            <>
              <div className="card-topline">
                <span className="chip chip--soft">{item.sourceLabel || item.provider}</span>
                <small>{formatDate(item.updatedAt)}</small>
              </div>
              <strong>{extractDraftHeadline(item)}</strong>
              <p>{compactText(extractDraftLead(item), 140)}</p>
              <div className="badge-row">
                <span className="chip chip--soft">{draftStatusLabel(item.status)}</span>
                <span className="chip chip--soft">{sourceTypeLabel(item.sourceType)}</span>
                <span className="chip chip--soft">{item.category}</span>
              </div>
            </>
          )}
        />

        <QueueSection
          title="주제 묶음"
          countLabel={`${dossiers.length}개`}
          items={dossiers}
          selectedId={selectedDossierId}
          onSelect={onSelectDossier}
          emptyTitle="아직 주제 묶음이 없습니다"
          emptyDescription="같은 주제로 초안과 게시물이 쌓이면 여기에서 묶음 단위로 추적할 수 있습니다."
          renderMeta={(item: PublisherDossier) => (
            <>
              <div className="card-topline">
                <span className="chip chip--soft">{dossierStatusLabel(item.status)}</span>
                <small>{item.lastUpdatedAt ? formatDate(item.lastUpdatedAt) : '방금'}</small>
              </div>
              <strong>{item.title}</strong>
              <p>{compactText(item.summary, 150)}</p>
              <div className="badge-row">
                <span className="chip chip--soft">소스 {item.sourceCount}</span>
                <span className="chip chip--soft">초안 {item.draftCount}</span>
                <span className="chip chip--soft">게시 {item.publishedCount}</span>
              </div>
            </>
          )}
        />

        <QueueSection
          title="발행 기록"
          countLabel={`${filteredPublishedItems.length}건`}
          items={filteredPublishedItems}
          selectedId={selectedPublishedId}
          onSelect={onSelectPublished}
          emptyTitle="발행 기록이 없습니다"
          emptyDescription="승인된 초안이 게시되면 여기에서 결과를 확인할 수 있습니다."
          renderMeta={(item: PublishedPost) => (
            <>
              <div className="card-topline">
                <span className="chip chip--soft">{item.sourceLabel || item.provider}</span>
                <small>{formatDate(item.publishedAt)}</small>
              </div>
              <strong>{item.title}</strong>
              <p>{compactText(item.excerpt, 150)}</p>
              <div className="badge-row">
                <span className="chip chip--soft">{summaryTypeLabel(item.summaryType)}</span>
                <span className="chip chip--soft">{sourceTypeLabel(item.sourceType)}</span>
              </div>
            </>
          )}
        />

        <SettingsDisclosure
          draft={publisherSettingsDraft}
          setDraft={setPublisherSettingsDraft}
          onSave={onSaveSettings}
          isWorking={isWorking}
        />
        <SourceStatusDisclosure publisherState={publisherState} />
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
              description="왼쪽에서 검토 대기, 주제 묶음, 발행 기록 중 하나를 선택하면 상세 내용을 볼 수 있습니다."
              title="상세 항목을 선택해 주세요"
            />
          </section>
        )}
      </div>
    </div>
  )
}
