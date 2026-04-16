type PublisherArticleSection = {
  id: string
  title: string | null
  paragraphs: string[]
  bullets: string[]
}

function normalizeLines(value: string) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
}

function isBulletLine(line: string) {
  return /^[-*]\s+/.test(line)
}

function toBullet(line: string) {
  return line.replace(/^[-*]\s+/, '').trim()
}

function sectionTitleFromLine(line: string) {
  const match = line.match(/^([^:：]{1,24})[:：]\s*(.*)$/)
  if (!match) {
    return null
  }

  const [, rawTitle, rest] = match
  const title = rawTitle.trim()
  if (!title) {
    return null
  }

  return {
    title,
    rest: rest.trim(),
  }
}

function createEmptySection(index: number, title: string | null = null): PublisherArticleSection {
  return {
    id: `section-${index}`,
    title,
    paragraphs: [],
    bullets: [],
  }
}

function buildPublisherArticleSections(text: string) {
  const lines = normalizeLines(text)
  const sections: PublisherArticleSection[] = []
  let current = createEmptySection(0)

  const flush = () => {
    if (current.paragraphs.length === 0 && current.bullets.length === 0) {
      return
    }

    sections.push(current)
    current = createEmptySection(sections.length)
  }

  for (const line of lines) {
    if (!line) {
      flush()
      continue
    }

    const titled = sectionTitleFromLine(line)
    if (titled) {
      flush()
      current = createEmptySection(sections.length, titled.title)
      if (titled.rest) {
        current.paragraphs.push(titled.rest)
      }
      continue
    }

    if (isBulletLine(line)) {
      current.bullets.push(toBullet(line))
      continue
    }

    current.paragraphs.push(line)
  }

  flush()

  if (sections.length === 0) {
    return [
      {
        id: 'section-0',
        title: null,
        paragraphs: text ? [text] : [],
        bullets: [],
      },
    ]
  }

  return sections
}

function extractSourceUrl(sections: PublisherArticleSection[], fallbackUrl?: string | null) {
  for (const section of sections) {
    for (const paragraph of section.paragraphs) {
      const match = paragraph.match(/https?:\/\/\S+/)
      if (match) {
        return match[0]
      }
    }
    for (const bullet of section.bullets) {
      const match = bullet.match(/https?:\/\/\S+/)
      if (match) {
        return match[0]
      }
    }
  }

  return fallbackUrl || null
}

export function PublisherArticle({
  title,
  excerpt,
  body,
  sourceUrl,
  sourceLabel,
  category,
  summaryType,
  publishedAt,
  authors = [],
  tags = [],
}: {
  title: string
  excerpt?: string | null
  body: string
  sourceUrl?: string | null
  sourceLabel?: string | null
  category?: string | null
  summaryType?: string | null
  publishedAt?: string | null
  authors?: string[]
  tags?: string[]
}) {
  const sections = buildPublisherArticleSections(body)
  const resolvedSourceUrl = extractSourceUrl(sections, sourceUrl)

  return (
    <article className="publisher-article">
      <header className="publisher-article__header">
        <div className="publisher-article__eyebrow">
          {category ? <span>{category}</span> : null}
          {sourceLabel ? <span>{sourceLabel}</span> : null}
          {publishedAt ? <span>{new Date(publishedAt).toLocaleString('ko-KR')}</span> : null}
        </div>
        <h3>{title}</h3>
        {excerpt ? <p className="publisher-article__lead">{excerpt}</p> : null}
        <div className="publisher-article__meta">
          {summaryType ? <span className="chip chip--soft">{summaryType}</span> : null}
          {authors.length > 0 ? <span className="chip chip--soft">{authors.slice(0, 4).join(', ')}</span> : null}
          {tags.slice(0, 4).map((tag) => (
            <span key={tag} className="chip chip--soft">
              {tag}
            </span>
          ))}
        </div>
      </header>

      <div className="publisher-article__body">
        {sections.map((section) => (
          <section key={section.id} className="publisher-article__section">
            {section.title ? <h4>{section.title}</h4> : null}
            {section.paragraphs.map((paragraph, index) => (
              <p key={`${section.id}-p-${index}`}>{paragraph}</p>
            ))}
            {section.bullets.length > 0 ? (
              <ul>
                {section.bullets.map((bullet, index) => (
                  <li key={`${section.id}-b-${index}`}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      {resolvedSourceUrl ? (
        <footer className="publisher-article__footer">
          <span>원문 출처</span>
          <a href={resolvedSourceUrl} rel="noreferrer" target="_blank">
            {resolvedSourceUrl}
          </a>
        </footer>
      ) : null}
    </article>
  )
}
