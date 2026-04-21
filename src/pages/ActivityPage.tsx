import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { NoticeBanner, PanelCard, SectionHeader, StatCard, StatusPill } from '../components/ui/primitives'
import type { PageId } from '../crewData'
import { formatDate, pageLabel } from '../crewPageHelpers'
import { PageIntro, SearchField } from '../crewPageShared'
import { fetchPublisherState } from '../lib/modelClient'
import { useArtemisApp } from '../state/context'
import type { ActivityType } from '../state/types'
import type {
  PublisherDossier,
  PublisherDossierStatus,
  PublisherLog,
  PublisherMetrics,
  PublisherRuntimeStatus,
  PublishedPost,
} from '../types/publisher'

function publisherTargetLabel(target: 'internal' | 'x') {
  return target === 'internal' ? '아르테미스 와이어' : 'X'
}

function publisherStatusTone(target: PublisherRuntimeStatus) {
  if (target.ready) {
    return 'success'
  }

  if (!target.enabled) {
    return 'muted'
  }

  return target.configured ? 'warning' : 'danger'
}

function publisherStatusLabel(target: PublisherRuntimeStatus) {
  if (target.ready) {
    return '준비됨'
  }

  if (!target.enabled) {
    return '비활성'
  }

  return target.configured ? '점검 필요' : '구성 필요'
}

function dossierStatusTone(status: PublisherDossierStatus) {
  if (status === 'published') {
    return 'success'
  }

  if (status === 'tracking') {
    return 'accent'
  }

  return 'warning'
}

function dossierStatusLabel(status: PublisherDossierStatus) {
  if (status === 'published') {
    return '게시 중'
  }

  if (status === 'tracking') {
    return '추적 중'
  }

  return '이슈 형성'
}

function logTone(level: PublisherLog['level']) {
  if (level === 'success') {
    return 'success'
  }

  if (level === 'warning') {
    return 'warning'
  }

  if (level === 'error') {
    return 'danger'
  }

  return 'muted'
}

function summaryTypeLabel(summaryType: PublishedPost['summaryType']) {
  if (summaryType === 'breaking') {
    return '속보 요약'
  }

  if (summaryType === 'brief-points') {
    return '포인트 브리프'
  }

  return '리포트 인트로'
}

function activityTypeLabel(type: ActivityType) {
  switch (type) {
    case 'chat':
      return '대화'
    case 'file':
      return '파일'
    case 'tool':
      return '도구'
    case 'insight':
      return '인사이트'
    case 'settings':
      return '설정'
    case 'signal':
      return '시그널'
    case 'agent':
      return '에이전트'
    default:
      return '기록'
  }
}

