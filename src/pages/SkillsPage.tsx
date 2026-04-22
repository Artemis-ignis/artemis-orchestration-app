import { useDeferredValue, useMemo, useState } from 'react'
import { EmptyState, SearchField } from '../crewPageShared'
import { NoticeBanner, PageHeader, PanelCard, StatCard, StatusPill } from '../components/ui/primitives'
import { sourceLabel } from '../crewPageHelpers'
import { Icon, type IconName } from '../icons'
import { useArtemisApp } from '../state/context'
import type { ToolItem } from '../state/types'

type SkillGroup = {
  key: string
  title: string
  description: string
  order: number
  icon: IconName
}

type WorkflowSpotlight = {
  key: string
  title: string
  description: string
  query: string
  source: 'all' | ToolItem['source']
  handles: string[]
  badge: string
}

const WORKFLOW_SPOTLIGHTS: WorkflowSpotlight[] = [
  {
    key: 'figma',
    title: 'Figma 구현 워크플로',
    description: '디자인 컨텍스트를 읽고 이 저장소의 토큰, 컴포넌트, 라우팅 규칙으로 옮기는 흐름입니다.',
    query: 'figma',
    source: 'plugin-skill',
    handles: ['figma-implement-design', 'figma-use', 'figma-generate-design'],
    badge: 'Figma 핵심',
  },
  {
    key: 'playwright',
    title: 'Playwright 검증 워크플로',
    description: '실제 브라우저에서 데스크톱과 모바일을 반복 점검하며 UI와 동작을 다듬는 흐름입니다.',
    query: 'playwright',
    source: 'all',
    handles: ['playwright-interactive', 'playwright'],
    badge: '검증 핵심',
  },
]

const FEATURED_SKILL_HANDLES = new Set(WORKFLOW_SPOTLIGHTS.flatMap((workflow) => workflow.handles))

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

function skillHandle(item: ToolItem) {
  const normalized = item.path.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-2) ?? item.title
}

function skillIcon(item: ToolItem): IconName {
  const text =
    `${item.title} ${item.description} ${item.example} ${item.originLabel} ${item.path}`.toLowerCase()

  if (text.includes('playwright') || text.includes('browser') || text.includes('qa')) return 'desktop'
  if (text.includes('figma') || text.includes('frontend') || text.includes('design')) return 'spark'
  if (text.includes('chat') || text.includes('prompt')) return 'chat'
  if (text.includes('doc') || text.includes('sheet') || text.includes('slide')) return 'files'
  if (text.includes('signal') || text.includes('feed') || text.includes('monitor')) return 'signals'
  if (text.includes('agent') || text.includes('workflow') || text.includes('orchestration')) return 'agent'
  if (text.includes('deploy') || text.includes('netlify') || text.includes('github')) return 'settings'
  if (item.source === 'plugin-skill') return 'marketplace'
  return 'book'
}

