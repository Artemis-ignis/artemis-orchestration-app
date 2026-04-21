import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { NoticeBanner, PageHeader, PanelCard, StatCard, StatusPill } from '../components/ui/primitives'
import type { PageId } from '../crewData'
import { clipUiText, formatDate, pageLabel, providerLabel, routingFailureLabel } from '../crewPageHelpers'
import { EmptyState, SearchField } from '../crewPageShared'
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

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'info'

type ActivityDigestItem = {
  id: string
  createdAt: string
  tone: Tone
  lane: string
  title: string
  summary: string
  meta: string
}

function clipText(value: string | null | undefined, maxLength = 132) {
  return clipUiText(value, maxLength) || '내용이 없습니다.'
}

function friendlyErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return routingFailureLabel(undefined, fallback, error.message)
  }

  return fallback
}

function activityTypeLabel(type: ActivityType) {
  switch (type) {
    case 'chat':
      return '채팅'
    case 'file':
      return '파일'
    case 'tool':
      return '도구'
    case 'insight':
      return '인사이트'
    case 'settings':
      return '설정'
    case 'signal':
      return '신호'
    case 'agent':
      return '에이전트'
    default:
      return '기록'
  }
}

function dossierTone(status: PublisherDossierStatus): Tone {
  switch (status) {
    case 'published':
      return 'success'
    case 'tracking':
      return 'accent'
    default:
      return 'warning'
  }
}

function dossierLabel(status: PublisherDossierStatus) {
  switch (status) {
    case 'published':
      return '발행 완료'
    case 'tracking':
      return '추적 중'
    default:
      return '진행 중'
  }
}

function logTone(level: PublisherLog['level']): Tone {
  switch (level) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'muted'
  }
}

function summaryTypeLabel(summaryType: PublishedPost['summaryType']) {
  switch (summaryType) {
    case 'breaking':
      return '속보형'
    case 'brief-points':
      return '핵심 정리'
    default:
      return '리포트형'
  }
}

function publisherRuntimeLabel(targets: PublisherRuntimeStatus[]) {
  const internal = targets.find((target) => target.target === 'internal')
  const x = targets.find((target) => target.target === 'x')

  if (internal?.ready) {
    return '내부 발행 정상'
  }

  if (internal && !internal.enabled) {
    return '내부 발행 비활성'
  }

  if (x?.ready) {
    return '외부 연동 정상'
  }

  return '상태 확인 중'
}

