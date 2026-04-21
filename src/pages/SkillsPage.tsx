import { useDeferredValue, useMemo, useState } from 'react'
import { EmptyState, SearchField } from '../crewPageShared'
import { PageHeader, StatusPill } from '../components/ui/primitives'
import { sourceLabel } from '../crewPageHelpers'
import { Icon, type IconName } from '../icons'
import { useArtemisApp } from '../state/context'
import type { ToolItem } from '../state/types'

type SkillGroup = {
  key: string
  title: string
  description: string
  order: number
}

function normalizeLine(value: string) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function looksLikeMetadata(value: string) {
  const normalized = normalizeLine(value).toLowerCase()
  return (
    !normalized ||
    normalized.startsWith('name:') ||
    normalized.startsWith('title:') ||
    normalized.includes('skill.md') ||
    normalized.startsWith('c:\\') ||
    normalized.startsWith('/users/')
  )
}

function skillIcon(item: ToolItem): IconName {
  const text = `${item.title} ${item.description} ${item.example} ${item.originLabel} ${item.path}`.toLowerCase()

  if (text.includes('chat') || text.includes('prompt')) return 'chat'
  if (text.includes('doc') || text.includes('sheet') || text.includes('slide')) return 'files'
  if (text.includes('signal') || text.includes('feed') || text.includes('monitor')) return 'signals'
  if (text.includes('agent') || text.includes('workflow') || text.includes('orchestration')) return 'agent'
  if (text.includes('deploy') || text.includes('netlify') || text.includes('github')) return 'settings'
  if (text.includes('figma') || text.includes('frontend') || text.includes('design')) return 'spark'
  if (item.source === 'plugin-skill') return 'marketplace'
  return 'book'
}

function fallbackSummary(item: ToolItem) {
  const text = `${item.title} ${item.path}`.toLowerCase()

  if (text.includes('android')) return '안드로이드 화면과 에뮬레이터 테스트를 돕습니다.'
  if (text.includes('figma')) return '코드 구조를 화면 설계와 작업 흐름으로 옮깁니다.'
  if (text.includes('frontend')) return '제품 화면을 더 단순하고 선명하게 다시 정리합니다.'
  if (text.includes('github')) return 'PR, 이슈, 배포 흐름을 점검하고 반영합니다.'
  if (text.includes('netlify')) return '배포, 설정, 캐시, 저장소 운영을 다룹니다.'
  if (text.includes('dataset')) return '데이터셋 조회와 필터링, 검색 작업을 처리합니다.'
  if (text.includes('paper')) return '논문 요약과 분석, 연결 자산 정리를 돕습니다.'
  if (text.includes('jobs')) return '원격 작업 실행과 학습 환경 구성을 처리합니다.'
  if (text.includes('trainer')) return '모델 학습과 실험 실행을 준비합니다.'
  if (text.includes('vision')) return '비전 모델 학습과 평가 흐름을 구성합니다.'
  if (text.includes('image')) return '이미지 생성과 편집 작업을 맡습니다.'
  if (text.includes('powerpoint') || text.includes('slide')) return '발표 자료와 슬라이드를 만들거나 고칩니다.'
  if (text.includes('excel') || text.includes('spreadsheet')) return '표 계산, 시트 편집, 데이터 정리를 처리합니다.'
  if (text.includes('docx') || text.includes('\\doc\\')) return '문서 파일을 만들거나 다듬습니다.'
  if (text.includes('game') || text.includes('ios') || text.includes('swiftui')) return '앱과 게임 화면 작업을 지원합니다.'

  return item.source === 'plugin-skill'
    ? '플러그인에서 제공하는 보조 기능입니다.'
    : '로컬 작업을 빠르게 처리하기 위한 기본 도구입니다.'
}

function skillSummary(item: ToolItem) {
  const candidates = [item.description, item.example].map(normalizeLine)
  const summary = candidates.find((value) => !looksLikeMetadata(value))
  return summary || fallbackSummary(item)
}

function skillSourceTone(source: ToolItem['source']) {
  return source === 'plugin-skill' ? 'accent' : 'muted'
}

function resolveSkillGroup(item: ToolItem): SkillGroup {
  const pathText = item.path.toLowerCase().replace(/\\/g, '/')
  const joined = `${item.title} ${item.description} ${item.path}`.toLowerCase()

  if (pathText.includes('/.codex/skills/.system/')) {
    return { key: 'system', title: '기본 도구', description: '자주 쓰는 기본 작업과 시스템 보조', order: 0 }
  }

  if (
    pathText.includes('codex-primary-runtime') ||
    pathText.includes('/skills/doc/') ||
    pathText.includes('/skills/spreadsheet/') ||
    joined.includes('powerpoint') ||
    joined.includes('excel') ||
    joined.includes('docx')
  ) {
    return { key: 'content', title: '문서·콘텐츠', description: '문서, 시트, 슬라이드, 이미지 작업', order: 1 }
  }

  if (
    joined.includes('figma') ||
    joined.includes('frontend') ||
    joined.includes('playwright') ||
    joined.includes('screenshot')
  ) {
    return { key: 'design', title: '디자인·프론트엔드', description: '화면 설계, 레이아웃, UI 품질 개선', order: 2 }
  }

  if (
    pathText.includes('/build-ios-apps/') ||
    pathText.includes('/game-studio/') ||
    pathText.includes('/test-android-apps/')
  ) {
    return { key: 'apps', title: '앱·게임', description: '모바일, 게임, 시뮬레이터, 플레이테스트', order: 3 }
  }

  if (
    pathText.includes('/github/') ||
    pathText.includes('/linear/') ||
    pathText.includes('/netlify/') ||
    joined.includes('karpathy')
  ) {
    return { key: 'ops', title: '개발·운영', description: '배포, 코드리뷰, 이슈 관리, 제품 운영', order: 4 }
  }

  if (pathText.includes('/hugging-face/')) {
    return { key: 'ml', title: 'ML·데이터', description: '모델, 데이터셋, 학습, 평가, 허깅페이스 작업', order: 5 }
  }

  return { key: 'misc', title: '기타', description: '분류되지 않은 보조 기능', order: 6 }
}