function fallbackSummary(item: ToolItem) {
  const handle = skillHandle(item).toLowerCase()
  const text = `${item.title} ${item.path}`.toLowerCase()

  if (handle.includes('playwright-interactive')) {
    return '브라우저 세션을 유지한 채 기능과 화면 품질을 반복 점검하는 검증 스킬입니다.'
  }
  if (handle.includes('playwright')) {
    return '실제 브라우저를 열어 흐름을 재현하고 스크린샷으로 UI를 확인하는 스킬입니다.'
  }
  if (handle.includes('figma-implement-design')) {
    return 'Figma 디자인을 현재 프로젝트의 디자인 시스템과 컴포넌트 구조로 구현하는 스킬입니다.'
  }
  if (handle.includes('figma-use')) {
    return 'Figma 파일 안에서 구조를 읽거나 수정할 때 필요한 플러그인 API 스킬입니다.'
  }
  if (handle.includes('frontend')) {
    return '화면 밀도, 계층, 카피, 인터랙션을 정돈해 프론트엔드 품질을 끌어올리는 스킬입니다.'
  }
  if (text.includes('android')) return '안드로이드 화면과 시뮬레이터 동작을 점검하는 스킬입니다.'
  if (text.includes('github')) return 'PR, 이슈, 리뷰와 배포 흐름을 다루는 개발 운영 스킬입니다.'
  if (text.includes('netlify')) return '배포, 설정, 캐시 같은 운영 작업을 정리하는 스킬입니다.'
  if (text.includes('dataset')) return '데이터셋 조회, 필터링, 점검 작업을 처리하는 스킬입니다.'
  if (text.includes('paper')) return '논문 요약과 분석, 관련 자료 정리에 쓰는 스킬입니다.'
  if (text.includes('jobs') || text.includes('trainer')) return '학습과 배치 작업을 준비하거나 실행하는 스킬입니다.'
  if (text.includes('powerpoint') || text.includes('slide')) return '발표 자료와 슬라이드를 만드는 스킬입니다.'
  if (text.includes('excel') || text.includes('spreadsheet')) return '표, 수식, 시트 정리에 쓰는 스킬입니다.'
  if (text.includes('docx') || text.includes('/doc/')) return '문서 파일을 만들거나 손보는 스킬입니다.'
  if (text.includes('game') || text.includes('ios') || text.includes('swiftui')) {
    return '앱과 게임 화면, 시뮬레이터 점검에 쓰는 스킬입니다.'
  }

  return item.source === 'plugin-skill'
    ? '플러그인에서 제공하는 보조 스킬입니다.'
    : '로컬 작업을 빠르게 처리하기 위한 기본 스킬입니다.'
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
    return {
      key: 'system',
      title: '기본 운영',
      description: '설치, 스킬 관리, 기본 작업 흐름처럼 자주 쓰는 운영 스킬',
      order: 0,
      icon: 'tools',
    }
  }

  if (
    pathText.includes('codex-primary-runtime') ||
    pathText.includes('/skills/doc/') ||
    pathText.includes('/skills/spreadsheet/') ||
    joined.includes('powerpoint') ||
    joined.includes('excel') ||
    joined.includes('docx')
  ) {
    return {
      key: 'content',
      title: '문서와 제작',
      description: '문서, 시트, 슬라이드, 이미지 같은 제작 보조 스킬',
      order: 1,
      icon: 'files',
    }
  }

  if (
    joined.includes('figma') ||
    joined.includes('frontend') ||
    joined.includes('playwright') ||
    joined.includes('screenshot')
  ) {
    return {
      key: 'design',
      title: '디자인과 검증',
      description: '화면 설계, 프론트엔드 구현, 브라우저 검증에 직접 쓰는 스킬',
      order: 2,
      icon: 'spark',
    }
  }

  if (
    pathText.includes('/build-ios-apps/') ||
    pathText.includes('/game-studio/') ||
    pathText.includes('/test-android-apps/')
  ) {
    return {
      key: 'apps',
      title: '앱과 디바이스',
      description: 'iOS, Android, 게임, 시뮬레이터 검증을 다루는 스킬',
      order: 3,
      icon: 'desktop',
    }
  }

  if (
    pathText.includes('/github/') ||
    pathText.includes('/linear/') ||
    pathText.includes('/netlify/') ||
    joined.includes('karpathy')
  ) {
    return {
      key: 'ops',
      title: '개발 운영',
      description: 'GitHub, Linear, Netlify와 코드 운영 흐름을 다루는 스킬',
      order: 4,
      icon: 'settings',
    }
  }

  if (pathText.includes('/hugging-face/')) {
    return {
      key: 'ml',
      title: '모델과 데이터',
      description: '모델, 데이터셋, 학습, 평가, 배치 작업을 다루는 스킬',
      order: 5,
      icon: 'insights',
    }
  }

  return {
    key: 'misc',
    title: '기타 보조',
    description: '분류 밖에 있지만 필요할 때 바로 꺼내 쓰는 스킬',
    order: 6,
    icon: 'book',
  }
}

function isFeaturedSkill(item: ToolItem) {
  return FEATURED_SKILL_HANDLES.has(skillHandle(item))
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
        const leftFeatured = Number(isFeaturedSkill(left))
        const rightFeatured = Number(isFeaturedSkill(right))
        if (leftFeatured !== rightFeatured) {
          return rightFeatured - leftFeatured
        }

        if (left.enabled !== right.enabled) {
          return Number(right.enabled) - Number(left.enabled)
        }

        return left.title.localeCompare(right.title, 'ko')
      }),
    }))
}

function workflowMatches(item: ToolItem, workflow: WorkflowSpotlight) {
  if (workflow.source !== 'all' && item.source !== workflow.source) {
    return false
  }

  const handle = skillHandle(item).toLowerCase()
  const haystack = `${handle} ${item.title} ${item.description} ${item.path}`.toLowerCase()
  return workflow.handles.includes(handle) || haystack.includes(workflow.query.toLowerCase())
}

