import { useDeferredValue, useMemo, useState } from 'react'
import {
  EmptyState,
  PageIntro,
  SearchField,
  Toggle,
} from '../crewPageShared'
import {
  sourceLabel,
} from '../crewPageHelpers'
import { useArtemisApp } from '../state/context'
import type { ToolItem } from '../state/types'

export function SkillsPage() {
  const { syncSkills, toggleTool, state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | ToolItem['source']>('all')
  const deferredQuery = useDeferredValue(query)

  const items = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()

    return state.tools.items.filter((item) => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) {
        return false
      }

      if (!keyword) {
        return true
      }

      return (
        item.title.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword) ||
        item.path.toLowerCase().includes(keyword)
      )
    })
  }, [deferredQuery, sourceFilter, state.tools.items])

  return (
    <section className="page">
      <PageIntro
        description="브리지에서 실제로 발견한 로컬 스킬만 표시합니다. 켠 스킬만 채팅과 오케스트레이션에 전달됩니다."
        icon="tools"
        title="스킬"
        trailing={
          <button className="primary-button" onClick={() => void syncSkills()} type="button">
            스킬 다시 읽기
          </button>
        }
      />

      <div className="page-toolbar">
        <div className="chip-wrap">
          {['all', 'local-skill', 'plugin-skill'].map((item) => (
            <button
              key={item}
              className={`chip ${sourceFilter === item ? 'is-active' : ''}`}
              onClick={() => setSourceFilter(item as typeof sourceFilter)}
              type="button"
            >
              {item === 'all' ? '전체' : sourceLabel(item as ToolItem['source'])}
            </button>
          ))}
        </div>
        <SearchField onChange={setQuery} placeholder="스킬 검색..." value={query} />
      </div>

      {items.length > 0 ? (
        <div className="stack-grid">
          {items.map((item) => (
            <article key={item.id} className="panel-card">
              <div className="panel-card__header">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <Toggle
                  label={`${item.title} ${item.enabled ? '비활성화' : '활성화'}`}
                  on={item.enabled}
                  onToggle={() => toggleTool(item.id)}
                />
              </div>
              <div className="badge-row">
                <span className="chip">{item.section}</span>
                <span className="chip">{sourceLabel(item.source)}</span>
              </div>
              <small className="mono">{item.path}</small>
              <p className="example-text">{item.example}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          action="스킬 다시 읽기"
          description="현재 발견된 로컬 스킬이 없습니다."
          onAction={() => void syncSkills()}
          title="스킬이 아직 없습니다"
        />
      )}
    </section>
  )
}

export default SkillsPage
