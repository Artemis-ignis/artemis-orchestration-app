import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { signalCategories, type PageId } from '../crewData'
import {
  DisclosureSection,
  EmptyState,
  PageIntro,
  SearchField,
} from '../crewPageShared'
import {
  formatDate,
  formatRelative,
  signalSourceLabel,
} from '../crewPageHelpers'
import { Icon } from '../icons'
import {
  exportAutoPost,
  fetchAutoPostDetail,
  fetchAutoPostState,
  fetchAutoPosts,
  fetchSignalsFeed,
  regenerateAutoPost,
  revealAutoPostFolder,
  runAutoPosts,
  type SignalFeedItem,
  updateAutoPostSettings,
} from '../lib/modelClient'
import { useArtemisApp } from '../state/context'
import type {
  AutoPostSettings,
  GeneratedPost,
  GeneratedPostSummary,
  SchedulerState,
} from '../types/autoPosts'

type SignalsTab = 'feed' | 'posts'

function buildSignalChatPrompt(item: SignalFeedItem) {
  const lines = [
    '다음 시그널을 바탕으로 핵심 내용과 바로 할 수 있는 다음 조치를 정리해줘.',
    `분류: ${item.category}`,
    `출처: ${item.source}`,
    `제목: ${item.title}`,
  ]

  if (item.originalTitle && item.originalTitle !== item.title) {
    lines.push(`원문 제목: ${item.originalTitle}`)
  }

  lines.push(`요약: ${item.summary}`)
  lines.push(`원문 링크: ${item.url}`)

  return lines.join('\n')
}