function findWorkflowSpotlight(item: ToolItem) {
  const handle = skillHandle(item).toLowerCase()
  return WORKFLOW_SPOTLIGHTS.find((workflow) => workflow.handles.includes(handle)) ?? null
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
  const pluginCount = state.tools.items.filter((item) => item.source === 'plugin-skill').length
  const localCount = totalCount - pluginCount

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

  const workflowCards = useMemo(() => {
    return WORKFLOW_SPOTLIGHTS.map((workflow) => {
      const matches = state.tools.items.filter((item) => workflowMatches(item, workflow))
      const exactHandles = workflow.handles
        .map((handle) => matches.find((item) => skillHandle(item).toLowerCase() === handle))
        .filter((item): item is ToolItem => Boolean(item))

      return {
        workflow,
        matches,
        exactHandles,
        enabledMatches: matches.filter((item) => item.enabled).length,
      }
    }).filter((entry) => entry.matches.length > 0)
  }, [state.tools.items])

  const resetFilters = () => {
    setQuery('')
    setSourceFilter('all')
    setEnabledOnly(false)
  }

  const applyWorkflowFilter = (workflow: WorkflowSpotlight) => {
    setQuery(workflow.query)
    setSourceFilter(workflow.source)
    setEnabledOnly(false)
  }

  return (
    <section className="page skills-page">
      <PageHeader
        icon="tools"
        title="스킬"
        description="Figma 설계와 Playwright 검증 흐름이 먼저 보이도록 다시 정리했습니다. 필요한 스킬만 빠르게 켜고, 나머지는 목적별 그룹 안에서 접어 관리할 수 있습니다."
        actions={
          <div className="skills-header__actions">
            <StatusPill tone="muted">전체 {totalCount}</StatusPill>
            <StatusPill tone="info">사용 중 {enabledCount}</StatusPill>
            <button className="primary-button" onClick={() => void syncSkills()} type="button">
              스킬 새로고침
            </button>
          </div>
        }
      />

      <div className="skills-summary-grid">
        <StatCard
          label="전체 스킬"
          meta={`로컬 ${localCount}개 · 플러그인 ${pluginCount}개`}
          value={totalCount}
        />
        <StatCard
          label="사용 중"
          meta="현재 켜 둔 스킬 수"
          tone={enabledCount > 0 ? 'success' : 'muted'}
          value={enabledCount}
        />
        <StatCard
          label="추천 흐름"
          meta="Figma 구현과 Playwright 검증을 먼저 고정"
          tone="accent"
          value={`${workflowCards.length}/${WORKFLOW_SPOTLIGHTS.length}`}
        />
        <StatCard
          label="현재 표시"
          meta={`그룹 ${groups.length}개로 접어서 정리`}
          value={filteredItems.length}
        />
      </div>

      <NoticeBanner tone="info" title="정리 기준">
        기준 화면이 따로 없는 상태라, 현재 저장소 작업 흐름에 맞춰 Figma 구현, Playwright 검증, 나머지 보조 스킬 순서로 우선순위를 재배치했습니다.
      </NoticeBanner>

      <div className="skills-layout">
        <aside className="skills-rail">
          <PanelCard
            className="skills-panel"
            description="지금 가장 먼저 보이는 두 축만 앞에 두고, 실제로 필요한 스킬로 바로 필터할 수 있게 했습니다."
            title="추천 워크플로"
          >
            <div className="skills-workflow-list">
              {workflowCards.map(({ workflow, matches, exactHandles, enabledMatches }) => (
                <article
                  className={`skills-workflow-card ${workflow.key === 'figma' ? 'is-accent' : ''}`.trim()}
                  key={workflow.key}
                >
                  <div className="skills-workflow-card__top">
                    <div className="skills-workflow-card__copy">
                      <strong>{workflow.title}</strong>
                      <p>{workflow.description}</p>
                    </div>
                    <StatusPill tone={workflow.key === 'figma' ? 'accent' : 'muted'}>
                      {matches.length}개
                    </StatusPill>
                  </div>

                  <div className="skills-workflow-card__meta">
                    <StatusPill tone="muted">{workflow.source === 'all' ? '전체 출처' : sourceLabel(workflow.source)}</StatusPill>
                    <StatusPill tone={enabledMatches > 0 ? 'success' : 'muted'}>
                      사용 중 {enabledMatches}
                    </StatusPill>
                  </div>

                  {exactHandles.length > 0 ? (
                    <div className="skills-workflow-card__handles">
                      {exactHandles.map((item) => (
                        <span className="skills-workflow-card__handle mono" key={item.id}>
                          {skillHandle(item)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <button
                    className="ghost-button ghost-button--compact"
                    onClick={() => applyWorkflowFilter(workflow)}
                    type="button"
                  >
                    관련 스킬만 보기
                  </button>
                </article>
              ))}
            </div>
          </PanelCard>

          <PanelCard
            className="skills-panel skills-filter-panel"
            description="검색과 출처 필터는 유지하되, 기본 화면은 경로보다 작업 목적이 먼저 보이게 정리했습니다."
            title="목록 정리"
          >
            <SearchField
              onChange={setQuery}
              placeholder="스킬 이름, 설명, 경로 검색"
              value={query}
            />

            <div className="skills-filter-block">
              <span className="skills-filter-label">출처</span>
              <div className="skills-filter-chips">
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
              </div>
            </div>

            <div className="skills-filter-block">
              <span className="skills-filter-label">보기</span>
              <div className="skills-filter-chips">
                <button
                  className={`chip ${enabledOnly ? 'is-active' : ''}`}
                  onClick={() => setEnabledOnly((current) => !current)}
                  type="button"
                >
                  사용 중만
                </button>
              </div>
            </div>

            <div className="skills-filter-summary">
              <span>현재 {filteredItems.length}개 표시 중</span>
              {(query || sourceFilter !== 'all' || enabledOnly) && (
                <button className="ghost-button ghost-button--compact" onClick={resetFilters} type="button">
                  필터 초기화
                </button>
              )}
            </div>
          </PanelCard>
        </aside>

        <div className="skills-catalog">
          {groups.length > 0 ? (
            groups.map((group) => {
              const enabledInGroup = group.items.filter((item) => item.enabled).length
              const featuredInGroup = group.items.filter((item) => isFeaturedSkill(item)).length
              const defaultOpen =
                enabledOnly ||
                group.meta.key === 'design' ||
                enabledInGroup > 0 ||
                featuredInGroup > 0 ||
                groups.length <= 2

              return (
                <details className="ui-disclosure skills-group-panel" key={group.meta.key} open={defaultOpen}>
                  <summary className="ui-disclosure__summary skills-group-panel__summary">
                    <div className="skills-group-panel__main">
                      <span className="skills-group-panel__icon" aria-hidden="true">
                        <Icon name={group.meta.icon} size={16} />
                      </span>
                      <div className="skills-group-panel__copy">
                        <strong>{group.meta.title}</strong>
                        <small>{group.meta.description}</small>
                      </div>
                    </div>

                    <div className="skills-group-panel__badges">
                      {featuredInGroup > 0 ? <StatusPill tone="accent">추천 {featuredInGroup}</StatusPill> : null}
                      <StatusPill tone={enabledInGroup > 0 ? 'success' : 'muted'}>
                        사용 중 {enabledInGroup}
                      </StatusPill>
                      <StatusPill tone="muted">전체 {group.items.length}</StatusPill>
                    </div>
                  </summary>

                  <div className="ui-disclosure__body skills-group-panel__body">
                    <div className="skills-entry-list">
                      {group.items.map((item) => {
                        const workflow = findWorkflowSpotlight(item)

                        return (
                          <article
                            className={`skills-entry ${workflow ? 'is-featured' : ''}`.trim()}
                            key={item.id}
                          >
                            <div className="skills-entry__main">
                              <div className="skills-entry__icon" aria-hidden="true">
                                <Icon name={skillIcon(item)} size={16} />
                              </div>

                              <div className="skills-entry__copy">
                                <div className="skills-entry__titleRow">
                                  <div className="skills-entry__heading">
                                    <strong>{item.title}</strong>
                                    <span className="skills-entry__handle mono">{skillHandle(item)}</span>
                                  </div>

                                  <div className="skills-entry__actions">
                                    <button
                                      className={`outline-button ${item.enabled ? 'outline-button--active' : ''}`.trim()}
                                      onClick={() => toggleTool(item.id)}
                                      type="button"
                                    >
                                      {item.enabled ? '끄기' : '켜기'}
                                    </button>
                                  </div>
                                </div>

                                <p>{skillSummary(item)}</p>

                                <div className="skills-entry__meta">
                                  {workflow ? <StatusPill tone="accent">{workflow.badge}</StatusPill> : null}
                                  <StatusPill tone={skillSourceTone(item.source)}>{sourceLabel(item.source)}</StatusPill>
                                  <StatusPill tone={item.enabled ? 'success' : 'muted'}>
                                    {item.enabled ? '사용 중' : '꺼짐'}
                                  </StatusPill>
                                </div>
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                </details>
              )
            })
          ) : (
            <EmptyState
              action={totalCount > 0 ? '필터 초기화' : '다시 불러오기'}
              description={
                totalCount > 0
                  ? '검색어 또는 필터를 바꾸면 다른 스킬이 다시 보입니다.'
                  : '스킬 목록을 아직 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.'
              }
              onAction={totalCount > 0 ? resetFilters : () => void syncSkills()}
              title={totalCount > 0 ? '조건에 맞는 스킬이 없습니다' : '등록된 스킬이 없습니다'}
            />
          )}
        </div>
      </div>
    </section>
  )
}

export default SkillsPage
