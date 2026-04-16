import {
  buildCandidateCanonicalId,
  canonicalizeUrl,
  detectLanguage,
  extractArxivId,
  hashText,
  nowIso,
  slugify,
} from '../auto-posts/normalize.mjs'

function stripHtml(value = '') {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeXmlEntities(value = '') {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function normalizeAuthors(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
  }

  return []
}

function buildNormalizedId(provider, value) {
  return `${provider}-${hashText(value || `${provider}-${Date.now()}`).slice(0, 14)}`
}

function buildBaseItem(overrides = {}) {
  const canonicalUrl = canonicalizeUrl(overrides.canonicalUrl || overrides.sourceUrl || '')
  const sourceUrl = canonicalizeUrl(overrides.sourceUrl || canonicalUrl)
  return {
    id: overrides.id || buildNormalizedId(overrides.provider || 'source', canonicalUrl || overrides.title || nowIso()),
    sourceType: overrides.sourceType || 'feed',
    provider: overrides.provider || 'unknown',
    canonicalUrl,
    sourceUrl,
    title: String(overrides.title || '').trim(),
    subtitle: String(overrides.subtitle || '').trim(),
    authors: normalizeAuthors(overrides.authors),
    publishedAt: overrides.publishedAt || nowIso(),
    abstractOrSnippet: stripHtml(overrides.abstractOrSnippet || ''),
    language: overrides.language || detectLanguage(`${overrides.title || ''} ${overrides.abstractOrSnippet || ''}`),
    doi: String(overrides.doi || '').trim(),
    arxivId: String(overrides.arxivId || '').trim(),
    tags: Array.isArray(overrides.tags) ? overrides.tags.map((item) => String(item ?? '').trim()).filter(Boolean) : [],
    score: Number(overrides.score || 0),
    topicHash: String(overrides.topicHash || '').trim(),
    rawMeta: overrides.rawMeta && typeof overrides.rawMeta === 'object' ? overrides.rawMeta : {},
  }
}

function createProvider(definition) {
  return {
    id: definition.id,
    label: definition.label,
    sourceType: definition.sourceType,
    enabled: definition.enabled,
    fetchLatest: definition.fetchLatest,
    normalizeItem: definition.normalizeItem,
    getCanonicalId: definition.getCanonicalId,
    getSourceMeta: definition.getSourceMeta,
    async fetchNormalized(context = {}) {
      const rawItems = await definition.fetchLatest(context)
      return rawItems
        .map((item) => definition.normalizeItem(item, context))
        .filter((item) => item && item.title && item.sourceUrl)
        .map((item) => ({
          ...item,
          id: item.id || buildNormalizedId(definition.id, definition.getCanonicalId(item)),
        }))
    },
  }
}

function extractXmlValue(entry, tagName) {
  const match = entry.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return decodeXmlEntities(stripHtml(match?.[1] ?? ''))
}

function extractAtomEntries(xml = '') {
  return xml
    .split('<entry>')
    .slice(1)
    .map((entry) => entry.split('</entry>')[0])
}

function parseRssEntries(xml = '') {
  const rssMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1])
  if (rssMatches.length > 0) {
    return rssMatches.map((entry) => {
      const title = extractXmlValue(entry, 'title')
      const link = extractXmlValue(entry, 'link')
      const description = extractXmlValue(entry, 'description')
      const guid = extractXmlValue(entry, 'guid')
      const publishedAt = extractXmlValue(entry, 'pubDate')
      const author = extractXmlValue(entry, 'dc:creator') || extractXmlValue(entry, 'author')
      const categories = [...entry.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((match) =>
        decodeXmlEntities(stripHtml(match[1])),
      )

      return {
        title,
        link,
        description,
        guid,
        publishedAt,
        author,
        categories,
      }
    })
  }

  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const entry = match[1]
    const title = extractXmlValue(entry, 'title')
    const summary = extractXmlValue(entry, 'summary') || extractXmlValue(entry, 'content')
    const linkMatch = entry.match(/<link[^>]+href="([^"]+)"/i)
    const publishedAt = extractXmlValue(entry, 'updated') || extractXmlValue(entry, 'published')
    const author = extractXmlValue(entry, 'name')
    const categories = [...entry.matchAll(/<category[^>]+term="([^"]+)"/gi)].map((categoryMatch) =>
      decodeXmlEntities(stripHtml(categoryMatch[1])),
    )

    return {
      title,
      link: decodeXmlEntities(linkMatch?.[1] ?? ''),
      description: summary,
      guid: decodeXmlEntities(linkMatch?.[1] ?? ''),
      publishedAt,
      author,
      categories,
    }
  })
}

