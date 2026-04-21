import { useDeferredValue, useMemo, useState } from 'react'
import {
  DisclosureSection,
  EmptyState,
  PrimitivePageHeader as PageHeader,
  SearchField,
  StatusPill,
  Toggle,
} from '../crewPageShared'
import { sourceLabel } from '../crewPageHelpers'
import { Icon, type IconName } from '../icons'
import { useArtemisApp } from '../state/context'
import type { ToolItem } from '../state/types'

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

function normalizeLine(value: string) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function looksLikeMetadata(value: string) {
  const normalized = normalizeLine(value).toLowerCase()
  return (
    !normalized ||
    normalized.startsWith('name:') ||
    normalized.startsWith('title:') ||
    normalized === '로컬 스킬' ||
    normalized === '플러그인 스킬' ||
    normalized.includes('skill.md') ||
    normalized.startsWith('c:\\') ||
    normalized.startsWith('/users/')
  )
}

function fallbackSummaryFromTitle(item: ToolItem) {
  const text = `${item.title} ${item.path}`.toLowerCase()

  if (text.includes('android')) return '안드로이드 에뮬레이터 화면과 동작을 점검합니다.'
  if (text.includes('figma')) return '코드나 화면 구조를 피그마 설계로 옮깁니다.'
  if (text.includes('frontend')) return '웹 UI를 더 강한 화면 구성과 스타일로 다듬습니다.'
  if (text.includes('karpathy')) return '코드 리뷰와 리팩터링에서 과한 구현을 줄입니다.'
  if (text.includes('image')) return '이미지 생성과 변형 작업을 처리합니다.'
  if (text.includes('docx') || text.includes('\\doc\\')) return '문서 파일을 만들거나 레이아웃을 다듬습니다.'
  if (text.includes('powerpoint') || text.includes('slide')) return '발표 자료와 슬라이드를 만들거나 수정합니다.'
  if (text.includes('excel') || text.includes('spreadsheet')) return '표 계산, 시트 편집, 데이터 정리를 처리합니다.'
  if (text.includes('linear')) return '리니어 이슈를 읽고 만들고 업데이트합니다.'
  if (text.includes('github actions') || text.includes('gh-fix-ci')) return '깃허브 액션 실패 원인을 찾고 고칩니다.'
  if (text.includes('github pr') || text.includes('comment')) return 'PR 리뷰 코멘트를 반영하고 정리합니다.'
  if (text.includes('github publish') || text.includes('yeet')) return '변경 사항을 커밋하고 푸시하고 PR까지 엽니다.'
  if (text.includes('github')) return '저장소, PR, 이슈 상태를 빠르게 살핍니다.'
  if (text.includes('netlify ai')) return 'Netlify AI Gateway 연결과 모델 구성을 돕습니다.'
  if (text.includes('netlify blobs')) return 'Netlify Blobs 저장소에 파일과 데이터를 다룹니다.'
  if (text.includes('caching on netlify') || text.includes('netlify-caching')) return 'Netlify CDN 캐시 정책을 설정합니다.'
  if (text.includes('frameworks on netlify')) return 'Netlify 프레임워크 배포 구성을 정리합니다.'
  if (text.includes('netlify config')) return 'netlify.toml 설정을 정리합니다.'
  if (text.includes('deploy') || text.includes('netlify-cli')) return 'Netlify 배포와 CLI 작업을 처리합니다.'
  if (text.includes('gradio')) return 'Gradio 데모와 인터랙티브 UI를 만듭니다.'
  if (text.includes('dataset')) return '허깅페이스 데이터셋 조회와 검색을 돕습니다.'
  if (text.includes('paper')) return '논문 페이지 조회, 요약, 정리를 돕습니다.'
  if (text.includes('jobs')) return '허깅페이스 잡에서 배치 작업이나 실험을 돌립니다.'
  if (text.includes('trackio')) return '학습 실험 로그와 지표를 추적합니다.'
  if (text.includes('vision')) return '비전 모델 학습과 평가를 돕습니다.'
  if (text.includes('trainer')) return '모델 학습과 파인튜닝 작업을 구성합니다.'
  if (text.includes('transformers.js')) return '브라우저와 노드에서 모델을 직접 실행합니다.'
  if (text.includes('cli') || text.includes('hf-cli')) return '허깅페이스 허브 CLI 작업을 처리합니다.'
  if (text.includes('ios debugger')) return 'iOS 시뮬레이터에서 앱 상태와 로그를 점검합니다.'
  if (text.includes('app intents')) return 'iOS App Intent와 Shortcut 노출 구조를 만듭니다.'
  if (text.includes('swiftui')) return 'SwiftUI 화면 구조, 성능, 리팩터링을 돕습니다.'
  if (text.includes('game playtest')) return '브라우저 게임 화면과 동작을 점검합니다.'
  if (text.includes('game ui')) return '브라우저 게임 UI와 HUD를 설계합니다.'
  if (text.includes('game studio')) return '게임 작업 흐름과 스택 선택을 잡아 줍니다.'
  if (text.includes('phaser')) return 'Phaser 기반 2D 게임 구현을 돕습니다.'
  if (text.includes('three') || text.includes('react-three-fiber')) return 'Three.js 계열 3D 게임 구현을 돕습니다.'
  if (text.includes('sprite')) return '스프라이트 생성과 정규화를 처리합니다.'

  if (item.source === 'plugin-skill') {
    return '플러그인에서 가져온 작업 보조 스킬입니다.'
  }

  return '로컬에 설치된 작업 보조 스킬입니다.'
}

