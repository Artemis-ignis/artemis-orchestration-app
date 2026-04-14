import { useDeferredValue, useMemo, useState } from 'react'
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
import { useArtemisApp } from '../state/context'

export function ActivityPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

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
