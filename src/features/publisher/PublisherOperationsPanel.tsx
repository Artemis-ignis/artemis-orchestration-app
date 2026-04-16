import type { Dispatch, SetStateAction } from 'react'
import { EmptyState } from '../../crewPageShared'
import { formatDate, formatRelative } from '../../crewPageHelpers'
import { Icon } from '../../icons'
import type {
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
  draftStatusLabel,
  publisherModeLabel,
  sourceTypeLabel,
  summaryTypeLabel,
} from './publisherUi'

type ProviderOption = {
  value: string
  label: string
}

function compactPublisherText(value: string, maxLength = 220) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return ''
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}…` : normalized
}

type PublisherOperationsPanelProps = {
  actionMessage: string | null
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
  onCreateDraft: () => Promise<void>
  onRefresh: () => Promise<void>
  onSaveSettings: () => Promise<void>
  onApproveDraft: (draftId: string) => Promise<void>
  onPublishDraft: (draftId: string) => Promise<void>
  onRejectDraft: (draftId: string) => Promise<void>
}

export function PublisherOperationsPanel({
  actionMessage,
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
  onCreateDraft,
  onRefresh,
  onSaveSettings,
  onApproveDraft,
  onPublishDraft,
  onRejectDraft,
}: PublisherOperationsPanelProps) {
  return (
    <div className="publisher-shell">
      <div className="publisher-side">
        <section className="panel-card">
          <div className="panel-card__header">
            <div>
              <h2>Artemis Wire 운영</h2>
              <p className="settings-card__lead">Artemis Wire 내부 게시를 기본 출력으로 사용하고, X는 선택적 크로스포스트로만 동작합니다.</p>
            </div>
            <span className={`chip ${publisherState.inProgress ? 'is-active' : 'chip--soft'}`}>
              {publisherModeLabel(publisherSettings.mode)}
            </span>
          </div>
          <div className="stack-grid stack-grid--compact">
            <div className="summary-row">
              <span>Artemis Wire 게시기</span>
              <strong>{internalPublisherStatus.ready ? '준비됨' : internalPublisherStatus.enabled ? '제한됨' : '비활성'}</strong>
            </div>
            <div className="summary-row">
              <span>X cross-post</span>
              <strong>{xCrossPostStatus ? (xCrossPostStatus.ready ? '준비됨' : xCrossPostStatus.enabled ? '비활성 대기' : '사용 안 함') : '사용 안 함'}</strong>
            </div>
            <div className="summary-row">
              <span>최근 게시</span>
              <strong>{publisherState.lastPublishedAt ? formatDate(publisherState.lastPublishedAt) : '없음'}</strong>
            </div>
            <div className="summary-row">
              <span>다음 수집</span>
              <strong>{publisherState.nextIngestAt ? formatDate(publisherState.nextIngestAt) : '중지됨'}</strong>
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
              현재 카테고리로 Wire 초안 채우기
            </button>
            <button className="ghost-button" disabled={isWorking} onClick={() => void onRefresh()} type="button">
              상태 새로고침
            </button>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h2>와이어 수집 및 발행 정책</h2>
            <span className="chip chip--soft">{publisherSettingsDraft.generationModel}</span>
          </div>
          <div className="auto-post-settings-grid">
            <label className="field">
              <span>모드</span>
              <select value={publisherSettingsDraft.mode} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, mode: event.target.value as PublisherSettings['mode'] }))}>
                <option value="dry-run">dry-run</option>
                <option value="approval">approval</option>
                <option value="auto">auto</option>
              </select>
            </label>
            <label className="field">
              <span>생성 모델</span>
              <input value={publisherSettingsDraft.generationModel} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, generationModel: event.target.value }))} />
            </label>
            <label className="field">
              <span>기본 큐 생성 수</span>
              <input type="number" min={1} max={20} value={publisherSettingsDraft.defaultQueueLimit} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, defaultQueueLimit: Number(event.target.value || current.defaultQueueLimit) }))} />
            </label>
            <label className="field">
              <span>시간당 최대</span>
              <input type="number" min={1} max={24} value={publisherSettingsDraft.maxPerHour} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, maxPerHour: Number(event.target.value || current.maxPerHour) }))} />
            </label>
            <label className="field">
              <span>최소 간격(분)</span>
              <input type="number" min={1} value={publisherSettingsDraft.minIntervalMinutes} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, minIntervalMinutes: Number(event.target.value || current.minIntervalMinutes) }))} />
            </label>
            <label className="field">
              <span>일일 최대</span>
              <input type="number" min={1} value={publisherSettingsDraft.maxPerDay} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, maxPerDay: Number(event.target.value || current.maxPerDay) }))} />
            </label>
            <label className="field">
              <span>최소 novelty</span>
              <input type="number" step="0.01" min={0} max={1} value={publisherSettingsDraft.minNoveltyScore} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, minNoveltyScore: Number(event.target.value || current.minNoveltyScore) }))} />
            </label>
            <label className="field">
              <span>Artemis Wire 게시</span>
              <select value={publisherSettingsDraft.publishInternalEnabled ? 'enabled' : 'disabled'} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, publishInternalEnabled: event.target.value === 'enabled' }))}>
                <option value="enabled">활성</option>
                <option value="disabled">비활성</option>
              </select>
            </label>
            <label className="field">
              <span>X cross-post</span>
              <select value={publisherSettingsDraft.publishXEnabled ? 'enabled' : 'disabled'} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, publishXEnabled: event.target.value === 'enabled' }))}>
                <option value="disabled">비활성</option>
                <option value="enabled">활성</option>
              </select>
            </label>
            <label className="field">
              <span>arXiv</span>
              <select value={publisherSettingsDraft.ingestArxivEnabled ? 'enabled' : 'disabled'} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, ingestArxivEnabled: event.target.value === 'enabled' }))}>
                <option value="enabled">활성</option>
                <option value="disabled">비활성</option>
              </select>
            </label>
            <label className="field">
              <span>Crossref</span>
              <select value={publisherSettingsDraft.ingestCrossrefEnabled ? 'enabled' : 'disabled'} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, ingestCrossrefEnabled: event.target.value === 'enabled' }))}>
                <option value="enabled">활성</option>
                <option value="disabled">비활성</option>
              </select>
            </label>
            <label className="field">
              <span>Semantic Scholar</span>
              <select value={publisherSettingsDraft.ingestSemanticScholarEnabled ? 'enabled' : 'disabled'} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, ingestSemanticScholarEnabled: event.target.value === 'enabled' }))}>
                <option value="enabled">활성</option>
                <option value="disabled">비활성</option>
              </select>
            </label>
            <label className="field">
              <span>News API</span>
              <select value={publisherSettingsDraft.ingestNewsApiEnabled ? 'enabled' : 'disabled'} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, ingestNewsApiEnabled: event.target.value === 'enabled' }))}>
                <option value="disabled">비활성</option>
                <option value="enabled">활성</option>
              </select>
            </label>
            <label className="field">
              <span>RSS / Atom</span>
              <select value={publisherSettingsDraft.ingestRssEnabled ? 'enabled' : 'disabled'} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, ingestRssEnabled: event.target.value === 'enabled' }))}>
                <option value="disabled">비활성</option>
                <option value="enabled">활성</option>
              </select>
            </label>
            <label className="field">
              <span>Legacy signals</span>
              <select value={publisherSettingsDraft.ingestLegacySignalsEnabled ? 'enabled' : 'disabled'} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, ingestLegacySignalsEnabled: event.target.value === 'enabled' }))}>
                <option value="enabled">활성</option>
                <option value="disabled">비활성</option>
              </select>
            </label>
            <label className="field field--full">
              <span>수집 질의</span>
              <input value={publisherSettingsDraft.ingestQuery} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, ingestQuery: event.target.value }))} />
            </label>
            <label className="field field--full">
              <span>RSS / Atom 피드</span>
              <textarea rows={3} value={publisherSettingsDraft.rssFeeds.join('\n')} onChange={(event) => setPublisherSettingsDraft((current) => ({ ...current, rssFeeds: event.target.value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean) }))} />
            </label>
          </div>
          <div className="badge-row">
            <button className="primary-button" disabled={isWorking} onClick={() => void onSaveSettings()} type="button">
              설정 저장
            </button>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h2>활성 소스 현황</h2>
            <span className="chip chip--soft">{publisherState.providerStats.length}개</span>
          </div>
          {publisherState.providerStats.length > 0 ? (
            <div className="run-card__logs">
              {publisherState.providerStats.map((stat) => (
                <div key={stat.provider} className={`run-log run-log--${stat.lastError ? 'error' : stat.enabled ? 'success' : 'info'}`}>
                  <span>{stat.label}</span>
                  <p>
                    수집 {stat.lastFetchedCount} / draft {stat.lastDraftCount} / skip {stat.lastSkippedCount}
                    {stat.lastFetchedAt ? ` · 최근 ${formatRelative(stat.lastFetchedAt)}` : ''}
                    {stat.lastError ? ` · 오류: ${stat.lastError}` : ''}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              description="한 번 이상 수집이 실행되면 소스별 수집 수와 오류 상태가 여기에 기록됩니다."
              title="소스 기록이 없습니다"
            />
          )}
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h2>와이어 승인 큐</h2>
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
                  className={`auto-post-card ${selectedDraftId === item.id ? 'is-active' : ''}`}
                  onClick={() => onSelectDraft(item.id)}
                  type="button"
                >
                  <div className="auto-post-card__body">
                    <div className="card-topline">
                      <span className="chip chip--soft">{item.sourceLabel || item.provider}</span>
                      <small>{formatDate(item.updatedAt)}</small>
                    </div>
                    <strong>{item.sourceTitle}</strong>
                    <p>{compactPublisherText(item.generatedText || item.sourceSummary, 140)}</p>
                    <div className="badge-row">
                      <span className="chip chip--soft">{draftStatusLabel(item.status)}</span>
                      <span className="chip chip--soft">{sourceTypeLabel(item.sourceType)}</span>
                      <span className="chip chip--soft">{item.category}</span>
                      <span className="chip chip--soft">novelty {item.noveltyScore.toFixed(2)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              description="실시간 시그널에서 초안을 만들거나 현재 카테고리로 큐를 채우면 여기에 쌓입니다."
              action="지금 Wire 초안 만들기"
              onAction={() => void onCreateDraft()}
              title="Artemis Wire 큐가 비어 있습니다"
            />
          )}
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Artemis Wire 게시 이력</h2>
            <span className="chip chip--soft">{filteredPublishedItems.length}개</span>
          </div>
          {filteredPublishedItems.length > 0 ? (
            <div className="publisher-queue">
              {filteredPublishedItems.slice(0, 24).map((item) => (
                <button
                  key={item.id}
                  className={`auto-post-card ${selectedPublishedId === item.id ? 'is-active' : ''}`}
                  onClick={() => onSelectPublished(item.id)}
                  type="button"
                >
                  <div className="auto-post-card__body">
                    <div className="card-topline">
                      <span className="chip chip--soft">{item.sourceLabel || item.provider}</span>
                      <small>{formatDate(item.publishedAt)}</small>
                    </div>
                    <strong>{item.title}</strong>
                    <p>{compactPublisherText(item.excerpt, 140)}</p>
                    <div className="badge-row">
                      <span className="chip chip--soft">{item.category || 'Artemis Wire'}</span>
                      <span className="chip chip--soft">{summaryTypeLabel(item.summaryType)}</span>
                      <span className="chip chip--soft">{sourceTypeLabel(item.sourceType)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              description="승인된 초안을 발행하면 내부 웹사이트용 게시 이력이 여기에 남습니다."
              title="Artemis Wire 게시 이력이 없습니다"
            />
          )}
        </section>
      </div>

      <div className="publisher-detail">
        {actionMessage ? (
          <div className="status-banner status-banner--info">
            <Icon name="spark" size={16} />
            <span>{actionMessage}</span>
          </div>
        ) : null}
        {selectedDraft ? (
          <>
            <section className="panel-card">
              <div className="panel-card__header">
                <div>
                  <h2>{selectedDraft.sourceTitle}</h2>
                  <p className="settings-card__lead">{selectedDraft.sourceLabel} / {selectedDraft.category} / novelty {selectedDraft.noveltyScore.toFixed(2)}</p>
                </div>
                <div className="badge-row">
                  <span className="chip chip--soft">{draftStatusLabel(selectedDraft.status)}</span>
                  <span className="chip chip--soft">{summaryTypeLabel(selectedDraft.summaryType)}</span>
                  <span className="chip chip--soft">{sourceTypeLabel(selectedDraft.sourceType)}</span>
                  {selectedDraft.scheduledAt ? <span className="chip chip--soft">예약 {formatDate(selectedDraft.scheduledAt)}</span> : null}
                  {selectedDraft.publishedAt ? <span className="chip chip--soft">게시 {formatDate(selectedDraft.publishedAt)}</span> : null}
                </div>
              </div>
              <div className="badge-row">
                {selectedDraft.status === 'draft' ? (
                  <button className="primary-button" disabled={isWorking} onClick={() => void onApproveDraft(selectedDraft.id)} type="button">
                    승인
                  </button>
                ) : null}
                {selectedDraft.status !== 'published' && selectedDraft.status !== 'skipped' && selectedDraft.status !== 'disabled' ? (
                  <button className="ghost-button" disabled={isWorking} onClick={() => void onPublishDraft(selectedDraft.id)} type="button">
                    지금 게시
                  </button>
                ) : null}
                {selectedDraft.status !== 'published' ? (
                  <button className="ghost-button" disabled={isWorking} onClick={() => void onRejectDraft(selectedDraft.id)} type="button">
                    제외
                  </button>
                ) : null}
                {selectedDraft.sourceUrl ? (
                  <button className="ghost-button" onClick={() => window.open(selectedDraft.sourceUrl, '_blank', 'noopener,noreferrer')} type="button">
                    원문 열기
                  </button>
                ) : null}
              </div>
              <div className="stack-grid stack-grid--compact">
                <div className="summary-row summary-row--soft">
                  <span>게시 대상</span>
                  <strong>{selectedDraft.publishTarget === 'internal' ? 'Artemis Wire' : 'X'}</strong>
                </div>
                <div className="summary-row summary-row--soft">
                  <span>topic hash</span>
                  <strong>{selectedDraft.topicHash.slice(0, 16)}…</strong>
                </div>
                <div className="summary-row summary-row--soft">
                  <span>원문 시각</span>
                  <strong>{selectedDraft.sourcePublishedAt ? formatDate(selectedDraft.sourcePublishedAt) : '없음'}</strong>
                </div>
                {selectedDraft.authors.length > 0 ? (
                  <div className="summary-row summary-row--soft">
                    <span>저자</span>
                    <strong>{selectedDraft.authors.slice(0, 4).join(', ')}</strong>
                  </div>
                ) : null}
                {selectedDraft.doi ? (
                  <div className="summary-row summary-row--soft">
                    <span>DOI</span>
                    <strong>{selectedDraft.doi}</strong>
                  </div>
                ) : null}
                {selectedDraft.arxivId ? (
                  <div className="summary-row summary-row--soft">
                    <span>arXiv</span>
                    <strong>{selectedDraft.arxivId}</strong>
                  </div>
                ) : null}
              </div>
              {selectedDraft.errorReason ? (
                <div className="status-banner status-banner--warning">
                  <Icon name="warning" size={16} />
                  <span>{selectedDraft.errorReason}</span>
                </div>
              ) : null}
            </section>

            <section className="panel-card">
              <div className="panel-card__header">
                <h2>Artemis Wire 초안</h2>
                <span className="chip chip--soft">{selectedDraft.generationModel}</span>
              </div>
              <PublisherArticle
                authors={selectedDraft.authors}
                body={selectedDraft.generatedText}
                category={selectedDraft.category}
                excerpt={compactPublisherText(selectedDraft.sourceSummary, 180)}
                publishedAt={selectedDraft.scheduledAt || selectedDraft.sourcePublishedAt}
                sourceLabel={selectedDraft.sourceLabel}
                sourceUrl={selectedDraft.sourceUrl}
                summaryType={selectedDraft.summaryType}
                tags={selectedDraft.tags}
                title={selectedDraft.sourceTitle}
              />
            </section>

            <section className="panel-card">
              <div className="panel-card__header">
                <h2>Wire 최근 로그</h2>
                <span className="chip chip--soft">{selectedDraftLogs.length}개</span>
              </div>
              <div className="run-card__logs">
                {selectedDraftLogs.map((log) => (
                  <div key={log.id} className={`run-log run-log--${log.level === 'warning' ? 'error' : log.level}`}>
                    <span>{formatDate(log.createdAt)}</span>
                    <p>{log.message}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : selectedPublished ? (
          <>
            <section className="panel-card">
              <div className="panel-card__header">
                <div>
                  <h2>{selectedPublished.title}</h2>
                  <p className="settings-card__lead">
                    {selectedPublished.sourceLabel || selectedPublished.provider} / {selectedPublished.category || 'Artemis Wire'}
                  </p>
                </div>
                <div className="badge-row">
                  <span className="chip chip--soft">게시 완료</span>
                  <span className="chip chip--soft">{summaryTypeLabel(selectedPublished.summaryType)}</span>
                  <span className="chip chip--soft">{sourceTypeLabel(selectedPublished.sourceType)}</span>
                  <span className="chip chip--soft">{formatDate(selectedPublished.publishedAt)}</span>
                </div>
              </div>
              <p className="settings-card__lead">{selectedPublished.excerpt}</p>
              <div className="badge-row">
                {selectedPublished.sourceUrl ? (
                  <button className="ghost-button" onClick={() => window.open(selectedPublished.sourceUrl, '_blank', 'noopener,noreferrer')} type="button">
                    원문 열기
                  </button>
                ) : null}
              </div>
              {selectedPublished.authors.length > 0 ? (
                <div className="summary-row summary-row--soft">
                  <span>저자</span>
                  <strong>{selectedPublished.authors.slice(0, 5).join(', ')}</strong>
                </div>
              ) : null}
              <div className="stack-grid stack-grid--compact">
                <div className="summary-row summary-row--soft">
                  <span>게시 대상</span>
                  <strong>Artemis Wire</strong>
                </div>
                <div className="summary-row summary-row--soft">
                  <span>소스 유형</span>
                  <strong>{sourceTypeLabel(selectedPublished.sourceType)}</strong>
                </div>
                <div className="summary-row summary-row--soft">
                  <span>출처 공급자</span>
                  <strong>{selectedPublished.provider}</strong>
                </div>
                <div className="summary-row summary-row--soft">
                  <span>원문 링크</span>
                  <strong>{selectedPublished.canonicalUrl || selectedPublished.sourceUrl}</strong>
                </div>
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-card__header">
                <h2>Artemis Wire 게시물</h2>
                <span className="chip chip--soft">{selectedPublished.provider}</span>
              </div>
              <PublisherArticle
                authors={selectedPublished.authors}
                body={selectedPublished.body}
                category={selectedPublished.category || 'Artemis Wire'}
                excerpt={selectedPublished.excerpt}
                publishedAt={selectedPublished.publishedAt}
                sourceLabel={selectedPublished.sourceLabel || selectedPublished.provider}
                sourceUrl={selectedPublished.sourceUrl}
                summaryType={selectedPublished.summaryType}
                tags={selectedPublished.tags}
                title={selectedPublished.title}
              />
            </section>
          </>
        ) : (
          <EmptyState
            description="왼쪽에서 Wire 초안이나 게시 이력을 선택하면 생성문, 게시 결과, 실패 이유, 최근 로그를 볼 수 있습니다."
            title="Wire 초안 또는 게시물을 선택해 주세요"
          />
        )}
      </div>
    </div>
  )
}