function compactText(value: string, maxLength = 220) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return ''
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}…` : normalized
}

function defaultAutoPostSettings(): AutoPostSettings {
  return {
    enabled: true,
    intervalMs: 3_600_000,
    topK: 1,
    categoryWeights: {
      ai: 1,
      research: 1.05,
      opensource: 0.98,
      business: 0.9,
    },
    generationModel: 'gpt-5.4-mini',
    screenshotFallback: true,
    outputDir: 'generated-posts',
  }
}

function defaultSchedulerState(): SchedulerState {
  return {
    lastRunAt: null,
    lastSuccessAt: null,
    nextRunAt: null,
    inProgress: false,
    lastError: '',
    processedUrlHashes: [],
    generatedPostIds: [],
  }
}

function postStatusLabel(status: GeneratedPost['status']) {
  switch (status) {
    case 'failed':
      return '실패'
    case 'draft':
      return '초안'
    default:
      return '준비됨'
  }
}

export function SignalsPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { setComposerText, state } = useArtemisApp()
  const bridgeUrl = state.settings.bridgeUrl
  const [activeTab, setActiveTab] = useState<SignalsTab>('feed')

  const [category, setCategory] = useState<(typeof signalCategories)[number]>('전체')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const [feed, setFeed] = useState<SignalFeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  const [postItems, setPostItems] = useState<GeneratedPostSummary[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [selectedPost, setSelectedPost] = useState<GeneratedPost | null>(null)
  const [postsLoading, setPostsLoading] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [postActionLoading, setPostActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [schedulerState, setSchedulerState] = useState<SchedulerState>(defaultSchedulerState)
  const [autoPostSettings, setAutoPostSettings] = useState<AutoPostSettings>(defaultAutoPostSettings)
  const [settingsDraft, setSettingsDraft] = useState<AutoPostSettings>(defaultAutoPostSettings)

  const loadFeed = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setFeedLoading(true)
        setFeedError(null)
      }

      try {
        const response = await fetchSignalsFeed({
          bridgeUrl,
          category,
        })
        setFeed(response.items)
        setGeneratedAt(response.generatedAt)
      } catch (nextError) {
        if (!silent) {
          setFeedError(
            nextError instanceof Error
              ? nextError.message
              : '시그널을 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!silent) {
          setFeedLoading(false)
        }
      }
    },
    [bridgeUrl, category],
  )

  const loadPosts = useCallback(
    async ({ silent = false, focusPostId }: { silent?: boolean; focusPostId?: string | null } = {}) => {
      if (!silent) {
        setPostsLoading(true)
        setPostError(null)
      }

      try {
        const [listResponse, stateResponse] = await Promise.all([
          fetchAutoPosts(bridgeUrl),
          fetchAutoPostState(bridgeUrl),
        ])

        setPostItems(listResponse.items)
        setAutoPostSettings(stateResponse.settings)
        setSettingsDraft(stateResponse.settings)
        setSchedulerState(stateResponse.state)

        const nextSelectedId =
          focusPostId ??
          selectedPostId ??
          listResponse.items[0]?.id ??
          null

        setSelectedPostId(nextSelectedId)

        if (nextSelectedId) {
          const detail = await fetchAutoPostDetail(bridgeUrl, nextSelectedId)
          setSelectedPost(detail)
        } else {
          setSelectedPost(null)
        }
      } catch (nextError) {
        if (!silent) {
          setPostError(
            nextError instanceof Error
              ? nextError.message
              : '자동 생성 게시글을 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!silent) {
          setPostsLoading(false)
        }
      }
    },
    [bridgeUrl, selectedPostId],
  )

  const loadPostDetail = useCallback(
    async (postId: string) => {
      setSelectedPostId(postId)
      setPostActionLoading(true)

      try {
        const detail = await fetchAutoPostDetail(bridgeUrl, postId)
        setSelectedPost(detail)
      } catch (nextError) {
        setActionMessage(
          nextError instanceof Error ? nextError.message : '게시글 상세를 불러오지 못했습니다.',
        )
      } finally {
        setPostActionLoading(false)
      }
    },
    [bridgeUrl],
  )

  useEffect(() => {
    void loadFeed()
  }, [loadFeed])

  useEffect(() => {
    if (activeTab === 'posts') {
      void loadPosts()
    }
  }, [activeTab, loadPosts])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadFeed({ silent: true })
      if (activeTab === 'posts') {
        void loadPosts({ silent: true, focusPostId: selectedPostId })
      }
    }, 90_000)

    return () => window.clearInterval(timer)
  }, [activeTab, loadFeed, loadPosts, selectedPostId])

  const filteredFeed = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    if (!keyword) {
      return feed
    }

    return feed.filter((item) =>
      `${item.title} ${item.summary} ${item.source} ${item.originalTitle ?? ''} ${item.originalSummary ?? ''}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [deferredQuery, feed])

  const filteredPosts = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    if (!keyword) {
      return postItems
    }

    return postItems.filter((item) =>
      `${item.title} ${item.previewText} ${item.category} ${item.generationModel}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [deferredQuery, postItems])

  const sourceSummary = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of feed) {
      const label = signalSourceLabel(item.source)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }

    return Array.from(counts.entries())
  }, [feed])

  const selectedPostSummary =
    filteredPosts.find((item) => item.id === selectedPostId) ??
    postItems.find((item) => item.id === selectedPostId) ??
    null

  const executeRunNow = async () => {
    setPostActionLoading(true)
    setActionMessage(null)

    try {
      const response = await runAutoPosts({
        bridgeUrl,
        category,
        limit: settingsDraft.topK,
        force: false,
      })

      setActionMessage(
        response.createdCount > 0
          ? `${response.createdCount}개의 게시글을 생성했습니다.`
          : response.error || '새로 생성할 게시글이 없었습니다.',
      )

      const focusPostId = response.posts[0]?.id ?? selectedPostId
      await loadPosts({ focusPostId })
      setActiveTab('posts')
    } catch (nextError) {
      setActionMessage(
        nextError instanceof Error ? nextError.message : '수동 실행에 실패했습니다.',
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeRegenerate = async () => {
    if (!selectedPostId) {
      return
    }

    setPostActionLoading(true)
    setActionMessage(null)

    try {
      const response = await regenerateAutoPost(bridgeUrl, selectedPostId)
      setActionMessage(
        response.createdCount > 0
          ? '같은 소스로 게시글을 다시 생성했습니다.'
          : response.error || '재생성 결과가 비어 있습니다.',
      )
      await loadPosts({ focusPostId: selectedPostId })
    } catch (nextError) {
      setActionMessage(
        nextError instanceof Error ? nextError.message : '재생성에 실패했습니다.',
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeExport = async () => {
    if (!selectedPostId) {
      return
    }

    setPostActionLoading(true)

    try {
      const result = await exportAutoPost({
        bridgeUrl,
        postId: selectedPostId,
        format: 'html',
      })
      setActionMessage(`HTML 내보내기를 완료했습니다: ${result.relativePath}`)
    } catch (nextError) {
      setActionMessage(
        nextError instanceof Error ? nextError.message : 'HTML 내보내기에 실패했습니다.',
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeRevealFolder = async () => {
    if (!selectedPostId) {
      return
    }

    setPostActionLoading(true)

    try {
      await revealAutoPostFolder({
        bridgeUrl,
        postId: selectedPostId,
      })
      setActionMessage('게시글 저장 폴더를 열었습니다.')
    } catch (nextError) {
      setActionMessage(
        nextError instanceof Error ? nextError.message : '폴더 열기에 실패했습니다.',
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeSaveSettings = async () => {
    setPostActionLoading(true)
    setActionMessage(null)

    try {
      const response = await updateAutoPostSettings({
        bridgeUrl,
        patch: settingsDraft,
      })
      setAutoPostSettings(response.settings)
      setSettingsDraft(response.settings)
      setSchedulerState(response.state)
      setActionMessage('자동 게시글 설정을 저장했습니다.')
    } catch (nextError) {
      setActionMessage(
        nextError instanceof Error ? nextError.message : '설정 저장에 실패했습니다.',
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  return (
    <section className="page">
      <PageIntro
        description="실시간 공개 피드와 자동 생성된 장문 HTML 게시글을 한 화면에서 관리합니다. 자동 게시글은 로컬 브리지가 1시간 주기로 수집·점수화·생성해 워크스페이스에 저장합니다."
        icon="signals"
        title="시그널"
        trailing={
          <div className="header-actions">
            <span className="subtle-label">
              {activeTab === 'feed'
                ? generatedAt
                  ? `실시간 피드 갱신 ${formatDate(generatedAt)}`
                  : '실시간 피드를 준비하고 있습니다.'
                : schedulerState.inProgress
                  ? '자동 게시글 생성이 실행 중입니다.'
                  : schedulerState.lastSuccessAt
                    ? `마지막 성공 ${formatDate(schedulerState.lastSuccessAt)}`
                    : '자동 게시글 상태를 불러오는 중입니다.'}
            </span>
            <button
              className="ghost-button"
              onClick={() => {
                if (activeTab === 'feed') {
                  void loadFeed()
                } else {
                  void loadPosts()
                }
              }}
              type="button"
            >
              새로고침
            </button>
          </div>
        }
      />

      <div className="signals-toolbar">
        <div className="chip-wrap">
          <button
            className={`chip ${activeTab === 'feed' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('feed')}
            type="button"
          >
            실시간 시그널
          </button>
          <button
            className={`chip ${activeTab === 'posts' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('posts')}
            type="button"
          >
            자동 생성 게시글
          </button>
        </div>
        <div className="signals-toolbar__actions">
          <SearchField
            onChange={setQuery}
            placeholder={activeTab === 'feed' ? '시그널 검색...' : '게시글 검색...'}
            value={query}
          />
        </div>
      </div>

      {activeTab === 'feed' ? (
        <>
          <div className="signals-toolbar">
            <div className="chip-wrap">
              {signalCategories.map((item) => (
                <button
                  key={item}
                  className={`chip ${category === item ? 'is-active' : ''}`}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="signals-toolbar__actions">
              <button className="primary-button" onClick={() => void executeRunNow()} type="button">
                지금 게시글 생성
              </button>
            </div>
          </div>

          <section className="panel-card panel-card--muted signals-source-strip">
            <div className="badge-row">
              {sourceSummary.map(([label, count]) => (
                <span key={label} className="chip chip--soft">
                  {label} {count}건
                </span>
              ))}
            </div>
            <p>
              실시간 탭은 원문 피드 목록입니다. 장문 결과물은 자동 생성 게시글 탭과 좌측 결과 메뉴에 별도로 저장됩니다.
            </p>
          </section>

          {feedError ? (
            <div className="status-banner status-banner--error">
              <Icon name="warning" size={16} />
              <span>{feedError}</span>
            </div>
          ) : null}

          {feedLoading && feed.length === 0 ? (
            <div className="panel-card panel-card--muted">실시간 시그널을 불러오는 중입니다...</div>
          ) : filteredFeed.length > 0 ? (
            <div className="signals-feed signals-feed--single">
              {filteredFeed.map((item) => {
                const translationLabel =
                  item.translationSource === 'codex'
                    ? 'Codex 번역'
                    : item.translationSource === 'ollama'
                      ? '로컬 번역'
                      : item.translationSource === 'google-gtx'
                        ? '실시간 번역'
                        : '원문'

                return (
                  <article key={item.id} className="signal-card signal-card--feed">
                    <div className="signal-card__meta">
                      <div className="badge-row">
                        <span className="chip chip--soft">{item.category}</span>
                        <span className="chip">{signalSourceLabel(item.source)}</span>
                        <span className="chip">{formatRelative(item.publishedAt)}</span>
                        <span
                          className={`chip ${
                            item.translationSource === 'original' ? 'chip--soft' : ''
                          }`}
                        >
                          {translationLabel}
                        </span>
                      </div>
                      <small>{formatDate(item.publishedAt)}</small>
                    </div>

                    <strong>{item.title}</strong>
                    {item.originalTitle && item.originalTitle !== item.title ? (
                      <small className="signal-card__original">원문 제목: {item.originalTitle}</small>
                    ) : null}
                    <p>{item.summary}</p>

                    <div className="badge-row">
                      <button
                        className="ghost-button"
                        onClick={() => {
                          setComposerText(buildSignalChatPrompt(item))
                          onNavigate('chat')
                        }}
                        type="button"
                      >
                        채팅으로 보내기
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => setActiveTab('posts')}
                        type="button"
                      >
                        게시글 탭 보기
                      </button>
                      <button
                        className="primary-button"
                        onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                        type="button"
                      >
                        원문 열기
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <EmptyState
              description="현재 조건으로 보여줄 실시간 시그널이 없습니다."
              title="빈 피드"
            />
          )}
        </>
      ) : (
        <div className="auto-posts-shell">
          <div className="auto-posts-side">
            <section className="panel-card">
              <div className="panel-card__header">
                <h2>스케줄러 상태</h2>
                <span className={`chip ${schedulerState.inProgress ? 'is-active' : 'chip--soft'}`}>
                  {schedulerState.inProgress ? '실행 중' : autoPostSettings.enabled ? '활성' : '비활성'}
                </span>
              </div>
              <div className="stack-grid stack-grid--compact">
                <div className="summary-row">
                  <span>마지막 실행</span>
                  <strong>{schedulerState.lastRunAt ? formatDate(schedulerState.lastRunAt) : '없음'}</strong>
                </div>
                <div className="summary-row">
                  <span>마지막 성공</span>
                  <strong>{schedulerState.lastSuccessAt ? formatDate(schedulerState.lastSuccessAt) : '없음'}</strong>
                </div>
                <div className="summary-row">
                  <span>다음 실행</span>
                  <strong>{schedulerState.nextRunAt ? formatDate(schedulerState.nextRunAt) : '비활성'}</strong>
                </div>
              </div>
              {schedulerState.lastError ? (
                <div className="status-banner status-banner--warning">
                  <Icon name="warning" size={16} />
                  <span>{schedulerState.lastError}</span>
                </div>
              ) : null}
              <div className="badge-row">
                <button
                  className="primary-button"
                  disabled={postActionLoading}
                  onClick={() => void executeRunNow()}
                  type="button"
                >
                  지금 실행
                </button>
                <button
                  className="ghost-button"
                  disabled={postActionLoading}
                  onClick={() => void loadPosts()}
                  type="button"
                >
                  목록 갱신
                </button>
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-card__header">
                <h2>자동 생성 설정</h2>
                <span className="chip chip--soft">{autoPostSettings.generationModel}</span>
              </div>
              <div className="auto-post-settings-grid">
                <label className="field">
                  <span>활성화</span>
                  <select
                    value={settingsDraft.enabled ? 'enabled' : 'disabled'}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        enabled: event.target.value === 'enabled',
                      }))
                    }
                  >
                    <option value="enabled">활성</option>
                    <option value="disabled">비활성</option>
                  </select>
                </label>

                <label className="field">
                  <span>주기(ms)</span>
                  <input
                    type="number"
                    value={settingsDraft.intervalMs}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        intervalMs: Number(event.target.value || current.intervalMs),
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>최대 생성 수</span>
                  <input
                    type="number"
                    min={1}
                    max={3}
                    value={settingsDraft.topK}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        topK: Number(event.target.value || current.topK),
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>생성 모델</span>
                  <input
                    value={settingsDraft.generationModel}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        generationModel: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>스크린샷 fallback</span>
                  <select
                    value={settingsDraft.screenshotFallback ? 'on' : 'off'}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        screenshotFallback: event.target.value === 'on',
                      }))
                    }
                  >
                    <option value="on">사용</option>
                    <option value="off">사용 안 함</option>
                  </select>
                </label>

                <label className="field field--full">
                  <span>저장 경로</span>
                  <input
                    value={settingsDraft.outputDir}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        outputDir: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>AI 및 기술 가중치</span>
                  <input
                    type="number"
                    step="0.05"
                    value={settingsDraft.categoryWeights.ai ?? 1}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        categoryWeights: {
                          ...current.categoryWeights,
                          ai: Number(event.target.value || current.categoryWeights.ai || 1),
                        },
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>연구 가중치</span>
                  <input
                    type="number"
                    step="0.05"
                    value={settingsDraft.categoryWeights.research ?? 1.05}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        categoryWeights: {
                          ...current.categoryWeights,
                          research: Number(event.target.value || current.categoryWeights.research || 1.05),
                        },
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>오픈소스 가중치</span>
                  <input
                    type="number"
                    step="0.05"
                    value={settingsDraft.categoryWeights.opensource ?? 0.98}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        categoryWeights: {
                          ...current.categoryWeights,
                          opensource: Number(event.target.value || current.categoryWeights.opensource || 0.98),
                        },
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>비즈니스 가중치</span>
                  <input
                    type="number"
                    step="0.05"
                    value={settingsDraft.categoryWeights.business ?? 0.9}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        categoryWeights: {
                          ...current.categoryWeights,
                          business: Number(event.target.value || current.categoryWeights.business || 0.9),
                        },
                      }))
                    }
                  />
                </label>
              </div>

              <div className="badge-row">
                <button
                  className="primary-button"
                  disabled={postActionLoading}
                  onClick={() => void executeSaveSettings()}
                  type="button"
                >
                  설정 저장
                </button>
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-card__header">
                <h2>게시글 목록</h2>
                <span className="chip chip--soft">{filteredPosts.length}개</span>
              </div>

              {postError ? (
                <div className="status-banner status-banner--error">
                  <Icon name="warning" size={16} />
                  <span>{postError}</span>
                </div>
              ) : null}

              {filteredPosts.length > 0 ? (
                <div className="auto-post-list">
                  {filteredPosts.map((item) => (
                    <button
                      key={item.id}
                      className={`auto-post-card ${selectedPostId === item.id ? 'is-active' : ''}`}
                      onClick={() => void loadPostDetail(item.id)}
                      type="button"
                    >
                      {item.thumbnail ? (
                        <img className="auto-post-card__thumb" src={item.thumbnail} alt="" />
                      ) : (
                        <div className="auto-post-card__thumb auto-post-card__thumb--empty">No media</div>
                      )}
                      <div className="auto-post-card__body">
                        <div className="card-topline">
                          <span className="chip chip--soft">{item.category}</span>
                          <small>{formatDate(item.createdAt)}</small>
                        </div>
                        <strong>{item.title}</strong>
                        <p>{compactText(item.previewText, 140)}</p>
                        <div className="badge-row">
                          <span className="chip chip--soft">점수 {Math.round(item.topicScore)}</span>
                          <span className="chip chip--soft">{postStatusLabel(item.status)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : postsLoading ? (
                <div className="panel-card panel-card--muted">자동 생성 게시글을 불러오는 중입니다...</div>
              ) : (
                <EmptyState
                  description="아직 저장된 자동 생성 게시글이 없습니다. 지금 실행을 눌러 첫 배치를 생성하세요."
                  action="지금 실행"
                  onAction={() => void executeRunNow()}
                  title="빈 게시글 저장소"
                />
              )}
            </section>
          </div>

          <div className="auto-posts-detail">
            {actionMessage ? (
              <div className="status-banner status-banner--info">
                <Icon name="spark" size={16} />
                <span>{actionMessage}</span>
              </div>
            ) : null}
            {selectedPost ? (
              <>
                <section className="panel-card">
                  <div className="panel-card__header">
                    <div>
                      <h2>{selectedPost.title}</h2>
                      <p className="settings-card__lead">
                        {selectedPost.subtitleLines.join(' / ') || selectedPost.lead}
                      </p>
                    </div>
                    <div className="badge-row">
                      <span className="chip chip--soft">{selectedPost.category}</span>
                      <span className="chip chip--soft">점수 {Math.round(selectedPost.topicScore)}</span>
                      <span className={`chip ${selectedPost.status === 'ready' ? 'is-active' : 'chip--soft'}`}>
                        {postStatusLabel(selectedPost.status)}
                      </span>
                    </div>
                  </div>

                  <div className="badge-row">
                    <button
                      className="primary-button"
                      disabled={postActionLoading}
                      onClick={() => void executeRegenerate()}
                      type="button"
                    >
                      재생성
                    </button>
                    <button
                      className="ghost-button"
                      disabled={postActionLoading}
                      onClick={() => void executeRevealFolder()}
                      type="button"
                    >
                      폴더 열기
                    </button>
                    <button
                      className="ghost-button"
                      disabled={postActionLoading}
                      onClick={() => void executeExport()}
                      type="button"
                    >
                      HTML 내보내기
                    </button>
                  </div>

                  <div className="summary-row summary-row--soft">
                    <span>저장 위치</span>
                    <strong>{selectedPost.workspacePath}</strong>
                  </div>
                  <div className="summary-row summary-row--soft">
                    <span>생성 모델</span>
                    <strong>{selectedPost.generationModel}</strong>
                  </div>
                </section>

                <section className="panel-card">
                  <div className="panel-card__header">
                    <h2>HTML 미리보기</h2>
                    <span className="chip chip--soft">
                      {selectedPostSummary ? formatDate(selectedPostSummary.updatedAt) : formatDate(selectedPost.updatedAt)}
                    </span>
                  </div>
                  <iframe
                    className="auto-post-preview-frame"
                    srcDoc={selectedPost.html}
                    title={selectedPost.title}
                  />
                </section>

                <div className="auto-post-detail-grid">
                  <section className="panel-card">
                    <div className="panel-card__header">
                      <h2>대표 미디어</h2>
                      <span className="chip chip--soft">{selectedPost.mediaAttachments.length}개</span>
                    </div>
                    {selectedPost.mediaAttachments.length > 0 ? (
                      <div className="auto-post-media-grid">
                        {selectedPost.mediaAttachments.map((item) => (
                          <article key={item.id} className="panel-card panel-card--muted">
                            {item.previewUrl ? (
                              item.kind === 'video' ? (
                                <video className="auto-post-media-thumb" controls preload="metadata" src={item.previewUrl} />
                              ) : (
                                <img className="auto-post-media-thumb" src={item.previewUrl} alt={item.title} />
                              )
                            ) : null}
                            <strong>{item.title}</strong>
                            <p>{item.description || item.provider || item.kind}</p>
                            <div className="badge-row">
                              <span className="chip chip--soft">{item.kind}</span>
                              <span className="chip chip--soft">{item.provider || 'media'}</span>
                              {(item.url || item.thumbnailUrl) ? (
                                <button
                                  className="ghost-button ghost-button--compact"
                                  onClick={() =>
                                    window.open(item.url || item.thumbnailUrl, '_blank', 'noopener,noreferrer')
                                  }
                                  type="button"
                                >
                                  원본 열기
                                </button>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        description="저장된 대표 미디어가 없습니다."
                        title="미디어 없음"
                      />
                    )}
                  </section>

                  <section className="panel-card">
                    <div className="panel-card__header">
                      <h2>원문과 로그</h2>
                      <span className="chip chip--soft">{selectedPost.sourceItems.length}개 출처</span>
                    </div>

                    <div className="stack-grid stack-grid--compact">
                      {selectedPost.sourceItems.map((item) => (
                        <article key={item.id} className="panel-card panel-card--muted">
                          <div className="card-topline">
                            <span className="chip chip--soft">{item.sourceLabel}</span>
                            <small>{formatDate(item.publishedAt)}</small>
                          </div>
                          <strong>{item.title}</strong>
                          <p>{compactText(item.summary, 180)}</p>
                          <div className="badge-row">
                            <span className="chip chip--soft">점수 {Math.round(item.score)}</span>
                            <button
                              className="ghost-button ghost-button--compact"
                              onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                              type="button"
                            >
                              원문 열기
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>

                    {selectedPost.logs && selectedPost.logs.length > 0 ? (
                      <DisclosureSection
                        className="disclosure--soft"
                        summary="자동 생성 실행 로그"
                        title="실행 로그"
                      >
                        <div className="run-card__logs">
                          {selectedPost.logs.map((log) => (
                            <div key={log.id} className={`run-log run-log--${log.level}`}>
                              <span>{formatDate(log.createdAt)}</span>
                              <p>{log.message}</p>
                            </div>
                          ))}
                        </div>
                      </DisclosureSection>
                    ) : null}
                  </section>
                </div>
              </>
            ) : (
              <EmptyState
                description="왼쪽 목록에서 게시글을 선택하면 실제 HTML 미리보기와 출처, 미디어, 로그를 볼 수 있습니다."
                title="게시글을 선택해 주세요"
              />
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default SignalsPage
