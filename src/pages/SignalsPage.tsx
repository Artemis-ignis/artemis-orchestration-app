import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { signalCategories, type PageId } from '../crewData'
import {
  DisclosureSection,
  EmptyState,
  PageIntro,
  SearchField,
} from '../crewPageShared'
import {
  clipUiText,
  formatDate,
  formatRelative,
  hasHangulText,
  preferLocalizedPreview,
  providerLabel,
  signalSourceLabel,
  sanitizeOperatorMessage,
} from '../crewPageHelpers'
import { AutoPostArticle } from '../features/autoPosts/AutoPostArticle'
import { PublisherOperationsPanel } from '../features/publisher/PublisherOperationsPanel'
import {
  defaultPublisherMetrics,
  defaultPublisherRuntimeStatus,
  defaultPublisherSettings,
  defaultPublisherState,
} from '../features/publisher/publisherUi'
import { Icon } from '../icons'
import {
  approvePublisherDraft,
  exportAutoPost,
  fetchAutoPostDetail,
  fetchAutoPostState,
  fetchAutoPosts,
  fetchPublisherState,
  fetchSignalsFeed,
  publishPublisherDraftNow,
  rejectPublisherDraft,
  regenerateAutoPost,
  revealAutoPostFolder,
  runPublisher,
  runAutoPosts,
  type SignalFeedItem,
  updateAutoPostSettings,
  updatePublisherSettings,
} from '../lib/modelClient'
import { useArtemisApp } from '../state/context'
import type {
  AutoPostSettings,
  GeneratedPost,
  GeneratedPostSummary,
  SchedulerState,
} from '../types/autoPosts'
import type {
  PublisherDossier,
  PublisherDraft,
  PublisherSettings,
  PublisherState,
  PublisherLog,
  PublisherRuntimeStatus,
  PublisherMetrics,
  PublishedPost,
} from '../types/publisher'

type SignalsTab = 'feed' | 'posts' | 'publisher'

const SIGNALS_TAB_LABEL: Record<SignalsTab, string> = {
  feed: '실시간',
  publisher: '게시 큐',
  posts: '생성 글',
}

const SIGNALS_SEARCH_PLACEHOLDER: Record<SignalsTab, string> = {
  feed: '시그널 검색',
  publisher: '초안, 게시물 검색',
  posts: '생성 글 검색',
}

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

function koreanFirstText(value: string, maxLength = 220, fallback = '') {
  const clipped = clipUiText(preferLocalizedPreview(value), maxLength)
  if (hasHangulText(clipped)) {
    return clipped
  }
  return fallback
}

function postListPreview(item: GeneratedPostSummary) {
  return (
    koreanFirstText(item.threeLineSummary.find((line) => hasHangulText(line)) || item.previewText, 140) ||
    '본문 요약은 상세에서 확인해 주세요.'
  )
}

