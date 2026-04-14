import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { signalCategories, type PageId } from '../crewData'
import {
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
import { fetchSignalsFeed, type SignalFeedItem } from '../lib/modelClient'
import { useArtemisApp } from '../state/context'

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

export function SignalsPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { setComposerText, state } = useArtemisApp()
  const [category, setCategory] = useState<(typeof signalCategories)[number]>('전체')
  const [query, setQuery] = useState('')
  const [feed, setFeed] = useState<SignalFeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const loadFeed = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }

      try {
        const response = await fetchSignalsFeed({
          bridgeUrl: state.settings.bridgeUrl,
          category,
        })
        setFeed(response.items)
        setGeneratedAt(response.generatedAt)
      } catch (nextError) {
        if (!silent) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : '시그널을 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [category, state.settings.bridgeUrl],
  )

  useEffect(() => {
    void loadFeed()
  }, [loadFeed])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadFeed({ silent: true })
    }, 90_000)

    return () => window.clearInterval(timer)
  }, [loadFeed])

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

  const hasPendingTranslations = useMemo(
    () => filteredFeed.some((item) => item.translationSource === 'original'),
    [filteredFeed],
  )

  const sourceSummary = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of feed) {
      const label = signalSourceLabel(item.source)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }

    return Array.from(counts.entries())
  }, [feed])

  return (
    <section className="page">
      <PageIntro
        description="Hacker News, GitHub, arXiv 공개 피드를 직접 읽어서 시그널로 정리합니다. 새로고침 시 최신 공개 피드를 다시 불러옵니다."
        icon="signals"
        title="시그널"
        trailing={
          <div className="header-actions">
            <span className="subtle-label">
              {hasPendingTranslations
                ? '일부 항목은 원문 우선으로 표시됩니다.'
                : generatedAt
                  ? `마지막 갱신 ${formatDate(generatedAt)}`
                  : '실시간 피드를 준비하고 있습니다.'}
            </span>
            <button className="ghost-button" onClick={() => void loadFeed()} type="button">
              새로고침
            </button>
          </div>
        }
      />

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
          <SearchField onChange={setQuery} placeholder="시그널 검색..." value={query} />
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
          AI가 꾸민 카드가 아니라 공개 원문 피드만 사용합니다. 번역이 준비되지 않으면 원문
          요약을 그대로 표시합니다.
        </p>
      </section>

      {error ? (
        <div className="status-banner status-banner--error">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && feed.length === 0 ? (
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
    </section>
  )
}

export default SignalsPage
