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
  approveXAutopostDraft,
  exportAutoPost,
  fetchAutoPostDetail,
  fetchAutoPostState,
  fetchAutoPosts,
  fetchSignalsFeed,
  fetchXAutopostState,
  publishXAutopostDraftNow,
  rejectXAutopostDraft,
  regenerateAutoPost,
  revealAutoPostFolder,
  runAutoPosts,
  runXAutopost,
  type SignalFeedItem,
  updateXAutopostSettings,
  updateAutoPostSettings,
} from '../lib/modelClient'
import { useArtemisApp } from '../state/context'
import type {
  AutoPostSettings,
  GeneratedPost,
  GeneratedPostSummary,
  SchedulerState,
} from '../types/autoPosts'
import type {
  XAutopostDraft,
  XAutopostSettings,
  XAutopostState,
  XAutopostLog,
  XAutopostPublisherStatus,
  XAutopostMetrics,
} from '../types/xAutopost'

type SignalsTab = 'feed' | 'posts' | 'publisher'

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

function defaultXAutopostSettings(): XAutopostSettings {
  return {
    mode: 'approval',
    maxPerHour: 10,
    minIntervalMinutes: 6,
    maxPerDay: 120,
    requireSourceUrl: true,
    requireUniqueTopic: true,
    minNoveltyScore: 0.72,
    blockNearDuplicates: true,
    outputDir: 'x-autopost',
    generationModel: 'gpt-5.4-mini',
    startupDelayMs: 15_000,
    schedulerPollMs: 60_000,
    topicCooldownHours: 48,
    retryLimit: 3,
    retryBackoffMinutes: 12,
    maxQueueItems: 400,
  }
}

function defaultXAutopostState(): XAutopostState {
  return {
    lastDraftRunAt: null,
    lastPublishAttemptAt: null,
    lastPostedAt: null,
    nextGenerationAt: null,
    nextPublishAt: null,
    inProgress: false,
    lastError: '',
    lastDraftId: null,
    postedDraftIds: [],
    skippedDraftIds: [],
    updatedAt: new Date().toISOString(),
  }
}

function defaultXAutopostPublisher(): XAutopostPublisherStatus {
  return {
    enabled: false,
    configured: false,
    ready: false,
    detail: 'X publisher 상태를 확인하지 못했습니다.',
  }
}