function mapLegacySignalSourceType(value = '') {
  switch (String(value ?? '').trim().toLowerCase()) {
    case 'arxiv':
      return 'paper'
    case 'github':
    case 'hackernews':
    case 'hacker news':
      return 'news'
    default:
      return 'feed'
  }
}

function buildCanonicalId(item) {
  if (item.doi) {
    return `doi:${item.doi.toLowerCase()}`
  }
  if (item.arxivId) {
    return `arxiv:${item.arxivId.toLowerCase()}`
  }
  return item.canonicalUrl || item.sourceUrl || slugify(item.title || item.id || 'item')
}

export function createSourceProviders({ fetchWithTimeout, collectSignalItems }) {
  const arxivProvider = createProvider({
    id: 'arxiv',
    label: 'arXiv',
    sourceType: 'paper',
    enabled: (settings) => settings.ingestArxivEnabled,
    async fetchLatest({ settings, limit = 6 }) {
      const query = settings.ingestQuery || 'artificial intelligence large language model'
      const response = await fetchWithTimeout(
        `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
          `(cat:cs.AI OR cat:cs.CL OR cat:cs.LG) AND all:${query}`,
        )}&start=0&max_results=${Math.max(limit, 4)}&sortBy=submittedDate&sortOrder=descending`,
        undefined,
        15_000,
      )

      if (!response.ok) {
        throw new Error(`arXiv request failed (${response.status})`)
      }

      const xml = await response.text()
      return extractAtomEntries(xml)
    },
    normalizeItem(entry) {
      const title = extractXmlValue(entry, 'title')
      const abstractOrSnippet = extractXmlValue(entry, 'summary')
      const linkMatch = entry.match(/<id>([^<]+)<\/id>/i)
      const sourceUrl = decodeXmlEntities(stripHtml(linkMatch?.[1] ?? ''))
      const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/gi)].map((match) =>
        decodeXmlEntities(stripHtml(match[1])),
      )
      const arxivId = extractArxivId(sourceUrl)
      const tags = [...entry.matchAll(/<category[^>]+term="([^"]+)"/gi)].map((match) =>
        decodeXmlEntities(stripHtml(match[1])),
      )

      return buildBaseItem({
        provider: 'arxiv',
        sourceType: 'paper',
        sourceUrl,
        canonicalUrl: sourceUrl,
        title,
        authors,
        publishedAt: extractXmlValue(entry, 'published'),
        abstractOrSnippet,
        arxivId,
        tags,
        rawMeta: {
          arxivId,
          tags,
        },
      })
    },
    getCanonicalId: buildCanonicalId,
    getSourceMeta(item) {
      return {
        provider: 'arxiv',
        sourceType: item.sourceType,
        title: item.title,
        sourceUrl: item.sourceUrl,
      }
    },
  })

  const crossrefProvider = createProvider({
    id: 'crossref',
    label: 'Crossref',
    sourceType: 'paper',
    enabled: (settings) => settings.ingestCrossrefEnabled,
    async fetchLatest({ settings, limit = 6 }) {
      const recentDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
      const response = await fetchWithTimeout(
        `https://api.crossref.org/works?rows=${Math.max(limit, 4)}&filter=from-pub-date:${recentDate}&query=${encodeURIComponent(
          settings.ingestQuery,
        )}&select=DOI,title,subtitle,author,abstract,published-online,published-print,URL,subject,container-title,language,type,publisher`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Artemis Publisher',
          },
        },
        15_000,
      )

      if (!response.ok) {
        throw new Error(`Crossref request failed (${response.status})`)
      }

      const payload = await response.json()
      return Array.isArray(payload?.message?.items) ? payload.message.items : []
    },
    normalizeItem(item) {
      const doi = String(item.DOI ?? '').trim()
      const title = Array.isArray(item.title) ? stripHtml(item.title[0] || '') : stripHtml(item.title || '')
      const subtitle = Array.isArray(item.subtitle) ? stripHtml(item.subtitle[0] || '') : stripHtml(item.subtitle || '')
      const abstractOrSnippet = stripHtml(item.abstract || '')
      const sourceUrl = canonicalizeUrl(item.URL || (doi ? `https://doi.org/${doi}` : ''))
      const publishedParts =
        item['published-online']?.['date-parts']?.[0] ||
        item['published-print']?.['date-parts']?.[0] ||
        []
      const publishedAt =
        publishedParts.length >= 3
          ? `${String(publishedParts[0]).padStart(4, '0')}-${String(publishedParts[1]).padStart(2, '0')}-${String(
              publishedParts[2],
            ).padStart(2, '0')}T00:00:00.000Z`
          : nowIso()

      const authors = Array.isArray(item.author)
        ? item.author
            .map((author) => [author.given, author.family].filter(Boolean).join(' ').trim())
            .filter(Boolean)
        : []

      return buildBaseItem({
        provider: 'crossref',
        sourceType: 'paper',
        sourceUrl,
        canonicalUrl: sourceUrl,
        title,
        subtitle,
        authors,
        publishedAt,
        abstractOrSnippet,
        language: item.language || detectLanguage(`${title} ${abstractOrSnippet}`),
        doi,
        tags: Array.isArray(item.subject) ? item.subject : [],
        rawMeta: {
          publisher: item.publisher ?? '',
          containerTitle: Array.isArray(item['container-title']) ? item['container-title'][0] || '' : '',
          type: item.type ?? '',
        },
      })
    },
    getCanonicalId: buildCanonicalId,
    getSourceMeta(item) {
      return {
        provider: 'crossref',
        sourceType: item.sourceType,
        title: item.title,
        sourceUrl: item.sourceUrl,
      }
    },
  })

  const semanticScholarProvider = createProvider({
    id: 'semanticScholar',
    label: 'Semantic Scholar',
    sourceType: 'paper',
    enabled: (settings) => settings.ingestSemanticScholarEnabled,
    async fetchLatest({ settings, limit = 6 }) {
      const response = await fetchWithTimeout(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
          settings.ingestQuery,
        )}&limit=${Math.max(limit, 4)}&fields=title,abstract,authors,url,publicationDate,externalIds,venue,fieldsOfStudy,publicationTypes`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Artemis Publisher',
          },
        },
        15_000,
      )

      if (!response.ok) {
        throw new Error(`Semantic Scholar request failed (${response.status})`)
      }

      const payload = await response.json()
      return Array.isArray(payload?.data) ? payload.data : []
    },
    normalizeItem(item) {
      const sourceUrl = canonicalizeUrl(item.url || '')
      const externalIds = item.externalIds && typeof item.externalIds === 'object' ? item.externalIds : {}
      const doi = String(externalIds.DOI || '').trim()
      const arxivId = String(externalIds.ArXiv || '').trim()
      const authors = Array.isArray(item.authors) ? item.authors.map((author) => String(author.name || '').trim()).filter(Boolean) : []

      return buildBaseItem({
        provider: 'semanticScholar',
        sourceType: 'paper',
        sourceUrl,
        canonicalUrl: sourceUrl || (doi ? `https://doi.org/${doi}` : arxivId ? `https://arxiv.org/abs/${arxivId}` : ''),
        title: item.title || '',
        subtitle: item.venue || '',
        authors,
        publishedAt: item.publicationDate || nowIso(),
        abstractOrSnippet: item.abstract || '',
        doi,
        arxivId,
        tags: Array.isArray(item.fieldsOfStudy) ? item.fieldsOfStudy : [],
        rawMeta: {
          venue: item.venue || '',
          publicationTypes: Array.isArray(item.publicationTypes) ? item.publicationTypes : [],
          externalIds,
        },
      })
    },
    getCanonicalId: buildCanonicalId,
    getSourceMeta(item) {
      return {
        provider: 'semanticScholar',
        sourceType: item.sourceType,
        title: item.title,
        sourceUrl: item.sourceUrl,
      }
    },
  })

  const newsApiProvider = createProvider({
    id: 'newsApi',
    label: 'News API',
    sourceType: 'news',
    enabled: (settings) => settings.ingestNewsApiEnabled && Boolean(settings.newsApiKey),
    async fetchLatest({ settings, limit = 6 }) {
      const response = await fetchWithTimeout(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(
          settings.ingestQuery,
        )}&sortBy=publishedAt&pageSize=${Math.max(limit, 4)}&language=en`,
        {
          headers: {
            'X-Api-Key': settings.newsApiKey,
          },
        },
        15_000,
      )

      if (!response.ok) {
        throw new Error(`News API request failed (${response.status})`)
      }

      const payload = await response.json()
      return Array.isArray(payload?.articles) ? payload.articles : []
    },
    normalizeItem(item) {
      const sourceUrl = canonicalizeUrl(item.url || '')
      return buildBaseItem({
        provider: 'newsApi',
        sourceType: 'news',
        sourceUrl,
        canonicalUrl: sourceUrl,
        title: item.title || '',
        subtitle: item.source?.name || '',
        authors: item.author ? [item.author] : [],
        publishedAt: item.publishedAt || nowIso(),
        abstractOrSnippet: item.description || item.content || '',
        tags: ['news'],
        rawMeta: {
          sourceName: item.source?.name || '',
          imageUrl: item.urlToImage || '',
        },
      })
    },
    getCanonicalId: buildCanonicalId,
    getSourceMeta(item) {
      return {
        provider: 'newsApi',
        sourceType: item.sourceType,
        title: item.title,
        sourceUrl: item.sourceUrl,
      }
    },
  })

  const rssProvider = createProvider({
    id: 'rss',
    label: 'RSS/Atom',
    sourceType: 'feed',
    enabled: (settings) => settings.ingestRssEnabled && Array.isArray(settings.rssFeeds) && settings.rssFeeds.length > 0,
    async fetchLatest({ settings, limit = 6 }) {
      const feeds = Array.isArray(settings.rssFeeds) ? settings.rssFeeds : []
      const collected = []

      for (const feedUrl of feeds) {
        const response = await fetchWithTimeout(feedUrl, undefined, 15_000)
        if (!response.ok) {
          throw new Error(`RSS request failed (${response.status})`)
        }

        const xml = await response.text()
        const items = parseRssEntries(xml)
          .slice(0, Math.max(limit, 4))
          .map((item) => ({
            ...item,
            feedUrl,
          }))
        collected.push(...items)
      }

      return collected
    },
    normalizeItem(item) {
      const sourceUrl = canonicalizeUrl(item.link || item.guid || '')
      return buildBaseItem({
        provider: 'rss',
        sourceType: 'feed',
        sourceUrl,
        canonicalUrl: sourceUrl,
        title: item.title || '',
        subtitle: item.feedUrl || '',
        authors: item.author ? [item.author] : [],
        publishedAt: item.publishedAt || nowIso(),
        abstractOrSnippet: item.description || '',
        tags: Array.isArray(item.categories) ? item.categories : [],
        rawMeta: {
          feedUrl: item.feedUrl || '',
          guid: item.guid || '',
        },
      })
    },
    getCanonicalId: buildCanonicalId,
    getSourceMeta(item) {
      return {
        provider: 'rss',
        sourceType: item.sourceType,
        title: item.title,
        sourceUrl: item.sourceUrl,
      }
    },
  })

  const legacySignalsProvider = createProvider({
    id: 'legacySignals',
    label: 'Signals Feed',
    sourceType: 'feed',
    enabled: (settings) => settings.ingestLegacySignalsEnabled && typeof collectSignalItems === 'function',
    async fetchLatest() {
      return typeof collectSignalItems === 'function' ? collectSignalItems('전체') : []
    },
    normalizeItem(item) {
      const sourceUrl = canonicalizeUrl(item.url || '')
      const sourceType = mapLegacySignalSourceType(item.sourceType || item.source)
      const rawMeta = item.rawMeta && typeof item.rawMeta === 'object' ? item.rawMeta : {}
      return buildBaseItem({
        provider: 'legacySignals',
        sourceType,
        sourceUrl,
        canonicalUrl: sourceUrl,
        title: item.title || '',
        subtitle: item.sourceLabel || item.source || '',
        authors: item.authorOrChannel ? [item.authorOrChannel] : [],
        publishedAt: item.publishedAt || item.discoveredAt || nowIso(),
        abstractOrSnippet: item.summary || '',
        language: item.language || detectLanguage(`${item.title || ''} ${item.summary || ''}`),
        doi: String(rawMeta.doi || '').trim(),
        arxivId: String(rawMeta.arxivId || extractArxivId(sourceUrl)).trim(),
        tags: [item.categoryLabel || item.category || '', item.sourceLabel || item.source || ''].filter(Boolean),
        rawMeta: {
          ...rawMeta,
          source: item.source || '',
          sourceLabel: item.sourceLabel || '',
          buildCanonicalId: buildCandidateCanonicalId(item),
        },
      })
    },
    getCanonicalId: buildCanonicalId,
    getSourceMeta(item) {
      return {
        provider: 'legacySignals',
        sourceType: item.sourceType,
        title: item.title,
        sourceUrl: item.sourceUrl,
      }
    },
  })

  return [
    arxivProvider,
    crossrefProvider,
    semanticScholarProvider,
    newsApiProvider,
    rssProvider,
    legacySignalsProvider,
  ]
}