function skillSummary(item: ToolItem) {
  const candidates = [item.description, item.example].map(normalizeLine)
  const summary = candidates.find((candidate) => !looksLikeMetadata(candidate))

  if (summary) {
    return summary
  }

  return fallbackSummaryFromTitle(item)
}

function skillMeta(item: ToolItem) {
  return sourceLabel(item.source)
}

export function SkillsPage() {
  const { syncSkills, toggleTool, state } = useArtemisApp()
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | ToolItem['source']>('all')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const deferredQuery = useDeferredValue(query)

  const items = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()

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
  }, [deferredQuery, enabledOnly, sourceFilter, state.tools.items])

  const totalCount = state.tools.items.length
  const enabledCount = state.tools.items.filter((item) => item.enabled).length
  const filteredCount = items.length
  const hasQuery = query.trim().length > 0
  const hasFilters = hasQuery || sourceFilter !== 'all' || enabledOnly

  const resetFilters = () => {
    setQuery('')
    setSourceFilter('all')
    setEnabledOnly(false)
  }

  return (
    <section className="page page--skills">
      <PageHeader
        icon="tools"
        title="스킬"
        description="아이콘, 이름, 한 줄 설명만 먼저 보여 주고 상세 정보는 펼쳤을 때만 확인합니다."
        actions={
          <div className="badge-row">
            {hasFilters ? (
              <button className="ghost-button" onClick={resetFilters} type="button">
                필터 초기화
              </button>
            ) : null}
            <button className="primary-button" onClick={() => void syncSkills()} type="button">
              스킬 다시 읽기
            </button>
          </div>
        }
      />

      <div className="page-toolbar skills-toolbar">
        <SearchField onChange={setQuery} placeholder="스킬 이름 또는 설명 검색" value={query} />
        <div className="chip-wrap">
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
            켜진 스킬만
          </button>
        </div>
      </div>

      <div className="skills-summary-strip">
        <StatusPill tone="muted">전체 {totalCount}</StatusPill>
        <StatusPill tone="info">켜짐 {enabledCount}</StatusPill>
        <StatusPill tone="muted">표시 {filteredCount}</StatusPill>
        {sourceFilter !== 'all' ? <StatusPill tone="muted">{sourceLabel(sourceFilter)}</StatusPill> : null}
        {hasQuery ? <StatusPill tone="muted">검색 {query.trim()}</StatusPill> : null}
      </div>

      {items.length > 0 ? (
        <div className="skills-collection">
          {items.map((item) => (
            <article key={item.id} className="panel-card skill-row">
              <div className="skill-row__main">
                <div className="skill-row__icon" aria-hidden="true">
                  <Icon name={skillIcon(item)} size={18} />
                </div>
                <div className="skill-row__copy">
                  <div className="skill-row__title">
                    <strong>{item.title}</strong>
                    <StatusPill tone="muted">{skillMeta(item)}</StatusPill>
                  </div>
                  <p>{skillSummary(item)}</p>
                </div>
              </div>

              <div className="skill-row__actions">
                <StatusPill tone={item.enabled ? 'info' : 'muted'}>{item.enabled ? '사용 중' : '꺼짐'}</StatusPill>
                <Toggle
                  label={`${item.title} ${item.enabled ? '끄기' : '켜기'}`}
                  on={item.enabled}
                  onToggle={() => toggleTool(item.id)}
                />
              </div>

              <DisclosureSection
                className="disclosure--soft skill-row__detail"
                title="상세 정보"
                summary="예시와 원본 경로"
              >
                <p className="example-text">{normalizeLine(item.example) || '예시가 아직 없습니다.'}</p>
                <small className="mono">{item.path}</small>
              </DisclosureSection>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={totalCount > 0 ? '조건에 맞는 스킬이 없습니다' : '등록된 스킬이 없습니다'}
          description={
            totalCount > 0
              ? '검색어 또는 필터를 바꾸면 다시 나타납니다.'
              : '브리지에서 스킬 목록을 다시 읽어오면 여기에서 관리할 수 있습니다.'
          }
          action={totalCount > 0 ? '필터 초기화' : '스킬 다시 읽기'}
          onAction={totalCount > 0 ? resetFilters : () => void syncSkills()}
        />
      )}
    </section>
  )
}

export default SkillsPage