function defaultXAutopostMetrics(): XAutopostMetrics {
  return {
    draftCount: 0,
    approvedCount: 0,
    scheduledCount: 0,
    postedCount24h: 0,
    postedCount1h: 0,
    failedCount: 0,
    publisher: defaultXAutopostPublisher(),
    recentFailures: [],
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

function draftStatusLabel(status: XAutopostDraft['status']) {
  switch (status) {
    case 'approved':
      return '승인됨'
    case 'scheduled':
      return '예약됨'
    case 'posted':
      return '게시됨'
    case 'failed':
      return '실패'
    case 'skipped':
      return '건너뜀'
    default:
      return '초안'
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
  const [xQueue, setXQueue] = useState<XAutopostDraft[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [xAutopostSettings, setXAutopostSettings] = useState<XAutopostSettings>(defaultXAutopostSettings)
  const [xSettingsDraft, setXSettingsDraft] = useState<XAutopostSettings>(defaultXAutopostSettings)
  const [xAutopostState, setXAutopostState] = useState<XAutopostState>(defaultXAutopostState)
  const [xAutopostLogs, setXAutopostLogs] = useState<XAutopostLog[]>([])
  const [xAutopostMetrics, setXAutopostMetrics] = useState<XAutopostMetrics>(defaultXAutopostMetrics)
  const [xPublisherStatus, setXPublisherStatus] = useState<XAutopostPublisherStatus>(defaultXAutopostPublisher)

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

  const loadXAutopost = useCallback(
    async ({ silent = false, focusDraftId }: { silent?: boolean; focusDraftId?: string | null } = {}) => {
      if (!silent) {
        setPostActionLoading(true)
        setActionMessage(null)
      }

      try {
        const response = await fetchXAutopostState(bridgeUrl)
        setXQueue(response.queue)
        setXAutopostSettings(response.settings)
        setXSettingsDraft(response.settings)
        setXAutopostState(response.state)
        setXAutopostLogs(response.logs)
        setXAutopostMetrics(response.metrics)
        setXPublisherStatus(response.publisher)

        const nextSelectedId = focusDraftId ?? selectedDraftId ?? response.queue[0]?.id ?? null
        setSelectedDraftId(nextSelectedId)
      } catch (nextError) {
        if (!silent) {
          setActionMessage(nextError instanceof Error ? nextError.message : 'X 자동 게시 상태를 불러오지 못했습니다.')
        }
      } finally {
        if (!silent) {
          setPostActionLoading(false)
        }
      }
    },
    [bridgeUrl, selectedDraftId],
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
    if (activeTab === 'publisher') {
      void loadXAutopost()
    }
  }, [activeTab, loadPosts, loadXAutopost])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadFeed({ silent: true })
      if (activeTab === 'posts') {
        void loadPosts({ silent: true, focusPostId: selectedPostId })
      } else if (activeTab === 'publisher') {
        void loadXAutopost({ silent: true, focusDraftId: selectedDraftId })
      }
    }, 90_000)

    return () => window.clearInterval(timer)
  }, [activeTab, loadFeed, loadPosts, loadXAutopost, selectedDraftId, selectedPostId])

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
  const filteredDrafts = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    if (!keyword) {
      return xQueue
    }

    return xQueue.filter((item) =>
      `${item.sourceTitle} ${item.generatedText} ${item.sourceLabel} ${item.category}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [deferredQuery, xQueue])

  const selectedDraft =
    filteredDrafts.find((item) => item.id === selectedDraftId) ??
    xQueue.find((item) => item.id === selectedDraftId) ??
    null

  useEffect(() => {
    if (!selectedDraftId && filteredDrafts[0]) {
      setSelectedDraftId(filteredDrafts[0].id)
      return
    }

    if (selectedDraftId && !xQueue.some((item) => item.id === selectedDraftId)) {
      setSelectedDraftId(filteredDrafts[0]?.id ?? null)
    }
  }, [filteredDrafts, selectedDraftId, xQueue])

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

  const executeCreateDraftFromSignal = async (item?: SignalFeedItem | null) => {
    const seedItem = item ?? null
    setPostActionLoading(true)
    setActionMessage(null)

    try {
      const response = await runXAutopost({
        bridgeUrl,
        category,
        limit: seedItem ? 1 : 2,
        force: false,
        seedItems: seedItem ? [seedItem] : [],
        reason: seedItem ? 'signal-seed' : 'manual',
      })
      setActionMessage(
        response.createdCount > 0
          ? `${response.createdCount}개의 X 게시 초안을 큐에 추가했습니다.`
          : response.skippedCount > 0
            ? `${response.skippedCount}개의 후보가 guardrail에 걸려 건너뛰었습니다.`
            : '새로 큐에 넣을 초안이 없었습니다.',
      )
      await loadXAutopost({ focusDraftId: response.items[0]?.id ?? selectedDraftId ?? null })
      setActiveTab('publisher')
    } catch (nextError) {
      setActionMessage(nextError instanceof Error ? nextError.message : 'X 게시 초안 생성에 실패했습니다.')
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeSaveXSettings = async () => {
    setPostActionLoading(true)
    setActionMessage(null)

    try {
      const response = await updateXAutopostSettings({
        bridgeUrl,
        patch: xSettingsDraft,
      })
      setXAutopostSettings(response.settings)
      setXSettingsDraft(response.settings)
      setXAutopostState(response.state)
      setXQueue(response.queue)
      setXAutopostLogs(response.logs)
      setXAutopostMetrics(response.metrics)
      setXPublisherStatus(response.publisher)
      setActionMessage('X 자동 게시 설정을 저장했습니다.')
    } catch (nextError) {
      setActionMessage(nextError instanceof Error ? nextError.message : 'X 자동 게시 설정 저장에 실패했습니다.')
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeApproveDraft = async (draftId: string) => {
    setPostActionLoading(true)
    setActionMessage(null)
    try {
      const response = await approveXAutopostDraft(bridgeUrl, draftId)
      setActionMessage(
        response.item.scheduledAt
          ? `초안을 승인했고 다음 발행 슬롯을 배정했습니다: ${formatDate(response.item.scheduledAt)}`
          : '초안을 승인했습니다.',
      )
      await loadXAutopost({ focusDraftId: response.item.id })
    } catch (nextError) {
      setActionMessage(nextError instanceof Error ? nextError.message : '초안 승인에 실패했습니다.')
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeRejectDraft = async (draftId: string) => {
    setPostActionLoading(true)
    setActionMessage(null)
    try {
      const response = await rejectXAutopostDraft(bridgeUrl, draftId)
      setActionMessage(`초안을 큐에서 제외했습니다: ${response.item.sourceTitle}`)
      await loadXAutopost({ focusDraftId: response.item.id })
    } catch (nextError) {
      setActionMessage(nextError instanceof Error ? nextError.message : '초안 거절에 실패했습니다.')
    } finally {
      setPostActionLoading(false)
    }
  }

  const executePublishDraft = async (draftId: string) => {
    setPostActionLoading(true)
    setActionMessage(null)
    try {
      const response = await publishXAutopostDraftNow(
        bridgeUrl,
        draftId,
        !xPublisherStatus.ready || xAutopostSettings.mode === 'dry-run',
      )
      setActionMessage(
        response.item.status === 'scheduled' && response.detail
          ? response.detail
          : response.simulated
          ? '실제 인증이 없어 dry-run으로 게시 시뮬레이션을 완료했습니다.'
          : '공식 X API로 게시를 완료했습니다.',
      )
      await loadXAutopost({ focusDraftId: response.item.id })
    } catch (nextError) {
      setActionMessage(nextError instanceof Error ? nextError.message : '즉시 게시에 실패했습니다.')
    } finally {
      setPostActionLoading(false)
    }
  }

  return (
    <section className="page">
      <PageIntro
        description="실시간 시그널, 장문 분석글 저장, 그리고 실제 X 자동 게시 큐를 한 화면에서 운영합니다. X 자동 게시 탭에서는 초안 생성, 승인, 예약, 즉시 발행, 최근 로그를 직접 관리할 수 있습니다."
        icon="signals"
        title="시그널"
        trailing={
          <div className="header-actions">
            <span className="subtle-label">
              {activeTab === 'feed'
                ? generatedAt
                  ? `실시간 피드 갱신 ${formatDate(generatedAt)}`
                  : '실시간 피드를 준비하고 있습니다.'
                : activeTab === 'publisher'
                  ? xAutopostState.inProgress
                    ? 'X 자동 게시 스케줄러가 실행 중입니다.'
                    : xAutopostState.lastPostedAt
                      ? `최근 게시 ${formatDate(xAutopostState.lastPostedAt)}`
                      : xPublisherStatus.detail
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
                } else if (activeTab === 'publisher') {
                  void loadXAutopost()
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
            className={`chip ${activeTab === 'publisher' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('publisher')}
            type="button"
          >
            X 자동 게시
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
            placeholder={activeTab === 'feed' ? '시그널 검색...' : activeTab === 'publisher' ? '큐 검색...' : '게시글 검색...'}
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
                        className="ghost-button"
                        disabled={postActionLoading}
                        onClick={() => void executeCreateDraftFromSignal(item)}
                        type="button"
                      >
                        X 초안 생성
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
      ) : activeTab === 'publisher' ? (
        <div className="x-autopost-shell">
          <div className="x-autopost-side">
            <section className="panel-card">
              <div className="panel-card__header">
                <h2>X 자동 게시 운영</h2>
                <span className={`chip ${xAutopostState.inProgress ? 'is-active' : 'chip--soft'}`}>
                  {xAutopostSettings.mode}
                </span>
              </div>
              <div className="stack-grid stack-grid--compact">
                <div className="summary-row">
                  <span>publisher</span>
                  <strong>{xPublisherStatus.ready ? '연결됨' : xPublisherStatus.enabled ? 'fallback' : '비활성'}</strong>
                </div>
                <div className="summary-row">
                  <span>최근 게시</span>
                  <strong>{xAutopostState.lastPostedAt ? formatDate(xAutopostState.lastPostedAt) : '없음'}</strong>
                </div>
                <div className="summary-row">
                  <span>다음 생성</span>
                  <strong>{xAutopostState.nextGenerationAt ? formatDate(xAutopostState.nextGenerationAt) : '중지됨'}</strong>
                </div>
                <div className="summary-row">
                  <span>다음 발행</span>
                  <strong>{xAutopostState.nextPublishAt ? formatDate(xAutopostState.nextPublishAt) : '없음'}</strong>
                </div>
              </div>
              <p className="settings-card__lead">{xPublisherStatus.detail}</p>
              <div className="badge-row">
                <span className="chip chip--soft">1시간 {xAutopostMetrics.postedCount1h}/{xAutopostSettings.maxPerHour}</span>
                <span className="chip chip--soft">24시간 {xAutopostMetrics.postedCount24h}/{xAutopostSettings.maxPerDay}</span>
                <span className="chip chip--soft">실패 {xAutopostMetrics.failedCount}</span>
              </div>
              <div className="badge-row">
                <button className="primary-button" disabled={postActionLoading} onClick={() => void executeCreateDraftFromSignal()} type="button">
                  현재 카테고리로 초안 채우기
                </button>
                <button className="ghost-button" disabled={postActionLoading} onClick={() => void loadXAutopost()} type="button">
                  큐 새로고침
                </button>
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-card__header">
                <h2>자동 게시 설정</h2>
                <span className="chip chip--soft">{xSettingsDraft.generationModel}</span>
              </div>
              <div className="auto-post-settings-grid">
                <label className="field">
                  <span>모드</span>
                  <select value={xSettingsDraft.mode} onChange={(event) => setXSettingsDraft((current) => ({ ...current, mode: event.target.value as XAutopostSettings['mode'] }))}>
                    <option value="dry-run">dry-run</option>
                    <option value="approval">approval</option>
                    <option value="auto">auto</option>
                  </select>
                </label>
                <label className="field">
                  <span>시간당 최대</span>
                  <input type="number" min={1} max={24} value={xSettingsDraft.maxPerHour} onChange={(event) => setXSettingsDraft((current) => ({ ...current, maxPerHour: Number(event.target.value || current.maxPerHour) }))} />
                </label>
                <label className="field">
                  <span>최소 간격(분)</span>
                  <input type="number" min={1} value={xSettingsDraft.minIntervalMinutes} onChange={(event) => setXSettingsDraft((current) => ({ ...current, minIntervalMinutes: Number(event.target.value || current.minIntervalMinutes) }))} />
                </label>
                <label className="field">
                  <span>일일 최대</span>
                  <input type="number" min={1} value={xSettingsDraft.maxPerDay} onChange={(event) => setXSettingsDraft((current) => ({ ...current, maxPerDay: Number(event.target.value || current.maxPerDay) }))} />
                </label>
                <label className="field">
                  <span>최소 novelty</span>
                  <input type="number" step="0.01" min={0} max={1} value={xSettingsDraft.minNoveltyScore} onChange={(event) => setXSettingsDraft((current) => ({ ...current, minNoveltyScore: Number(event.target.value || current.minNoveltyScore) }))} />
                </label>
                <label className="field">
                  <span>생성 모델</span>
                  <input value={xSettingsDraft.generationModel} onChange={(event) => setXSettingsDraft((current) => ({ ...current, generationModel: event.target.value }))} />
                </label>
              </div>
              <div className="badge-row">
                <button className="primary-button" disabled={postActionLoading} onClick={() => void executeSaveXSettings()} type="button">
                  설정 저장
                </button>
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-card__header">
                <h2>큐 목록</h2>
                <span className="chip chip--soft">{filteredDrafts.length}개</span>
              </div>
              {filteredDrafts.length > 0 ? (
                <div className="x-autopost-queue">
                  {filteredDrafts.map((item) => (
                    <button key={item.id} className={`auto-post-card ${selectedDraftId === item.id ? 'is-active' : ''}`} onClick={() => setSelectedDraftId(item.id)} type="button">
                      <div className="auto-post-card__body">
                        <div className="card-topline">
                          <span className="chip chip--soft">{item.sourceLabel || item.sourceType}</span>
                          <small>{formatDate(item.updatedAt)}</small>
                        </div>
                        <strong>{item.sourceTitle}</strong>
                        <p>{compactText(item.generatedText || item.sourceSummary, 140)}</p>
                        <div className="badge-row">
                          <span className="chip chip--soft">{draftStatusLabel(item.status)}</span>
                          <span className="chip chip--soft">novelty {item.noveltyScore.toFixed(2)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  description="실시간 시그널에서 초안을 만들거나 현재 카테고리로 큐를 채우면 여기에 쌓입니다."
                  action="지금 초안 만들기"
                  onAction={() => void executeCreateDraftFromSignal()}
                  title="X 게시 큐가 비어 있습니다"
                />
              )}
            </section>
          </div>

          <div className="x-autopost-detail">
            {actionMessage ? (
              <div className="status-banner status-banner--info">
                <Icon name="spark" size={16} />
                <span>{actionMessage}</span>
              </div>
            ) : null}
            {selectedDraft ? (
              <>
                <section className="panel-card">
                  <div className="panel-card__header">
                    <div>
                      <h2>{selectedDraft.sourceTitle}</h2>
                      <p className="settings-card__lead">{selectedDraft.sourceLabel} / {selectedDraft.category} / novelty {selectedDraft.noveltyScore.toFixed(2)}</p>
                    </div>
                    <div className="badge-row">
                      <span className="chip chip--soft">{draftStatusLabel(selectedDraft.status)}</span>
                      {selectedDraft.scheduledAt ? <span className="chip chip--soft">예약 {formatDate(selectedDraft.scheduledAt)}</span> : null}
                      {selectedDraft.postedAt ? <span className="chip chip--soft">게시 {formatDate(selectedDraft.postedAt)}</span> : null}
                    </div>
                  </div>
                  <div className="badge-row">
                    {selectedDraft.status === 'draft' ? (
                      <button className="primary-button" disabled={postActionLoading} onClick={() => void executeApproveDraft(selectedDraft.id)} type="button">
                        승인
                      </button>
                    ) : null}
                    {selectedDraft.status !== 'posted' && selectedDraft.status !== 'skipped' ? (
                      <button className="ghost-button" disabled={postActionLoading} onClick={() => void executePublishDraft(selectedDraft.id)} type="button">
                        지금 게시
                      </button>
                    ) : null}
                    {selectedDraft.status !== 'posted' ? (
                      <button className="ghost-button" disabled={postActionLoading} onClick={() => void executeRejectDraft(selectedDraft.id)} type="button">
                        제외
                      </button>
                    ) : null}
                    {selectedDraft.sourceUrl ? (
                      <button className="ghost-button" onClick={() => window.open(selectedDraft.sourceUrl, '_blank', 'noopener,noreferrer')} type="button">
                        원문 열기
                      </button>
                    ) : null}
                  </div>
                  <div className="summary-row summary-row--soft">
                    <span>topic hash</span>
                    <strong>{selectedDraft.topicHash.slice(0, 16)}…</strong>
                  </div>
                  {selectedDraft.errorReason ? (
                    <div className="status-banner status-banner--warning">
                      <Icon name="warning" size={16} />
                      <span>{selectedDraft.errorReason}</span>
                    </div>
                  ) : null}
                </section>

                <section className="panel-card">
                  <div className="panel-card__header">
                    <h2>게시 초안</h2>
                    <span className="chip chip--soft">{selectedDraft.generationModel}</span>
                  </div>
                  <pre className="x-autopost-preview">{selectedDraft.generatedText}</pre>
                </section>

                <section className="panel-card">
                  <div className="panel-card__header">
                    <h2>최근 로그</h2>
                    <span className="chip chip--soft">{xAutopostLogs.length}개</span>
                  </div>
                  <div className="run-card__logs">
                    {xAutopostLogs.slice(0, 16).map((log) => (
                      <div key={log.id} className={`run-log run-log--${log.level === 'warning' ? 'error' : log.level}`}>
                        <span>{formatDate(log.createdAt)}</span>
                        <p>{log.message}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <EmptyState
                description="왼쪽 큐에서 초안을 선택하면 생성문, 예약 상태, 게시 결과, 로그를 볼 수 있습니다."
                title="초안을 선택해 주세요"
              />
            )}
          </div>
        </div>
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