function SafePreviewImage({
  src,
  alt,
  className,
  fallback,
}: {
  src?: string | null
  alt: string
  className: string
  fallback: ReactNode
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const hasError = !src || failedSrc === src

  if (hasError) {
    return <>{fallback}</>
  }

  return <img alt={alt} className={className} onError={() => setFailedSrc(src)} src={src} />
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
  const [xQueue, setXQueue] = useState<PublisherDraft[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [xAutopostSettings, setXAutopostSettings] = useState<PublisherSettings>(defaultPublisherSettings)
  const [xSettingsDraft, setXSettingsDraft] = useState<PublisherSettings>(defaultPublisherSettings)
  const [xAutopostState, setXAutopostState] = useState<PublisherState>(defaultPublisherState)
  const [xAutopostLogs, setXAutopostLogs] = useState<PublisherLog[]>([])
  const [xAutopostMetrics, setXAutopostMetrics] = useState<PublisherMetrics>(defaultPublisherMetrics)
  const [xPublisherStatus, setXPublisherStatus] = useState<PublisherRuntimeStatus>(defaultPublisherRuntimeStatus)
  const [publishedItems, setPublishedItems] = useState<PublishedPost[]>([])
  const [publisherDossiers, setPublisherDossiers] = useState<PublisherDossier[]>([])
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null)
  const [selectedPublishedId, setSelectedPublishedId] = useState<string | null>(null)
  const [publisherProviderFilter, setPublisherProviderFilter] = useState('all')
  const [publisherStatusFilter, setPublisherStatusFilter] = useState('all')

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
            sanitizeOperatorMessage(
              nextError instanceof Error ? nextError.message : '',
              '시그널을 불러오지 못했습니다.',
            ),
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
            sanitizeOperatorMessage(
              nextError instanceof Error ? nextError.message : '',
              '자동 생성 게시글을 불러오지 못했습니다.',
            ),
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
    async ({
      silent = false,
      focusDraftId,
      focusDossierId,
      focusPublishedId,
    }: {
      silent?: boolean
      focusDraftId?: string | null
      focusDossierId?: string | null
      focusPublishedId?: string | null
    } = {}) => {
      if (!silent) {
        setPostActionLoading(true)
        setActionMessage(null)
      }

      try {
        const response = await fetchPublisherState(bridgeUrl)
        setXQueue(response.queue)
        setXAutopostSettings(response.settings)
        setXSettingsDraft(response.settings)
        setXAutopostState(response.state)
        setXAutopostLogs(response.logs)
        setXAutopostMetrics(response.metrics)
        setPublishedItems(response.published)
        setPublisherDossiers(response.dossiers)
        setXPublisherStatus(
          response.publishers.find((item) => item.target === 'internal') ??
            response.publishers[0] ??
            defaultPublisherRuntimeStatus(),
        )

        const nextSelectedDraftId = focusDraftId ?? selectedDraftId ?? response.queue[0]?.id ?? null
        const nextSelectedPublishedId =
          focusPublishedId ??
          (nextSelectedDraftId ? null : selectedPublishedId ?? response.published[0]?.id ?? null)
        const nextSelectedDossierId =
          focusDossierId ??
          (nextSelectedDraftId || nextSelectedPublishedId ? null : selectedDossierId ?? response.dossiers[0]?.id ?? null)

        setSelectedDraftId(nextSelectedDraftId)
        setSelectedPublishedId(nextSelectedPublishedId)
        setSelectedDossierId(nextSelectedDossierId)
      } catch (nextError) {
        if (!silent) {
          setActionMessage(
            sanitizeOperatorMessage(
              nextError instanceof Error ? nextError.message : '',
              '게시 큐 상태를 불러오지 못했습니다.',
            ),
          )
        }
      } finally {
        if (!silent) {
          setPostActionLoading(false)
        }
      }
    },
    [bridgeUrl, selectedDossierId, selectedDraftId, selectedPublishedId],
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
          sanitizeOperatorMessage(
            nextError instanceof Error ? nextError.message : '',
            '게시글 상세를 불러오지 못했습니다.',
          ),
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
  const selectedPostLeadText = useMemo(() => {
    if (!selectedPost) {
      return ''
    }

    return (
      selectedPost.subtitleLines.find((line) => hasHangulText(line)) ||
      koreanFirstText(selectedPost.lead, 220, '공개된 정보 기준으로 정리한 한국어 브리핑입니다.')
    )
  }, [selectedPost])
  const selectedPostSummaryPoints = useMemo(() => {
    if (!selectedPost) {
      return []
    }

    const points = selectedPost.threeLineSummary
      .map((line) => koreanFirstText(line, 140))
      .filter(Boolean)

    if (points.length > 0) {
      return points
    }

    const fallback = koreanFirstText(
      selectedPost.plainTextSummary || selectedPost.lead,
      260,
      '공개된 제목과 메타데이터를 바탕으로 재구성한 한국어 브리핑입니다.',
    )

    return fallback ? [fallback] : []
  }, [selectedPost])
  const selectedPostBodySummary = useMemo(() => {
    if (!selectedPost) {
      return ''
    }

    return koreanFirstText(
      selectedPost.plainTextSummary || selectedPost.lead,
      420,
      '공개된 제목과 메타데이터를 바탕으로 재구성한 한국어 브리핑입니다.',
    )
  }, [selectedPost])
  const filteredDrafts = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    return xQueue.filter((item) => {
      if (publisherProviderFilter !== 'all' && item.provider !== publisherProviderFilter) {
        return false
      }
      if (publisherStatusFilter !== 'all' && item.status !== publisherStatusFilter) {
        return false
      }
      if (!keyword) {
        return true
      }

      return `${item.sourceTitle} ${item.generatedText} ${item.sourceLabel} ${item.category}`
        .toLowerCase()
        .includes(keyword)
    })
  }, [deferredQuery, publisherProviderFilter, publisherStatusFilter, xQueue])

  const filteredPublishedItems = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    return publishedItems.filter((item) => {
      if (publisherProviderFilter !== 'all' && item.provider !== publisherProviderFilter) {
        return false
      }
      if (!keyword) {
        return true
      }
      return `${item.title} ${item.excerpt} ${item.provider} ${item.category ?? ''}`.toLowerCase().includes(keyword)
    })
  }, [deferredQuery, publishedItems, publisherProviderFilter])

  const filteredDossiers = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    return publisherDossiers.filter((item) => {
      if (
        publisherProviderFilter !== 'all' &&
        !item.sourceItems.some((source) => source.provider === publisherProviderFilter)
      ) {
        return false
      }

      if (!keyword) {
        return true
      }

      return `${item.title} ${item.summary} ${item.lead} ${item.providerLabels.join(' ')} ${item.tags.join(' ')}`
        .toLowerCase()
        .includes(keyword)
    })
  }, [deferredQuery, publisherDossiers, publisherProviderFilter])

  const publisherStatuses = useMemo(() => {
    if (xAutopostMetrics.publishers.length > 0) {
      return xAutopostMetrics.publishers
    }

    return [xPublisherStatus]
  }, [xAutopostMetrics.publishers, xPublisherStatus])

  const internalPublisherStatus =
    publisherStatuses.find((item) => item.target === 'internal') ??
    xPublisherStatus

  const xCrossPostStatus =
    publisherStatuses.find((item) => item.target === 'x') ??
    null

  const providerOptions = useMemo(() => {
    const next = new Map<string, string>()

    for (const stat of xAutopostState.providerStats) {
      next.set(stat.provider, stat.label || providerLabel(stat.provider))
    }

    for (const item of xQueue) {
      if (!next.has(item.provider)) {
        next.set(item.provider, item.sourceLabel || providerLabel(item.provider))
      }
    }

    for (const item of publishedItems) {
      if (!next.has(item.provider)) {
        next.set(item.provider, item.sourceLabel || providerLabel(item.provider))
      }
    }

    return Array.from(next.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ko'))
  }, [publishedItems, xAutopostState.providerStats, xQueue])

  const selectedDraft =
    filteredDrafts.find((item) => item.id === selectedDraftId) ??
    xQueue.find((item) => item.id === selectedDraftId) ??
    null

  const selectedPublished =
    filteredPublishedItems.find((item) => item.id === selectedPublishedId) ??
    publishedItems.find((item) => item.id === selectedPublishedId) ??
    null

  const selectedDossier =
    filteredDossiers.find((item) => item.id === selectedDossierId) ??
    publisherDossiers.find((item) => item.id === selectedDossierId) ??
    null

  const selectedDraftLogs = useMemo(() => {
    if (!selectedDraft) {
      return xAutopostLogs.slice(0, 16)
    }

    const scoped = xAutopostLogs.filter((item) => item.draftId === selectedDraft.id)
    return (scoped.length > 0 ? scoped : xAutopostLogs).slice(0, 16)
  }, [selectedDraft, xAutopostLogs])

  useEffect(() => {
    if (!selectedDraftId && filteredDrafts[0]) {
      setSelectedDraftId(filteredDrafts[0].id)
      setSelectedDossierId(null)
      return
    }

    if (selectedDraftId && !xQueue.some((item) => item.id === selectedDraftId)) {
      setSelectedDraftId(filteredDrafts[0]?.id ?? null)
    }
  }, [filteredDrafts, selectedDraftId, xQueue])

  useEffect(() => {
    if (selectedDraftId || selectedDossierId) {
      return
    }

    if (!selectedPublishedId && filteredPublishedItems[0]) {
      setSelectedPublishedId(filteredPublishedItems[0].id)
      return
    }

    if (selectedPublishedId && !publishedItems.some((item) => item.id === selectedPublishedId)) {
      setSelectedPublishedId(filteredPublishedItems[0]?.id ?? null)
    }
  }, [filteredPublishedItems, publishedItems, selectedDossierId, selectedDraftId, selectedPublishedId])

  useEffect(() => {
    if (selectedDraftId || selectedPublishedId) {
      return
    }

    if (!selectedDossierId && filteredDossiers[0]) {
      setSelectedDossierId(filteredDossiers[0].id)
      return
    }

    if (selectedDossierId && !publisherDossiers.some((item) => item.id === selectedDossierId)) {
      setSelectedDossierId(filteredDossiers[0]?.id ?? null)
    }
  }, [filteredDossiers, publisherDossiers, selectedDossierId, selectedDraftId, selectedPublishedId])

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
        sanitizeOperatorMessage(
          nextError instanceof Error ? nextError.message : '',
          '수동 실행에 실패했습니다.',
        ),
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
        sanitizeOperatorMessage(nextError instanceof Error ? nextError.message : '', '재생성에 실패했습니다.'),
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
        sanitizeOperatorMessage(
          nextError instanceof Error ? nextError.message : '',
          'HTML 내보내기에 실패했습니다.',
        ),
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
        sanitizeOperatorMessage(nextError instanceof Error ? nextError.message : '', '폴더 열기에 실패했습니다.'),
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
        sanitizeOperatorMessage(nextError instanceof Error ? nextError.message : '', '설정 저장에 실패했습니다.'),
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
      const response = await runPublisher({
        bridgeUrl,
        limit: seedItem ? 1 : 2,
        force: false,
        seedItems: seedItem ? [seedItem] : [],
        reason: seedItem ? 'signal-seed' : 'manual',
      })
      setActionMessage(
        response.createdCount > 0
          ? `${response.createdCount}개의 초안을 큐에 추가했습니다.`
          : response.skippedCount > 0
            ? `${response.skippedCount}개의 후보를 기준에 따라 제외했습니다.`
            : '새로 큐에 넣을 초안이 없었습니다.',
      )
      await loadXAutopost({ focusDraftId: response.items[0]?.id ?? selectedDraftId ?? null })
      setActiveTab('publisher')
    } catch (nextError) {
      setActionMessage(
        sanitizeOperatorMessage(nextError instanceof Error ? nextError.message : '', '초안 생성에 실패했습니다.'),
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeSaveXSettings = async () => {
    setPostActionLoading(true)
    setActionMessage(null)

    try {
      const response = await updatePublisherSettings({
        bridgeUrl,
        patch: xSettingsDraft,
      })
      setXAutopostSettings(response.settings)
      setXSettingsDraft(response.settings)
      setXAutopostState(response.state)
      setXQueue(response.queue)
      setXAutopostLogs(response.logs)
      setXAutopostMetrics(response.metrics)
      setPublishedItems(response.published)
      setXPublisherStatus(
        response.publishers.find((item) => item.target === 'internal') ??
          response.publishers[0] ??
          defaultPublisherRuntimeStatus(),
      )
      setActionMessage('게시 큐 설정을 저장했습니다.')
    } catch (nextError) {
      setActionMessage(
        sanitizeOperatorMessage(nextError instanceof Error ? nextError.message : '', '게시 큐 설정 저장에 실패했습니다.'),
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeApproveDraft = async (draftId: string) => {
    setPostActionLoading(true)
    setActionMessage(null)
    try {
      const response = await approvePublisherDraft(bridgeUrl, draftId)
      setActionMessage(
        response.item.scheduledAt
          ? `초안을 승인했고 다음 발행 슬롯을 배정했습니다: ${formatDate(response.item.scheduledAt)}`
          : '초안을 승인했습니다.',
      )
      await loadXAutopost({ focusDraftId: response.item.id })
    } catch (nextError) {
      setActionMessage(
        sanitizeOperatorMessage(nextError instanceof Error ? nextError.message : '', '초안 승인에 실패했습니다.'),
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  const executeRejectDraft = async (draftId: string) => {
    setPostActionLoading(true)
    setActionMessage(null)
    try {
      const response = await rejectPublisherDraft(bridgeUrl, draftId)
      setActionMessage(`초안을 큐에서 제외했습니다: ${response.item.sourceTitle}`)
      await loadXAutopost({ focusDraftId: response.item.id })
    } catch (nextError) {
      setActionMessage(
        sanitizeOperatorMessage(nextError instanceof Error ? nextError.message : '', '초안 거절에 실패했습니다.'),
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  const executePublishDraft = async (draftId: string) => {
    setPostActionLoading(true)
    setActionMessage(null)
    try {
      const response = await publishPublisherDraftNow(
        bridgeUrl,
        draftId,
        xAutopostSettings.mode === 'dry-run',
      )
      setActionMessage(
        response.item.status === 'scheduled' && response.detail
          ? response.detail
          : response.simulated
          ? '실제 인증이 없어 시험 모드로 처리했습니다.'
          : '게시를 완료했습니다.',
      )
      await loadXAutopost({
        focusDraftId: response.item.status === 'published' ? null : response.item.id,
        focusPublishedId:
          response.item.status === 'published' ? response.item.internalPostId ?? null : null,
      })
    } catch (nextError) {
      setActionMessage(
        sanitizeOperatorMessage(nextError instanceof Error ? nextError.message : '', '즉시 게시에 실패했습니다.'),
      )
    } finally {
      setPostActionLoading(false)
    }
  }

  return (
    <section className="page signals-page">
      <PageIntro
        description="실시간 시그널, 게시 큐, 생성 글을 한곳에서 확인합니다."
        icon="signals"
        title="시그널"
        trailing={
          <div className="header-actions">
            <span className="subtle-label">
              {activeTab === 'feed'
                ? generatedAt
                  ? `갱신 ${formatDate(generatedAt)}`
                  : '피드 불러오는 중'
                : activeTab === 'publisher'
                  ? xAutopostState.inProgress
                    ? '게시 큐 실행 중'
                    : xAutopostState.lastPublishedAt
                      ? `최근 게시 ${formatDate(xAutopostState.lastPublishedAt)}`
                      : '대기 중'
                : schedulerState.inProgress
                  ? '생성 중'
                  : schedulerState.lastSuccessAt
                    ? `최근 생성 ${formatDate(schedulerState.lastSuccessAt)}`
                    : '생성 상태 불러오는 중'}
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

      <div className="signals-toolbar signals-toolbar--primary">
        <div className="chip-wrap signals-tabs">
          <button
            className={`chip ${activeTab === 'feed' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('feed')}
            type="button"
          >
            {SIGNALS_TAB_LABEL.feed}
          </button>
          <button
            className={`chip ${activeTab === 'publisher' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('publisher')}
            type="button"
          >
            {SIGNALS_TAB_LABEL.publisher}
          </button>
          <button
            className={`chip ${activeTab === 'posts' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('posts')}
            type="button"
          >
            {SIGNALS_TAB_LABEL.posts}
          </button>
        </div>
        <div className="signals-toolbar__actions signals-toolbar__actions--search">
          <SearchField
            onChange={setQuery}
            placeholder={SIGNALS_SEARCH_PLACEHOLDER[activeTab]}
            value={query}
          />
        </div>
      </div>

      {activeTab === 'feed' ? (
        <>
          <div className="signals-toolbar signals-toolbar--secondary">
            <div className="chip-wrap signals-categoryRail">
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
                  글 생성
                </button>
              </div>
            </div>

          <section className="panel-card panel-card--muted signals-source-strip signals-source-strip--overview">
              <div className="badge-row">
                {sourceSummary.map(([label, count]) => (
                  <span key={label} className="chip chip--soft">
                    {label} {count}건
                  </span>
                ))}
              </div>
              <p>원문 피드만 빠르게 확인하는 탭입니다.</p>
            </section>

          {feedError ? (
            <div className="status-banner status-banner--error">
              <Icon name="warning" size={16} />
              <span>{feedError}</span>
            </div>
          ) : null}

          {feedLoading && feed.length === 0 ? (
            <div className="panel-card panel-card--muted signals-loadingCard">실시간 시그널을 불러오는 중입니다...</div>
          ) : filteredFeed.length > 0 ? (
            <div className="signals-feed signals-feed--single signals-feed-list">
              {filteredFeed.map((item) => {
                const translationLabel =
                  item.translationSource === 'codex'
                    ? '기본 번역'
                    : item.translationSource === 'ollama'
                      ? '로컬 번역'
                      : item.translationSource === 'google-gtx'
                        ? '실시간 번역'
                        : '원문'

                return (
                  <article key={item.id} className="signal-card signal-card--feed signals-feed-card">
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

                    <div className="badge-row signal-card__actions">
                      <button
                        className="ghost-button"
                        onClick={() => {
                          setComposerText(buildSignalChatPrompt(item))
                          onNavigate('chat')
                        }}
                        type="button"
                      >
                        채팅
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => setActiveTab('posts')}
                        type="button"
                      >
                        생성 글
                      </button>
                      <button
                        className="ghost-button"
                        disabled={postActionLoading}
                        onClick={() => void executeCreateDraftFromSignal(item)}
                        type="button"
                      >
                        큐에 추가
                      </button>
                      <button
                        className="primary-button"
                        onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                        type="button"
                      >
                        원문
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
        <PublisherOperationsPanel
          actionMessage={actionMessage}
          dossiers={filteredDossiers}
          filteredDrafts={filteredDrafts}
          filteredPublishedItems={filteredPublishedItems}
          internalPublisherStatus={internalPublisherStatus}
          isWorking={postActionLoading}
          onApproveDraft={executeApproveDraft}
          onCreateDraft={executeCreateDraftFromSignal}
          onPublishDraft={executePublishDraft}
          onRefresh={loadXAutopost}
          onRejectDraft={executeRejectDraft}
          onSaveSettings={executeSaveXSettings}
          onSelectDossier={(id) => {
            setSelectedDossierId(id)
            setSelectedDraftId(null)
            setSelectedPublishedId(null)
          }}
          onSelectDraft={(id) => {
            setSelectedDraftId(id)
            setSelectedDossierId(null)
            setSelectedPublishedId(null)
          }}
          onSelectPublished={(id) => {
            setSelectedPublishedId(id)
            setSelectedDossierId(null)
            setSelectedDraftId(null)
          }}
          providerFilter={publisherProviderFilter}
          providerOptions={providerOptions}
          publisherMetrics={xAutopostMetrics}
          publisherSettings={xAutopostSettings}
          publisherSettingsDraft={xSettingsDraft}
          publisherState={xAutopostState}
          selectedDossier={selectedDossier}
          selectedDossierId={selectedDossierId}
          selectedDraft={selectedDraft}
          selectedDraftId={selectedDraftId}
          selectedDraftLogs={selectedDraftLogs}
          selectedPublished={selectedPublished}
          selectedPublishedId={selectedPublishedId}
          setProviderFilter={setPublisherProviderFilter}
          setPublisherSettingsDraft={setXSettingsDraft}
          setStatusFilter={setPublisherStatusFilter}
          statusFilter={publisherStatusFilter}
          xCrossPostStatus={xCrossPostStatus}
        />
      ) : (
        <div className="auto-posts-shell signals-ops-shell signals-ops-shell--posts">
          <div className="auto-posts-side signals-ops-side signals-posts-rail">
            <section className="panel-card signals-panel signals-panel--overview">
              <div className="panel-card__header">
                <h2>스케줄러 상태</h2>
                <span className={`chip ${schedulerState.inProgress ? 'is-active' : 'chip--soft'}`}>
                  {schedulerState.inProgress ? '실행 중' : autoPostSettings.enabled ? '활성' : '비활성'}
                </span>
              </div>
              <div className="stack-grid stack-grid--compact signals-posts-summary">
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
                  <span>{sanitizeOperatorMessage(schedulerState.lastError, '스케줄러 상태를 확인할 수 없습니다.')}</span>
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

            <DisclosureSection
              className="disclosure--soft signals-posts-settings-disclosure"
              summary={`${autoPostSettings.generationModel} · 최대 ${settingsDraft.topK}개`}
              title="생성 설정"
            >
              <section className="panel-card signals-panel signals-panel--settingsCompact">
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
                    <span>스크린샷 보조</span>
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
            </DisclosureSection>

            <section className="panel-card signals-panel signals-panel--list">
              <div className="panel-card__header">
                <h2>목록</h2>
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
                      <SafePreviewImage
                        alt=""
                        className="auto-post-card__thumb"
                        fallback={
                          <div className="auto-post-card__thumb auto-post-card__thumb--empty">{item.category} 요약</div>
                        }
                        src={item.thumbnail}
                      />
                      <div className="auto-post-card__body">
                        <div className="card-topline">
                          <span className="chip chip--soft">{item.category}</span>
                          <small>{formatDate(item.createdAt)}</small>
                        </div>
                        <strong>{item.title}</strong>
                        <p>{postListPreview(item)}</p>
                        <div className="badge-row">
                          <span className="chip chip--soft">점수 {Math.round(item.topicScore)}</span>
                          <span className="chip chip--soft">{postStatusLabel(item.status)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : postsLoading ? (
                <div className="panel-card panel-card--muted signals-loadingCard">자동 생성 게시글을 불러오는 중입니다...</div>
              ) : (
                <EmptyState
                  description="아직 저장된 자동 생성 게시글이 없습니다. 지금 실행을 눌러 첫 배치를 생성해 주세요."
                  action="지금 실행"
                  onAction={() => void executeRunNow()}
                  title="빈 게시글 저장소"
                />
              )}
            </section>
          </div>

          <div className="auto-posts-detail signals-ops-detail signals-posts-workspace">
            {actionMessage ? (
              <div className="status-banner status-banner--info">
                <Icon name="spark" size={16} />
                <span>{actionMessage}</span>
              </div>
            ) : null}
            {selectedPost ? (
              <>
                <section className="panel-card signals-post-hero">
                  <div className="panel-card__header">
                    <div>
                      <h2>{selectedPost.title}</h2>
                      <p className="settings-card__lead">
                        {selectedPostLeadText}
                      </p>
                    </div>
                    <div className="badge-row signals-post-hero__badges">
                      <span className="chip chip--soft">{selectedPost.category}</span>
                      <span className="chip chip--soft">점수 {Math.round(selectedPost.topicScore)}</span>
                      <span className={`chip ${selectedPost.status === 'ready' ? 'is-active' : 'chip--soft'}`}>
                        {postStatusLabel(selectedPost.status)}
                      </span>
                    </div>
                  </div>

                  <div className="badge-row signals-post-hero__actions">
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

                  <div className="signals-post-hero__facts">
                    <div className="summary-row summary-row--soft">
                      <span>저장 위치</span>
                      <strong>{selectedPost.workspacePath}</strong>
                    </div>
                    <div className="summary-row summary-row--soft">
                      <span>생성 모델</span>
                      <strong>{selectedPost.generationModel}</strong>
                    </div>
                  </div>
                </section>

                <section className="panel-card signals-post-body">
                  <div className="panel-card__header">
                    <h2>핵심 정리</h2>
                    <span className="chip chip--soft">
                      {selectedPostSummary ? formatDate(selectedPostSummary.updatedAt) : formatDate(selectedPost.updatedAt)}
                    </span>
                  </div>
                  <div className="signals-post-body__summary">
                    {selectedPostBodySummary ? <p className="signals-post-body__summaryLead">{selectedPostBodySummary}</p> : null}
                    {selectedPostSummaryPoints.length > 0 ? (
                      <ul className="signals-post-body__summaryList">
                        {selectedPostSummaryPoints.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <DisclosureSection
                    className="disclosure--soft signals-post-body__disclosure"
                    summary="영문 원문 또는 혼합 초안 보기"
                    title="원문 초안"
                  >
                    <AutoPostArticle html={selectedPost.html} title={selectedPost.title} />
                  </DisclosureSection>
                </section>

                <div className="auto-post-detail-grid">
                  <section className="panel-card signals-post-support">
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
                                <SafePreviewImage
                                  alt={item.title}
                                  className="auto-post-media-thumb"
                                  fallback={
                                    <div className="auto-post-card__thumb auto-post-card__thumb--empty">
                                      미리보기를 불러오지 못했습니다
                                    </div>
                                  }
                                  src={item.previewUrl}
                                />
                              )
                            ) : null}
                            <strong>{item.title}</strong>
                            <p>{item.description || providerLabel(item.provider) || item.kind}</p>
                            <div className="badge-row">
                              <span className="chip chip--soft">{item.kind}</span>
                              <span className="chip chip--soft">{providerLabel(item.provider || 'media')}</span>
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

                  <section className="panel-card signals-post-support">
                    <div className="panel-card__header">
                      <h2>원문과 로그</h2>
                      <span className="chip chip--soft">{selectedPost.sourceItems.length}개 출처</span>
                    </div>

                    <div className="stack-grid stack-grid--compact signals-post-sources">
                      {selectedPost.sourceItems.map((item) => (
                        <article key={item.id} className="panel-card panel-card--muted">
                          <div className="card-topline">
                            <span className="chip chip--soft">{item.sourceLabel}</span>
                            <small>{formatDate(item.publishedAt)}</small>
                          </div>
                          <strong>{item.title}</strong>
                          <p>{koreanFirstText(item.summary, 180, '원문 요약은 원문 열기에서 확인할 수 있습니다.')}</p>
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