function groupItems(items: ToolItem[]) {
  const groups = new Map<string, { meta: SkillGroup; items: ToolItem[] }>()

  items.forEach((item) => {
    const meta = resolveSkillGroup(item)
    const existing = groups.get(meta.key)
    if (existing) {
      existing.items.push(item)
      return
    }

    groups.set(meta.key, { meta, items: [item] })
  })

  return [...groups.values()]
    .sort((left, right) => left.meta.order - right.meta.order || left.meta.title.localeCompare(right.meta.title, 'ko'))
    .map((entry) => ({
      ...entry,
      items: entry.items.sort((left, right) => {
        if (left.enabled !== right.enabled) {
          return Number(right.enabled) - Number(left.enabled)
        }
        return left.title.localeCompare(right.title, 'ko')
      }),
    }))
}

export function SkillsPage() {
  const { syncSkills, toggleTool, state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | ToolItem['source']>('all')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const deferredQuery = useDeferredValue(query)

  const keyword = deferredQuery.trim().toLowerCase()
  const totalCount = state.tools.items.length
  const enabledCount = state.tools.items.filter((item) => item.enabled).length

  const filteredItems = useMemo(() => {
    return state.tools.items.filter((item) => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) {
        return false
      }

      if (enabledOnly && !item.enabled) {
        return false
      }

      if (!keyword) {
        return true
      }

      return [item.title, item.description, item.example, item.originLabel, item.path, item.section]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  }, [enabledOnly, keyword, sourceFilter, state.tools.items])

  const groups = useMemo(() => groupItems(filteredItems), [filteredItems])

  const resetFilters = () => {
    setQuery('')
    setSourceFilter('all')
    setEnabledOnly(false)
  }

  return (
    <section className="page skills-page">
      <PageHeader
        icon="tools"
        title="스킬"
        description="무슨 스킬인지 바로 이해하고, 필요한 것만 켜고 끄게 정리했습니다."
        actions={
          <div className="skills-header__actions">
            <StatusPill tone="muted">전체 {totalCount}</StatusPill>
            <StatusPill tone="info">사용 중 {enabledCount}</StatusPill>
            <button className="primary-button" onClick={() => void syncSkills()} type="button">
              스킬 다시 읽기
            </button>
          </div>
        }
      />

      <div className="page-toolbar skills-toolbar">
        <SearchField onChange={setQuery} placeholder="스킬 이름, 설명, 경로 검색" value={query} />
        <div className="skills-toolbar__filters">
          {[
            { key: 'all', label: '전체' },
            { key: 'local-skill', label: '로컬 스킬' },
            { key: 'plugin-skill', label: '플러그인 스킬' },
          ].map((item) => (
            <button
              key={item.key}
              className={`chip ${sourceFilter === item.key ? 'is-active' : ''}`}
              onClick={() => setSourceFilter(item.key as typeof sourceFilter)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <button
            className={`chip ${enabledOnly ? 'is-active' : ''}`}
            onClick={() => setEnabledOnly((current) => !current)}
            type="button"
          >
            켜진 것만
          </button>
          {(query || sourceFilter !== 'all' || enabledOnly) && (
            <button className="ghost-button ghost-button--compact" onClick={resetFilters} type="button">
              초기화
            </button>
          )}
        </div>
      </div>

      {groups.length > 0 ? (
        <div className="skills-groups">
          {groups.map((group) => (
            <section key={group.meta.key} className="skills-group">
              <header className="skills-group__header">
                <div>
                  <h2>{group.meta.title}</h2>
                  <p>{group.meta.description}</p>
                </div>
                <StatusPill tone="muted">{group.items.length}개</StatusPill>
              </header>

              <div className="skills-group__list">
                {group.items.map((item) => {
                  return (
                    <article key={item.id} className="skill-row">
                      <div className="skill-row__main">
                        <div className="skill-row__icon" aria-hidden="true">
                          <Icon name={skillIcon(item)} size={16} />
                        </div>
                        <div className="skill-row__copy">
                          <div className="skill-row__titleRow">
                            <strong>{item.title}</strong>
                            <div className="skill-row__meta">
                              <StatusPill tone={skillSourceTone(item.source)}>{sourceLabel(item.source)}</StatusPill>
                              <StatusPill tone={item.enabled ? 'success' : 'muted'}>
                                {item.enabled ? '사용 중' : '꺼짐'}
                              </StatusPill>
                            </div>
                          </div>
                          <p>{skillSummary(item)}</p>
                        </div>
                      </div>

                      <div className="skill-row__actions">
                        <button
                          className={`outline-button ${item.enabled ? 'outline-button--active' : ''}`.trim()}
                          onClick={() => toggleTool(item.id)}
                          type="button"
                        >
                          {item.enabled ? '끄기' : '켜기'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title={totalCount > 0 ? '조건에 맞는 스킬이 없습니다' : '등록된 스킬이 없습니다'}
          description={
            totalCount > 0
              ? '검색어 또는 필터를 바꾸면 다시 보입니다.'
              : '스킬 목록을 다시 읽으면 여기서 바로 정리됩니다.'
          }
          action={totalCount > 0 ? '필터 초기화' : '다시 읽기'}
          onAction={totalCount > 0 ? resetFilters : () => void syncSkills()}
        />
      )}
    </section>
  )
}

export default SkillsPage
