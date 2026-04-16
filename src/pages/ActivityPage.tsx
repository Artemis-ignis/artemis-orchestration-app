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
import { fetchXAutopostState } from '../lib/modelClient'
import { useArtemisApp } from '../state/context'
import type { XAutopostMetrics, XAutopostLog } from '../types/xAutopost'

export function ActivityPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [xMetrics, setXMetrics] = useState<XAutopostMetrics | null>(null)
  const [xLogs, setXLogs] = useState<XAutopostLog[]>([])
  const [xError, setXError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    const run = async () => {
      try {
        const response = await fetchXAutopostState(state.settings.bridgeUrl)
        if (ignore) {
          return
        }
        setXMetrics(response.metrics)
        setXLogs(response.logs.slice(0, 6))
        setXError(null)
      } catch (error) {
        if (ignore) {
          return
        }
        setXError(error instanceof Error ? error.message : 'X 자동 게시 상태를 불러오지 못했습니다.')
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

      {xMetrics ? (
        <section className="panel-card panel-card--muted">
          <div className="panel-card__header">
            <h2>X 자동 게시 현황</h2>
            <span className="chip chip--soft">최근 24시간 {xMetrics.postedCount24h}건</span>
          </div>
          <div className="badge-row">
            <span className="chip chip--soft">1시간 {xMetrics.postedCount1h}건</span>
            <span className="chip chip--soft">승인 대기 {xMetrics.draftCount}건</span>
            <span className="chip chip--soft">예약 {xMetrics.scheduledCount}건</span>
            <span className="chip chip--soft">실패 {xMetrics.failedCount}건</span>
          </div>
          <div className="run-card__logs">
            {xLogs.length > 0 ? (
              xLogs.map((log) => (
                <div key={log.id} className={`run-log run-log--${log.level === 'warning' ? 'error' : log.level}`}>
                  <span>{formatDate(log.createdAt)}</span>
                  <p>{log.message}</p>
                </div>
              ))
            ) : (
              <p className="subtle-label">아직 기록된 X 자동 게시 로그가 없습니다.</p>
            )}
          </div>
        </section>
      ) : xError ? (
        <section className="panel-card panel-card--muted">
          <p>{xError}</p>
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
