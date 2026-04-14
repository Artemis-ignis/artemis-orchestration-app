import { useDeferredValue, useMemo, useState } from 'react'
import type { PageId } from '../crewData'
import { EmptyState, PageIntro, SearchField } from '../crewPageShared'
import { formatDate } from '../crewPageHelpers'
import { useArtemisApp } from '../state/context'
import type { InsightStatus } from '../state/types'

export function InsightsPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { markInsight, state } = useArtemisApp()
  const [filter, setFilter] = useState<'all' | InsightStatus>('all')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const items = useMemo(
    () =>
      state.insights.items.filter((item) => {
        if (filter !== 'all' && item.status !== filter) {
          return false
        }

        const keyword = deferredQuery.trim().toLowerCase()
        if (!keyword) {
          return true
        }

        return (
          item.title.toLowerCase().includes(keyword) ||
          item.detail.toLowerCase().includes(keyword)
        )
      }),
    [deferredQuery, filter, state.insights.items],
  )

  return (
    <section className="page">
      <PageIntro
        description="채팅과 오케스트레이션, 시그널 결과에서 후속 조치가 필요한 메모만 모아 둡니다."
        icon="insights"
        title="인사이트"
      />

      <div className="page-toolbar">
        <div className="chip-wrap">
          {[
            ['all', '전체'],
            ['unread', '읽지 않음'],
            ['read', '읽음'],
            ['archived', '보관'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`chip ${filter === id ? 'is-active' : ''}`}
              onClick={() => setFilter(id as typeof filter)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <SearchField onChange={setQuery} placeholder="인사이트 검색..." value={query} />
      </div>

      {items.length > 0 ? (
        <div className="stack-grid">
          {items.map((item) => (
            <article key={item.id} className="panel-card insight-card">
              <div className="card-topline">
                <span className="chip">{item.source}</span>
                <small>{formatDate(item.createdAt)}</small>
              </div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <div className="badge-row">
                <button className="ghost-button" onClick={() => markInsight(item.id, 'unread')} type="button">
                  읽지 않음
                </button>
                <button className="ghost-button" onClick={() => markInsight(item.id, 'read')} type="button">
                  읽음
                </button>
                <button className="ghost-button" onClick={() => markInsight(item.id, 'archived')} type="button">
                  보관
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="채팅이나 오케스트레이션을 실행하면 중요한 결과가 여기에 쌓입니다."
          action="채팅 시작"
          onAction={() => onNavigate('chat')}
          title="아직 인사이트가 없습니다"
        />
      )}
    </section>
  )
}

export default InsightsPage