export function ActivityPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [publisherMetrics, setPublisherMetrics] = useState<PublisherMetrics | null>(null)
  const [publisherLogs, setPublisherLogs] = useState<PublisherLog[]>([])
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>([])
  const [recentDossiers, setRecentDossiers] = useState<PublisherDossier[]>([])
  const [publisherError, setPublisherError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    const run = async () => {
      try {
        const response = await fetchPublisherState(state.settings.bridgeUrl)
        if (ignore) {
          return
        }
        setPublisherMetrics(response.metrics)
        setPublisherLogs(response.logs.slice(0, 8))
        setPublishedPosts(response.published.slice(0, 4))
        setRecentDossiers(response.dossiers.slice(0, 3))
        setPublisherError(null)
      } catch (error) {
        if (ignore) {
          return
        }
        setPublisherError(error instanceof Error ? error.message : '아르테미스 와이어 상태를 불러오지 못했습니다.')
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [state.settings.bridgeUrl])

  const items = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    if (!keyword) {
      return state.activity.items
    }

    return state.activity.items.filter((item) =>
      `${item.title} ${item.detail} ${item.page}`.toLowerCase().includes(keyword),
    )
  }, [deferredQuery, state.activity.items])

  const totalActivityCount = state.activity.items.length
  const latestActivity = items[0] ?? state.activity.items[0] ?? null
  const latestPublishedPost = publishedPosts[0] ?? null
  const visibleFailures = publisherMetrics?.recentFailures.slice(0, 2) ?? []
  const latestFailure = visibleFailures[0] ?? null
  const visibleProviderCounts = publisherMetrics?.providerCounts24h.slice(0, 4) ?? []
  const queuedCount = publisherMetrics ? publisherMetrics.draftCount + publisherMetrics.scheduledCount : null
  const hasQuery = query.trim().length > 0
  const activityFilterLabel = hasQuery ? `검색 결과 ${items.length}건` : `전체 기록 ${totalActivityCount}건`
  const publisherHealthTone = publisherError
    ? 'danger'
    : publisherMetrics
      ? publisherMetrics.failedCount > 0
        ? 'warning'
        : 'success'
      : 'muted'
  const publisherHealthLabel = publisherError
    ? '와이어 연결 오류'
    : publisherMetrics
      ? publisherMetrics.failedCount > 0
        ? `운영 주의 ${publisherMetrics.failedCount}건`
        : '와이어 정상'
      : '와이어 동기화 중'
  const summaryCards = [
    {
      label: '최근 24시간 게시',
      value: publisherMetrics ? `${publisherMetrics.publishedCount24h}건` : publisherError ? '연결 오류' : '동기화 중',
      meta: publisherMetrics
        ? latestPublishedPost
          ? `최근 1시간 ${publisherMetrics.publishedCount1h}건 · ${formatDate(latestPublishedPost.publishedAt)} 마지막 게시`
          : `최근 1시간 ${publisherMetrics.publishedCount1h}건 · 아직 게시 기록이 없습니다.`
        : publisherError ?? '아르테미스 와이어 상태를 확인하는 중입니다.',
      tone: publisherMetrics ? 'accent' : publisherError ? 'danger' : 'muted',
    },
    {
      label: '대기 작업',
      value: queuedCount !== null ? `${queuedCount}건` : '집계 대기',
      meta:
        publisherMetrics !== null
          ? `초안 ${publisherMetrics.draftCount}건 · 예약 ${publisherMetrics.scheduledCount}건`
          : '큐 상태를 불러오는 중입니다.',
      tone: queuedCount && queuedCount > 0 ? 'info' : 'muted',
    },
    {
      label: '운영 이슈',
      value:
        publisherMetrics !== null
          ? `${publisherMetrics.failedCount}건`
          : publisherError
            ? '연결 오류'
            : '문제 없음',
      meta:
        latestFailure !== null
          ? `${formatDate(latestFailure.updatedAt)} · ${latestFailure.sourceTitle}`
          : publisherMetrics !== null
            ? '최근 실패 없이 운영 중입니다.'
            : publisherError ?? '최근 실패 집계를 기다리는 중입니다.',
      tone:
        publisherMetrics !== null
          ? publisherMetrics.failedCount > 0
            ? 'danger'
            : 'success'
          : publisherError
            ? 'danger'
            : 'muted',
    },
    {
      label: '활동 기록',
      value: `${totalActivityCount}건`,
      meta: latestActivity
        ? `${pageLabel(latestActivity.page)} · ${formatDate(latestActivity.createdAt)}`
        : '아직 쌓인 활동 기록이 없습니다.',
      tone: 'info',
    },
  ] as const

  return (
    <section className="page activity-page">
      <PageIntro
        description="채팅, 파일, 오케스트레이션, 그리고 아르테미스 와이어 운영에서 실제로 일어난 실행 기록만 모아 봅니다."
        icon="insights"
        title="활동"
      />

      <div className="page-toolbar activity-toolbar signals-toolbar--primary">
        <SearchField onChange={setQuery} placeholder="활동 검색..." value={query} />
        <div className="activity-toolbar__meta">
          <StatusPill tone="muted">{activityFilterLabel}</StatusPill>
          <StatusPill tone={publisherHealthTone}>{publisherHealthLabel}</StatusPill>
          {publisherMetrics ? <StatusPill tone="info">추적 이슈 {publisherMetrics.dossierCount}개</StatusPill> : null}
        </div>
      </div>

      <section className="activity-summary-strip" aria-label="활동 요약">
        {summaryCards.map((card) => (
          <StatCard key={card.label} label={card.label} meta={card.meta} tone={card.tone} value={card.value} />
        ))}
      </section>

      <PanelCard
        actions={
          <button className="ghost-button" onClick={() => onNavigate('signals')} type="button">
            시그널에서 이어 보기
          </button>
        }
        className="activity-cluster-panel signals-panel"
        description="최근 내부 게시물과 현재 추적 중인 이슈 묶음을 같은 화면에서 비교합니다."
        title="최근 게시 및 이슈 묶음"
        tone="accent"
      >
        {publisherError ? (
          <NoticeBanner tone="error" title="와이어 연결 상태를 확인하세요">
            {publisherError}
          </NoticeBanner>
        ) : null}

        <div className="activity-cluster-grid">
          <section className="activity-cluster-lane">
            <SectionHeader
              description="최근 내부 게시를 빠르게 훑고 상세 검토는 시그널에서 이어갑니다."
              title="최근 게시"
            />
            {publishedPosts.length > 0 ? (
              <div className="activity-card-list">
                {publishedPosts.map((post) => (
                  <article key={post.id} className="activity-story-card">
                    <div className="activity-card-topline">
                      <StatusPill tone="info">{post.sourceLabel || post.provider}</StatusPill>
                      <small>{formatDate(post.publishedAt)}</small>
                    </div>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt}</p>
                    <div className="activity-card-footer">
                      {post.category ? <StatusPill tone="muted">{post.category}</StatusPill> : null}
                      <StatusPill tone="muted">{summaryTypeLabel(post.summaryType)}</StatusPill>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="activity-inline-empty">최근 내부 게시물이 아직 없습니다.</div>
            )}
          </section>

          <section className="activity-cluster-lane">
            <SectionHeader
              description="아르테미스 와이어가 지금 추적 중인 주제 묶음을 우선순위 중심으로 봅니다."
              title="라이브 이슈 묶음"
            />
            {recentDossiers.length > 0 ? (
              <div className="activity-card-list">
                {recentDossiers.map((dossier) => (
                  <article key={dossier.id} className="activity-dossier-card">
                    <div className="activity-card-topline">
                      <StatusPill tone={dossierStatusTone(dossier.status)}>{dossierStatusLabel(dossier.status)}</StatusPill>
                      <small>{formatDate(dossier.lastUpdatedAt || dossier.lastPublishedAt || '')}</small>
                    </div>
                    <h3>{dossier.title}</h3>
                    <p>{dossier.summary || dossier.lead}</p>
                    {dossier.keyPoints.length > 0 ? (
                      <ul className="activity-dossier-points">
                        {dossier.keyPoints.slice(0, 2).map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="activity-card-footer activity-card-footer--text">
                      <span>소스 {dossier.sourceCount}</span>
                      <span>게시 {dossier.publishedCount}</span>
                      <span>{dossier.providerLabels.slice(0, 2).join(' · ') || dossier.sourceType}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="activity-inline-empty">현재 추적 중인 이슈 묶음이 없습니다.</div>
            )}
          </section>
        </div>

        <div className="activity-ops-meta-grid">
          <section className="activity-meta-panel">
            <SectionHeader description="현재 게시 대상별 준비 상태" title="게시 대상 상태" />
            {publisherMetrics ? (
              <div className="activity-status-list">
                {publisherMetrics.publishers.map((target) => (
                  <article key={target.target} className="activity-status-item">
                    <div>
                      <strong>{publisherTargetLabel(target.target)}</strong>
                      <p>{target.detail}</p>
                    </div>
                    <StatusPill tone={publisherStatusTone(target)}>{publisherStatusLabel(target)}</StatusPill>
                  </article>
                ))}
              </div>
            ) : (
              <div className="activity-inline-empty">게시 대상 상태를 불러오는 중입니다.</div>
            )}
          </section>

          <section className="activity-meta-panel">
            <SectionHeader description="최근 24시간 공급원별 수집과 게시량" title="공급원 처리량" />
            {visibleProviderCounts.length > 0 ? (
              <div className="activity-status-list">
                {visibleProviderCounts.map((provider) => (
                  <article key={provider.provider} className="activity-status-item">
                    <div>
                      <strong>{provider.label || provider.provider}</strong>
                      <p>
                        수집 {provider.fetchedCount24h} · 게시 {provider.publishedCount24h}
                        {provider.lastError ? ` · ${provider.lastError}` : ''}
                      </p>
                    </div>
                    <StatusPill tone={provider.lastError ? 'warning' : provider.enabled === false ? 'muted' : 'info'}>
                      {provider.enabled === false ? '중지됨' : '활성'}
                    </StatusPill>
                  </article>
                ))}
              </div>
            ) : (
              <div className="activity-inline-empty">최근 집계된 공급원 처리량이 없습니다.</div>
            )}
          </section>
        </div>
      </PanelCard>

      <div className="activity-journal-grid">
        <PanelCard
          actions={<StatusPill tone="muted">운영 로그 {publisherLogs.length}건</StatusPill>}
          className="activity-log-panel signals-panel"
          description="와이어 운영 로그와 최근 실패 신호를 시간순으로 확인합니다."
          title="작업 로그"
          tone="muted"
        >
          {visibleFailures.length > 0 ? (
            <div className="activity-failure-list">
              {visibleFailures.map((failure) => (
                <article key={failure.id} className="activity-failure-card">
                  <div className="activity-card-topline">
                    <StatusPill tone="danger">실패</StatusPill>
                    <small>{formatDate(failure.updatedAt)}</small>
                  </div>
                  <h3>{failure.sourceTitle}</h3>
                  <p>{failure.errorReason || '실패 원인이 기록되지 않았습니다.'}</p>
                </article>
              ))}
            </div>
          ) : null}

          {publisherLogs.length > 0 ? (
            <div className="activity-sequence">
              {publisherLogs.map((log) => {
                const tone = logTone(log.level)

                return (
                  <article key={log.id} className={`activity-sequence__item activity-sequence__item--${tone}`}>
                    <div className="activity-sequence__rail" aria-hidden="true">
                      <span className="activity-sequence__dot" />
                    </div>
                    <div className="activity-sequence__body">
                      <div className="activity-sequence__meta">
                        <StatusPill tone={tone}>{log.action || '운영 로그'}</StatusPill>
                        <small>{formatDate(log.createdAt)}</small>
                      </div>
                      <p>{log.message}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="activity-inline-empty">아직 표시할 운영 로그가 없습니다.</div>
          )}
        </PanelCard>

        <PanelCard
          actions={<StatusPill tone="muted">{activityFilterLabel}</StatusPill>}
          className="activity-history-panel signals-panel"
          description="채팅, 파일, 오케스트레이션 등 실제 실행 기록을 시간순으로 정리합니다."
          title="활동 기록"
        >
          {items.length > 0 ? (
            <div className="activity-sequence">
              {items.map((item) => (
                <article key={item.id} className="activity-sequence__item activity-sequence__item--info">
                  <div className="activity-sequence__rail" aria-hidden="true">
                    <span className="activity-sequence__dot" />
                  </div>
                  <div className="activity-sequence__body">
                    <div className="activity-sequence__meta">
                      <div className="activity-sequence__metaGroup">
                        <StatusPill tone="info">{pageLabel(item.page)}</StatusPill>
                        <StatusPill tone="muted">{activityTypeLabel(item.type)}</StatusPill>
                      </div>
                      <small>{formatDate(item.createdAt)}</small>
                    </div>
                    <strong>{item.detail}</strong>
                    <p>{item.title}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="activity-inline-empty">
              채팅, 파일, 오케스트레이션을 실행하면 실제 활동 기록이 여기에 쌓입니다.
            </div>
          )}
        </PanelCard>
      </div>
    </section>
  )
}

export default ActivityPage
