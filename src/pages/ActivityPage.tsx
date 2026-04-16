import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { PageId } from '../crewData'
import { EmptyState, PageIntro, SearchField } from '../crewPageShared'
import { formatDate, pageLabel } from '../crewPageHelpers'
import { fetchPublisherState } from '../lib/modelClient'
import { useArtemisApp } from '../state/context'
import type { PublisherLog, PublisherMetrics, PublishedPost } from '../types/publisher'

function publisherTargetLabel(target: 'internal' | 'x') {
  return target === 'internal' ? 'Artemis Wire' : 'X'
}

export function ActivityPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [publisherMetrics, setPublisherMetrics] = useState<PublisherMetrics | null>(null)
  const [publisherLogs, setPublisherLogs] = useState<PublisherLog[]>([])
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>([])
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
        setPublisherError(null)
      } catch (error) {
        if (ignore) {
          return
        }
        setPublisherError(error instanceof Error ? error.message : 'Artemis Wire 상태를 불러오지 못했습니다.')
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

  return (
    <section className="page activity-page">
      <PageIntro
        description="채팅, 파일, 오케스트레이션, 그리고 Artemis Wire 운영에서 실제로 일어난 실행 기록만 모아 봅니다."
        icon="insights"
        title="활동"
      />

      <div className="page-toolbar">
        <SearchField onChange={setQuery} placeholder="활동 검색..." value={query} />
      </div>

      {publisherMetrics ? (
        <section className="panel-card panel-card--muted">
          <div className="panel-card__header">
            <h2>Artemis Wire 운영 현황</h2>
            <span className="chip chip--soft">최근 24시간 {publisherMetrics.publishedCount24h}건</span>
          </div>
          <div className="badge-row">
            <span className="chip chip--soft">1시간 {publisherMetrics.publishedCount1h}건</span>
            <span className="chip chip--soft">승인 대기 {publisherMetrics.draftCount}건</span>
            <span className="chip chip--soft">예약 {publisherMetrics.scheduledCount}건</span>
            <span className="chip chip--soft">실패 {publisherMetrics.failedCount}건</span>
          </div>
          <div className="badge-row">
            {publisherMetrics.publishers.map((item) => (
              <span key={item.target} className="chip chip--soft">
                {publisherTargetLabel(item.target)} · {item.ready ? '준비됨' : item.enabled ? '대기' : '비활성'}
              </span>
            ))}
          </div>
          <div className="badge-row">
            {publisherMetrics.providerCounts24h.slice(0, 4).map((item) => (
              <span key={item.provider} className="chip chip--soft">
                {item.label || item.provider} · 수집 {item.fetchedCount24h} / 게시 {item.publishedCount24h}
              </span>
            ))}
          </div>
          <div className="run-card__logs">
            {publisherLogs.length > 0 ? (
              publisherLogs.map((log) => (
                <div key={log.id} className={`run-log run-log--${log.level === 'warning' ? 'error' : log.level}`}>
                  <span>{formatDate(log.createdAt)}</span>
                  <p>{log.message}</p>
                </div>
              ))
            ) : (
              <p className="subtle-label">아직 쌓인 Artemis Wire 운영 로그가 없습니다.</p>
            )}
          </div>
        </section>
      ) : publisherError ? (
        <section className="panel-card panel-card--muted">
          <p>{publisherError}</p>
        </section>
      ) : null}

      {publishedPosts.length > 0 ? (
        <section className="panel-card panel-card--muted">
          <div className="panel-card__header">
            <div>
              <h2>최근 Wire 게시물</h2>
              <p className="settings-card__lead">최근 내부 게시 이력을 빠르게 확인하고, 시그널 화면에서 이어서 검토할 수 있습니다.</p>
            </div>
            <button className="ghost-button" onClick={() => onNavigate('signals')} type="button">
              시그널에서 자세히 보기
            </button>
          </div>
          <div className="stack-grid">
            {publishedPosts.map((post) => (
              <article key={post.id} className="panel-card">
                <div className="card-topline">
                  <span className="chip chip--soft">{post.sourceLabel || post.provider}</span>
                  <small>{formatDate(post.publishedAt)}</small>
                </div>
                <strong>{post.title}</strong>
                <p>{post.excerpt}</p>
                <div className="badge-row">
                  <span className="chip chip--soft">{post.category || 'Artemis Wire'}</span>
                  <span className="chip chip--soft">{post.summaryType}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {items.length > 0 ? (
        <div className="stack-grid">
          {items.map((item) => (
            <article key={item.id} className="panel-card">
              <div className="card-topline">
                <span className="chip">{pageLabel(item.page)}</span>
                <small>{formatDate(item.createdAt)}</small>
              </div>
              <strong>{item.detail}</strong>
              <p>{item.title}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="채팅, 오케스트레이션, Wire 운영을 실행하면 실제 기록이 여기에 쌓입니다."
          action="오케스트레이션 열기"
          onAction={() => onNavigate('agents')}
          secondaryAction="가이드 열기"
          onSecondaryAction={() => onNavigate('guide')}
          title="활동 기록이 없습니다"
        />
      )}
    </section>
  )
}

export default ActivityPage
