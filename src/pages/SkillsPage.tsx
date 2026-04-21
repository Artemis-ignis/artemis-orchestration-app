import { useDeferredValue, useMemo, useState } from 'react'
import { DisclosureSection, EmptyState, SearchField } from '../crewPageShared'
import { PageHeader, StatusPill } from '../components/ui/primitives'
import { sourceLabel } from '../crewPageHelpers'
import { Icon, type IconName } from '../icons'
import { useArtemisApp } from '../state/context'
import type { ToolItem } from '../state/types'

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
  const text = `${item.title} ${item.description} ${item.example} ${item.originLabel} ${item.section}`.toLowerCase()

  if (text.includes('chat') || text.includes('prompt')) return 'chat'
  if (text.includes('file') || text.includes('doc') || text.includes('sheet')) return 'files'
  if (text.includes('signal') || text.includes('feed') || text.includes('monitor')) return 'signals'
  if (text.includes('agent') || text.includes('orchestration') || text.includes('workflow')) return 'agent'
  if (text.includes('setting') || text.includes('config')) return 'settings'
  if (item.source === 'plugin-skill') return 'marketplace'
  return 'book'
}

function fallbackSummary(item: ToolItem) {
  const text = `${item.title} ${item.path}`.toLowerCase()

  if (text.includes('android')) return '안드로이드 에뮬레이터와 앱 화면을 점검합니다.'
  if (text.includes('figma')) return '코드 구조를 화면 설계와 디자인 시스템으로 옮깁니다.'
  if (text.includes('frontend')) return '첫 화면 중심으로 제품 UI의 밀도와 구조를 다시 잡습니다.'
  if (text.includes('karpathy')) return '리팩터링과 리뷰에서 과한 구현을 줄이고 핵심만 남깁니다.'
  if (text.includes('github')) return 'PR, 이슈, 배포 흐름을 점검하고 반영합니다.'
  if (text.includes('netlify')) return '배포, 설정, 캐시, 스토리지 운영을 다룹니다.'
  if (text.includes('gradio')) return '데모와 실험용 인터페이스를 빠르게 구성합니다.'
  if (text.includes('dataset')) return '데이터셋 조회와 필터링, 행 검색을 처리합니다.'
  if (text.includes('paper')) return '논문 페이지 조회, 요약, 분석을 돕습니다.'
  if (text.includes('jobs')) return '클라우드 작업 배치와 실행 환경 구성을 다룹니다.'
  if (text.includes('vision')) return '비전 모델 학습과 평가 흐름을 구성합니다.'
  if (text.includes('trainer')) return '모델 학습과 파인튜닝 작업을 준비합니다.'
  if (text.includes('transformers.js')) return '브라우저나 노드에서 모델을 직접 실행합니다.'
  if (text.includes('ios')) return 'iOS 화면, 인텐트, 디버깅 작업을 보조합니다.'
  if (text.includes('game')) return '브라우저 게임 UI, 플레이테스트, 자산 작업을 지원합니다.'
  if (text.includes('image')) return '이미지 생성과 편집 작업을 처리합니다.'
  if (text.includes('powerpoint') || text.includes('slide')) return '발표 자료와 슬라이드를 만들거나 수정합니다.'
  if (text.includes('excel') || text.includes('spreadsheet')) return '표 계산, 시트 편집, 데이터 정리를 처리합니다.'
  if (text.includes('docx') || text.includes('\\doc\\')) return '문서 파일을 만들거나 편집합니다.'

  return item.source === 'plugin-skill'
    ? '플러그인에서 제공하는 작업 보조 스킬입니다.'
    : '로컬 작업을 빠르게 처리하기 위한 스킬입니다.'
}

function skillSummary(item: ToolItem) {
  const candidates = [item.description, item.example].map(normalizeLine)
  const summary = candidates.find((value) => !looksLikeMetadata(value))
  return summary || fallbackSummary(item)
}

function skillExample(item: ToolItem) {
  const normalized = normalizeLine(item.example)
  return looksLikeMetadata(normalized) ? '' : normalized
}

function skillSourceTone(source: ToolItem['source']) {
  return source === 'plugin-skill' ? 'accent' : 'muted'
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

  const items = useMemo(() => {
    return state.tools.items
      .filter((item) => {
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
      .sort((left, right) => {
        if (left.enabled !== right.enabled) {
          return Number(right.enabled) - Number(left.enabled)
        }
        return left.title.localeCompare(right.title, 'ko')
      })
  }, [enabledOnly, keyword, sourceFilter, state.tools.items])

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
        description="무슨 스킬인지 먼저 읽히고, 자세한 경로와 예시는 펼쳤을 때만 보이게 정리했습니다."
        actions={
          <div className="skills-header__actions">
            <StatusPill tone="muted">전체 {totalCount}</StatusPill>
            <StatusPill tone="info">사용 중 {enabledCount}</StatusPill>
            <button className="primary-button" onClick={() => void syncSkills()} type="button">
              다시 읽기
            </button>
          </div>
        }
      />

      <div className="page-toolbar skills-toolbar">
        <SearchField onChange={setQuery} placeholder="스킬 이름 또는 설명 검색" value={query} />
        <div className="skills-toolbar__filters">
          {[
            { key: 'all', label: '전체' },
            { key: 'local-skill', label: '로컬' },
            { key: 'plugin-skill', label: '플러그인' },
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
            켜진 항목만
          </button>
          {(query || sourceFilter !== 'all' || enabledOnly) && (
            <button className="ghost-button ghost-button--compact" onClick={resetFilters} type="button">
              초기화
            </button>
          )}
        </div>
      </div>

      {items.length > 0 ? (
        <div className="skills-list">
          {items.map((item) => {
            const example = skillExample(item)

            return (
              <article key={item.id} className="skill-item">
                <div className="skill-item__identity">
                  <div className="skill-item__icon" aria-hidden="true">
                    <Icon name={skillIcon(item)} size={18} />
                  </div>
                  <div className="skill-item__copy">
                    <div className="skill-item__topline">
                      <strong>{item.title}</strong>
                      <div className="skill-item__meta">
                        <StatusPill tone={skillSourceTone(item.source)}>{sourceLabel(item.source)}</StatusPill>
                        <StatusPill tone={item.enabled ? 'success' : 'muted'}>
                          {item.enabled ? '사용 중' : '꺼짐'}
                        </StatusPill>
                      </div>
                    </div>
                    <p>{skillSummary(item)}</p>
                  </div>
                </div>

                <div className="skill-item__actions">
                  <button
                    className={`outline-button ${item.enabled ? 'outline-button--active' : ''}`.trim()}
                    onClick={() => toggleTool(item.id)}
                    type="button"
                  >
                    {item.enabled ? '끄기' : '켜기'}
                  </button>
                </div>

                <DisclosureSection
                  className="disclosure--soft skill-item__detail"
                  title="자세히 보기"
                  summary="예시와 경로"
                >
                  {example ? <p className="skill-item__example">{example}</p> : null}
                  <small className="mono">{item.path}</small>
                </DisclosureSection>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title={totalCount > 0 ? '조건에 맞는 스킬이 없습니다' : '등록된 스킬이 없습니다'}
          description={
            totalCount > 0
              ? '검색어나 필터를 바꾸면 다시 보입니다.'
              : '스킬 목록을 다시 읽으면 여기에서 바로 정리됩니다.'
          }
          action={totalCount > 0 ? '필터 초기화' : '다시 읽기'}
          onAction={totalCount > 0 ? resetFilters : () => void syncSkills()}
        />
      )}
    </section>
  )
}

export default SkillsPage
