import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { NoticeBanner, PanelCard, StatCard, StatusPill } from '../components/ui/primitives'
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

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'info'

type StreamEntry = {
  id: string
  createdAt: string
  tone: Tone
  label: string
  title: string
  summary: string
  meta: string
}

function clipText(value: string | null | undefined, maxLength = 140) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return '설명이 아직 없습니다.'
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

function activityTypeLabel(type: ActivityType) {
  switch (type) {
    case 'chat':
      return '채팅'
    case 'file':
      return '파일'
    case 'tool':
      return '스킬'
    case 'insight':
      return '인사이트'
    case 'settings':
      return '설정'
    case 'signal':
      return '시그널'
    case 'agent':
      return '오케스트레이션'
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
      return '발행 중'
    case 'tracking':
      return '추적 중'
    default:
      return '신규 묶음'
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
      return '속보 요약'
    case 'brief-points':
      return '핵심 포인트'
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
    return '내부 발행 꺼짐'
  }

  if (x?.ready) {
    return '외부 연동 정상'
  }

  return '발행 상태 확인 필요'
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
        setPublisherLogs(response.logs.slice(0, 8))
        setPublishedPosts(response.published.slice(0, 4))
        setRecentDossiers(response.dossiers.slice(0, 4))
        setPublisherError(null)
      } catch (error) {
        if (!ignore) {
          setPublisherError(error instanceof Error ? error.message : '활동 상태를 불러오지 못했습니다.')
        }
      }
    }

    void run()
    return () => {
      ignore = true
    }
  }, [state.settings.bridgeUrl])

  const keyword = deferredQuery.trim().toLowerCase()

  const streamEntries = useMemo(() => {
    const entries: StreamEntry[] = []

    publisherMetrics?.recentFailures.slice(0, 3).forEach((failure) => {
      entries.push({
        id: `failure-${failure.id}`,
        createdAt: failure.updatedAt,
        tone: 'danger',
        label: '오류',
        title: failure.sourceTitle,
        summary: clipText(failure.errorReason, 120),
        meta: '최근 실패',
      })
    })

    publishedPosts.forEach((post) => {
      entries.push({
        id: `post-${post.id}`,
        createdAt: post.publishedAt,
        tone: 'success',
        label: '발행',
        title: post.title,
        summary: clipText(post.excerpt || post.body, 140),
        meta: `${post.sourceLabel || post.provider} · ${summaryTypeLabel(post.summaryType)}`,
      })
    })

    publisherLogs.forEach((log) => {
      entries.push({
        id: `log-${log.id}`,
        createdAt: log.createdAt,
        tone: logTone(log.level),
        label: '로그',
        title: log.action || '퍼블리셔 로그',
        summary: clipText(log.message, 130),
        meta: log.draftId ? `초안 ${log.draftId}` : '운영 로그',
      })
    })

    state.activity.items.forEach((item) => {
      entries.push({
        id: `activity-${item.id}`,
        createdAt: item.createdAt,
        tone: 'info',
        label: pageLabel(item.page),
        title: item.title,
        summary: clipText(item.detail, 130),
        meta: activityTypeLabel(item.type),
      })
    })

    const ordered = entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt))

    if (!keyword) {
      return ordered
    }

    return ordered.filter((entry) =>
      [entry.label, entry.title, entry.summary, entry.meta].join(' ').toLowerCase().includes(keyword),
    )
  }, [keyword, publishedPosts, publisherLogs, publisherMetrics?.recentFailures, state.activity.items])

  const filteredDossiers = useMemo(() => {
    const ordered = [...recentDossiers].sort((left, right) => {
      const leftTime = left.lastUpdatedAt || left.lastPublishedAt || ''
      const rightTime = right.lastUpdatedAt || right.lastPublishedAt || ''
      return rightTime.localeCompare(leftTime)
    })

    if (!keyword) {
      return ordered
    }

    return ordered.filter((dossier) =>
      [
        dossier.title,
        dossier.summary,
        dossier.lead,
        dossier.providerLabels.join(' '),
        dossier.keyPoints.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [keyword, recentDossiers])

  const queuedCount = publisherMetrics ? publisherMetrics.draftCount + publisherMetrics.scheduledCount : 0
  const summaryCards = [
    {
      label: '24시간 발행',
      value: publisherMetrics ? `${publisherMetrics.publishedCount24h}건` : publisherError ? '연결 오류' : '확인 중',
      meta: publisherMetrics ? `최근 1시간 ${publisherMetrics.publishedCount1h}건` : publisherError ?? '발행 통계를 불러오는 중입니다.',
      tone: publisherMetrics ? 'accent' : publisherError ? 'danger' : 'muted',
    },
    {
      label: '대기 중 작업',
      value: publisherMetrics ? `${queuedCount}건` : '확인 중',
      meta: publisherMetrics ? `초안 ${publisherMetrics.draftCount}건 · 예약 ${publisherMetrics.scheduledCount}건` : '초안과 예약 상태를 읽는 중입니다.',
      tone: queuedCount > 0 ? 'info' : 'muted',
    },
    {
      label: '오류',
      value: publisherMetrics ? `${publisherMetrics.failedCount}건` : publisherError ? '연결 오류' : '확인 중',
      meta:
        publisherMetrics && publisherMetrics.recentFailures[0]
          ? publisherMetrics.recentFailures[0].sourceTitle
          : publisherError ?? '최근 오류 없음',
      tone: publisherMetrics ? (publisherMetrics.failedCount > 0 ? 'danger' : 'success') : publisherError ? 'danger' : 'muted',
    },
    {
      label: '추적 묶음',
      value: publisherMetrics ? `${publisherMetrics.dossierCount}개` : '확인 중',
      meta: recentDossiers[0] ? recentDossiers[0].title : '활성 묶음을 불러오는 중입니다.',
      tone: 'info',
    },
  ] as const

  const runtimeTone = publisherError
    ? 'danger'
    : publisherMetrics
      ? publisherRuntimeTone(publisherMetrics.publishers)
      : 'muted'
  const runtimeLabel = publisherError
    ? '발행 연결 오류'
    : publisherMetrics
      ? publisherRuntimeLabel(publisherMetrics.publishers)
      : '발행 상태 확인 중'

  return (
    <section className="page activity-page">
      <PageIntro
        icon="insights"
        title="활동"
        description="지금 봐야 할 실행 흐름과 운영 이슈만 남겼습니다. 긴 원문과 잡다한 카드 대신 최근 흐름과 추적 묶음 중심으로 정리했습니다."
      />

      <div className="page-toolbar activity-toolbar">
        <SearchField onChange={setQuery} placeholder="활동, 발행, 오류 검색" value={query} />
        <div className="activity-toolbar__meta">
          <StatusPill tone="muted">표시 {streamEntries.length}</StatusPill>
          <StatusPill tone={runtimeTone}>{runtimeLabel}</StatusPill>
          <StatusPill tone="info">추적 묶음 {filteredDossiers.length}</StatusPill>
        </div>
      </div>

      {publisherError ? (
        <NoticeBanner tone="error" title="퍼블리셔 상태를 읽지 못했습니다.">
          {publisherError}
        </NoticeBanner>
      ) : null}

      <section className="activity-summary-strip" aria-label="활동 핵심 요약">
        {summaryCards.map((card) => (
          <StatCard key={card.label} label={card.label} meta={card.meta} tone={card.tone} value={card.value} />
        ))}
      </section>

      <div className="activity-journal-grid activity-journal-grid--clean">
        <PanelCard
          className="activity-log-panel signals-panel"
          title="최근 실행과 이벤트"
          description="최근 실행, 발행, 운영 로그를 시간순으로 묶었습니다."
          actions={
            <button className="ghost-button" onClick={() => onNavigate('signals')} type="button">
              시그널로 이동
            </button>
          }
          tone="accent"
        >
          {streamEntries.length > 0 ? (
            <div className="activity-sequence">
              {streamEntries.map((entry) => (
                <article key={entry.id} className={`activity-sequence__item activity-sequence__item--${entry.tone}`}>
                  <div className="activity-sequence__rail" aria-hidden="true">
                    <span className="activity-sequence__dot" />
                  </div>
                  <div className="activity-sequence__body">
                    <div className="activity-sequence__meta">
                      <div className="activity-sequence__metaGroup">
                        <StatusPill tone={entry.tone}>{entry.label}</StatusPill>
                        <StatusPill tone="muted">{entry.meta}</StatusPill>
                      </div>
                      <small>{formatDate(entry.createdAt)}</small>
                    </div>
                    <strong>{entry.title}</strong>
                    <p>{entry.summary}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="activity-inline-empty">표시할 최근 실행이나 이벤트가 없습니다.</div>
          )}
        </PanelCard>

        <div className="activity-side-stack">
          <PanelCard
            className="activity-cluster-panel signals-panel"
            title="라이브 이슈 묶음"
            description="현재 추적 중인 주제 묶음만 간단히 봅니다."
            tone="muted"
          >
            {filteredDossiers.length > 0 ? (
              <div className="activity-card-list">
                {filteredDossiers.map((dossier) => (
                  <article key={dossier.id} className="activity-dossier-card">
                    <div className="activity-card-topline">
                      <StatusPill tone={dossierTone(dossier.status)}>{dossierLabel(dossier.status)}</StatusPill>
                      <small>{formatDate(dossier.lastUpdatedAt || dossier.lastPublishedAt || dossier.sourceItems[0]?.publishedAt || '')}</small>
                    </div>
                    <h3>{dossier.title}</h3>
                    <p>{clipText(dossier.summary || dossier.lead, 150)}</p>
                    <div className="activity-card-footer activity-card-footer--text">
                      <span>소스 {dossier.sourceCount}</span>
                      <span>발행 {dossier.publishedCount}</span>
                      <span>{dossier.providerLabels.slice(0, 2).join(' · ') || dossier.sourceType}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="activity-inline-empty">현재 추적 중인 이슈 묶음이 없습니다.</div>
            )}
          </PanelCard>

          <PanelCard className="activity-meta-panel" title="발행 상태" description="퍼블리셔 런타임과 최근 대기열 상태입니다.">
            <div className="activity-status-list">
              <article className="activity-status-item">
                <div>
                  <strong>런타임</strong>
                  <p>{runtimeLabel}</p>
                </div>
                <StatusPill tone={runtimeTone}>{runtimeLabel}</StatusPill>
              </article>
              <article className="activity-status-item">
                <div>
                  <strong>대기열</strong>
                  <p>초안과 예약 대기 수량입니다.</p>
                </div>
                <StatusPill tone={queuedCount > 0 ? 'info' : 'muted'}>{queuedCount}건</StatusPill>
              </article>
              <article className="activity-status-item">
                <div>
                  <strong>최근 발행</strong>
                  <p>{publishedPosts[0] ? publishedPosts[0].title : '최근 발행 기록이 없습니다.'}</p>
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