function publisherRuntimeTone(targets: PublisherRuntimeStatus[]): Tone {
  const internal = targets.find((target) => target.target === 'internal')

  if (internal?.ready) {
    return 'success'
  }

  if (internal && !internal.enabled) {
    return 'muted'
  }

  if (targets.some((target) => target.configured && !target.ready)) {
    return 'warning'
  }

  return 'info'
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
        setPublisherLogs(response.logs.slice(0, 6))
        setPublishedPosts(response.published.slice(0, 4))
        setRecentDossiers(response.dossiers.slice(0, 4))
        setPublisherError(null)
      } catch (error) {
        if (!ignore) {
          setPublisherError(friendlyErrorMessage(error, '활동 상태를 불러오지 못했습니다.'))
        }
      }
    }

    void run()
    return () => {
      ignore = true
    }
  }, [state.settings.bridgeUrl])

  const keyword = deferredQuery.trim().toLowerCase()

  const digestItems = useMemo(() => {
    const entries: ActivityDigestItem[] = []

    publisherMetrics?.recentFailures.slice(0, 3).forEach((failure) => {
      entries.push({
        id: `failure-${failure.id}`,
        createdAt: failure.updatedAt,
        tone: 'danger',
        lane: '오류',
        title: failure.sourceTitle,
        summary: clipText(failure.errorReason, 110),
        meta: '최근 실패',
      })
    })

    publishedPosts.forEach((post) => {
      entries.push({
        id: `published-${post.id}`,
        createdAt: post.publishedAt,
        tone: 'success',
        lane: '발행',
        title: post.title,
        summary: clipText(post.excerpt || post.body, 118),
        meta: `${post.sourceLabel || providerLabel(post.provider)} · ${summaryTypeLabel(post.summaryType)}`,
      })
    })

    publisherLogs.forEach((log) => {
      entries.push({
        id: `log-${log.id}`,
        createdAt: log.createdAt,
        tone: logTone(log.level),
        lane: '로그',
        title: log.action || '운영 로그',
        summary: clipText(log.message, 110),
        meta: log.draftId ? `초안 ${log.draftId}` : '시스템 이벤트',
      })
    })

    state.activity.items.forEach((item) => {
      entries.push({
        id: `activity-${item.id}`,
        createdAt: item.createdAt,
        tone: 'info',
        lane: activityTypeLabel(item.type),
        title: item.title,
        summary: clipText(item.detail, 110),
        meta: pageLabel(item.page),
      })
    })

    const ordered = entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    if (!keyword) {
      return ordered
    }

    return ordered.filter((item) =>
      [item.lane, item.title, item.summary, item.meta].join(' ').toLowerCase().includes(keyword),
    )
  }, [keyword, publishedPosts, publisherLogs, publisherMetrics?.recentFailures, state.activity.items])

  const dossiers = useMemo(() => {
    const ordered = [...recentDossiers].sort((left, right) => {
      const leftTime = left.lastUpdatedAt || left.lastPublishedAt || ''
      const rightTime = right.lastUpdatedAt || right.lastPublishedAt || ''
      return rightTime.localeCompare(leftTime)
    })

    if (!keyword) {
      return ordered
    }

    return ordered.filter((item) =>
      [item.title, item.summary, item.lead, item.providerLabels.join(' '), item.keyPoints.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [keyword, recentDossiers])

  const queuedCount = publisherMetrics ? publisherMetrics.draftCount + publisherMetrics.scheduledCount : 0
  const runtimeTone = publisherError
    ? 'danger'
    : publisherMetrics
      ? publisherRuntimeTone(publisherMetrics.publishers)
      : 'muted'
  const runtimeLabel = publisherError
    ? '발행 연결 오류'
    : publisherMetrics
      ? publisherRuntimeLabel(publisherMetrics.publishers)
      : '상태 확인 중'

  const summaryCards = [
    {
      label: '진행 중 작업',
      value: publisherMetrics ? `${queuedCount}건` : '확인 중',
      meta: publisherMetrics ? `초안 ${publisherMetrics.draftCount}건 · 예약 ${publisherMetrics.scheduledCount}건` : '대기열을 불러오는 중입니다.',
      tone: queuedCount > 0 ? 'accent' : 'muted',
    },
    {
      label: '최근 발행',
      value: publisherMetrics ? `${publisherMetrics.publishedCount24h}건` : publisherError ? '연결 오류' : '확인 중',
      meta:
        publishedPosts[0]?.title ??
        (publisherError ? friendlyErrorMessage(publisherError, '최근 발행 기록을 불러오는 중입니다.') : '최근 발행 기록이 아직 없습니다.'),
      tone: publisherMetrics ? 'success' : publisherError ? 'danger' : 'muted',
    },
    {
      label: '주의 필요',
      value: publisherMetrics ? `${publisherMetrics.failedCount}건` : publisherError ? '연결 오류' : '확인 중',
      meta:
        publisherMetrics?.recentFailures[0]?.sourceTitle ??
        (publisherError ? friendlyErrorMessage(publisherError, '최근 오류를 확인하는 중입니다.') : '최근 오류가 없습니다.'),
      tone: publisherMetrics ? (publisherMetrics.failedCount > 0 ? 'danger' : 'muted') : 'danger',
    },
    {
      label: '추적 묶음',
      value: publisherMetrics ? `${publisherMetrics.dossierCount}개` : '확인 중',
      meta: dossiers[0]?.title ?? '현재 추적 중인 이슈 묶음을 불러오는 중입니다.',
      tone: 'info',
    },
  ] as const

  return (
    <section className="page activity-page">
      <PageHeader
        icon="insights"
        title="활동"
        description="지금 확인할 수치, 최근 실행, 진행 중 이슈만 한 화면에 모았습니다."
        actions={
          <div className="activity-header__actions">
            <StatusPill tone="muted">표시 {digestItems.length}</StatusPill>
            <StatusPill tone={runtimeTone}>{runtimeLabel}</StatusPill>
            <button className="ghost-button" onClick={() => onNavigate('signals')} type="button">
              시그널 보기
            </button>
          </div>
        }
      />

      <div className="page-toolbar activity-toolbar">
        <SearchField onChange={setQuery} placeholder="실행, 오류, 발행 기록 검색" value={query} />
      </div>

      {publisherError ? (
        <NoticeBanner tone="error" title="발행 상태를 불러오는 중 문제가 발생했습니다.">
          {friendlyErrorMessage(publisherError, '활동 상태를 불러오지 못했습니다.')}
        </NoticeBanner>
      ) : null}

      <section className="activity-summary-strip" aria-label="활동 핵심 수치">
        {summaryCards.map((card) => (
          <StatCard key={card.label} label={card.label} meta={card.meta} tone={card.tone} value={card.value} />
        ))}
      </section>

      <div className="activity-layout">
        <PanelCard
          className="activity-feed-panel"
          title="최근 실행 흐름"
          description="무슨 일이 있었는지 시간순으로 바로 읽히게 정리했습니다."
          tone="accent"
        >
          {digestItems.length > 0 ? (
            <div className="activity-feed">
              {digestItems.map((item) => (
                <article key={item.id} className={`activity-feed__item activity-feed__item--${item.tone}`}>
                  <div className="activity-feed__rail" aria-hidden="true">
                    <span className="activity-feed__dot" />
                  </div>
                  <div className="activity-feed__body">
                    <div className="activity-feed__topline">
                      <div className="activity-feed__meta">
                        <StatusPill tone={item.tone}>{item.lane}</StatusPill>
                        <StatusPill tone="muted">{item.meta}</StatusPill>
                      </div>
                      <small>{formatDate(item.createdAt)}</small>
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.summary}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="최근 실행 흐름이 없습니다"
              description="조건을 바꾸거나 작업이 다시 시작되면 여기에 최근 흐름이 쌓입니다."
            />
          )}
        </PanelCard>

        <div className="activity-side">
          <PanelCard
            className="activity-focus-panel"
            title="라이브 이슈 묶음"
            description="현재 추적 중인 주제 묶음만 간단히 보여줍니다."
          >
            {dossiers.length > 0 ? (
              <div className="activity-focus-list">
                {dossiers.map((dossier) => (
                  <article key={dossier.id} className="activity-focus-card">
                    <div className="activity-focus-card__topline">
                      <StatusPill tone={dossierTone(dossier.status)}>{dossierLabel(dossier.status)}</StatusPill>
                      <small>
                        {formatDate(
                          dossier.lastUpdatedAt || dossier.lastPublishedAt || dossier.sourceItems[0]?.publishedAt || '',
                        )}
                      </small>
                    </div>
                    <strong>{dossier.title}</strong>
                    <p>{clipText(dossier.summary || dossier.lead, 126)}</p>
                    <div className="activity-focus-card__footer">
                      <span>소스 {dossier.sourceCount}</span>
                      <span>발행 {dossier.publishedCount}</span>
                      <span>{dossier.providerLabels.slice(0, 2).join(' · ') || dossier.sourceType}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="추적 중인 이슈 묶음이 없습니다"
                description="진행 중인 주제가 생기면 이 영역에서 바로 확인할 수 있습니다."
              />
            )}
          </PanelCard>

          <PanelCard
            className="activity-runtime-panel"
            title="발행 상태"
            description="지금 바로 읽어야 할 상태만 모았습니다."
          >
            <div className="activity-runtime-list">
              <article className="activity-runtime-item">
                <div>
                  <strong>현재 상태</strong>
                  <p>{runtimeLabel}</p>
                </div>
                <StatusPill tone={runtimeTone}>{runtimeLabel}</StatusPill>
              </article>
              <article className="activity-runtime-item">
                <div>
                  <strong>대기열</strong>
                  <p>초안과 예약 작업 수량입니다.</p>
                </div>
                <StatusPill tone={queuedCount > 0 ? 'info' : 'muted'}>{queuedCount}건</StatusPill>
              </article>
              <article className="activity-runtime-item">
                <div>
                  <strong>최근 발행</strong>
                  <p>{publishedPosts[0] ? clipText(publishedPosts[0].title, 52) : '최근 발행 기록이 아직 없습니다.'}</p>
                </div>
                <StatusPill tone="muted">{publishedPosts[0] ? formatDate(publishedPosts[0].publishedAt) : '없음'}</StatusPill>
              </article>
            </div>
          </PanelCard>
        </div>
      </div>
    </section>
  )
}

export default ActivityPage
