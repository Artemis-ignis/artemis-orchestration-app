import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { PageId } from '../crewData'
import {
  EmptyState,
  PageIntro,
  SearchField,
} from '../crewPageShared'
import {
  formatDate,
  pageLabel,
} from '../crewPageHelpers'
import { fetchPublisherState } from '../lib/modelClient'
import { useArtemisApp } from '../state/context'
import type { PublisherLog, PublisherMetrics } from '../types/publisher'

export function ActivityPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [publisherMetrics, setPublisherMetrics] = useState<PublisherMetrics | null>(null)
  const [publisherLogs, setPublisherLogs] = useState<PublisherLog[]>([])
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
        setPublisherError(null)
      } catch (error) {
        if (ignore) {
          return
        }
        setPublisherError(error instanceof Error ? error.message : '게시 엔진 상태를 불러오지 못했습니다.')
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
    <section className="page">
      <PageIntro
        description="실제로 실행된 채팅, 스킬, 오케스트레이션, 저장 작업 기록만 보여줍니다."
        icon="insights"
        title="활동"
      />

      <div className="page-toolbar">
        <SearchField onChange={setQuery} placeholder="활동 검색..." value={query} />
      </div>

      {publisherMetrics ? (
        <section className="panel-card panel-card--muted">
          <div className="panel-card__header">
            <h2>내부 게시 현황</h2>
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
                {item.target === 'internal' ? '내부' : 'X'} · {item.ready ? '준비됨' : item.enabled ? '대기' : '비활성'}
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
              <p className="subtle-label">아직 기록된 게시 엔진 로그가 없습니다.</p>
            )}
          </div>
        </section>
      ) : publisherError ? (
        <section className="panel-card panel-card--muted">
          <p>{publisherError}</p>
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
          description="채팅이나 오케스트레이션을 실행하면 실제 기록이 여기에 쌓입니다."
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
