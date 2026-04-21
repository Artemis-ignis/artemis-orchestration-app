import { slugify } from './normalize.mjs'
import { pickHeroMedia, pickSecondaryMedia, renderMediaHtml } from './media.mjs'

export const AUTO_POST_PROMPT_VERSION = '2026-04-17-v2'

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeLineArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 3)
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3)
  }
  return []
}

function parseGeneratedPayload(rawText = '') {
  const normalized = String(rawText ?? '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim()
  const objectMatch = normalized.match(/\{[\s\S]*\}/)
  if (!objectMatch) {
    return null
  }

  try {
    return JSON.parse(objectMatch[0])
  } catch {
    return null
  }
}

function containsHangul(value = '') {
  return /[가-힣]/.test(String(value ?? ''))
}

function normalizeText(value = '') {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasMeaningfulHangul(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) {
    return false
  }

  const hangulMatches = normalized.match(/[가-힣]/g)
  return Array.isArray(hangulMatches) && hangulMatches.length >= 6
}

function splitSentences(value = '', limit = 4) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return []
  }

  const sentences = normalized
    .replace(/\s*[•·]\s*/g, '. ')
    .replace(/\s+\/\s+/g, '. ')
    .split(/(?<=[.!?。다])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12)

  return sentences.slice(0, limit)
}

function summaryToBullets(value = '', limit = 4) {
  const sentences = splitSentences(value, limit)
  if (sentences.length > 0) {
    return sentences
  }

  const normalized = normalizeText(value)
  if (!normalized) {
    return []
  }

  return [normalized.slice(0, 160)]
}

function isReadableContext(value = '') {
  const normalized = normalizeText(value)
  if (!normalized || normalized.length < 40) {
    return false
  }
  if (
    /@context|schema\.org|application\/ld\+json|\"@type\"|\"@id\"|window\.|document\.|function\(|xmlns|viewbox|fill-rule|stroke-width/i.test(
      normalized,
    )
  ) {
    return false
  }
  return true
}

function sourceKindLabel(candidate) {
  switch (candidate.sourceType) {
    case 'arxiv':
      return '논문'
    case 'github':
      return '오픈소스'
    case 'hackerNews':
      return '해커 뉴스'
    case 'rss':
      return '피드'
    default:
      return candidate.sourceLabel || '웹'
  }
}

function normalizeHeadlineSeed(title = '') {
  return normalizeText(title)
    .replace(/^(Launch|Show|Ask)\s+HN:\s*/i, '')
    .replace(/\s*\((YC\s+[A-Z]\d+)\)\s*/gi, ' ')
    .replace(/\s+-\s+/g, ' – ')
    .trim()
}

function extractProjectName(title = '') {
  const normalized = normalizeHeadlineSeed(title)
  if (!normalized) {
    return ''
  }

  const [head] = normalized.split(/[–:-]/)
  return normalizeText(head)
}

function repoDisplayName(title = '') {
  const normalized = normalizeText(title)
  if (!normalized.includes('/')) {
    return normalized
  }

  return normalized.split('/').pop()?.trim() || normalized
}

function sourceMetaBits(candidate) {
  const rawMeta = candidate.rawMeta ?? {}
  const bits = []

  if (rawMeta.points) {
    bits.push(`해커뉴스 점수 ${Number(rawMeta.points).toLocaleString('ko-KR')}`)
  }
  if (rawMeta.comments) {
    bits.push(`댓글 ${Number(rawMeta.comments).toLocaleString('ko-KR')}개`)
  }
  if (rawMeta.stars) {
    bits.push(`스타 ${Number(rawMeta.stars).toLocaleString('ko-KR')}개`)
  }
  if (rawMeta.forks) {
    bits.push(`포크 ${Number(rawMeta.forks).toLocaleString('ko-KR')}개`)
  }
  if (rawMeta.primaryCategory) {
    bits.push(`분류 ${escapeHtml(rawMeta.primaryCategory)}`)
  }
  if (candidate.authorOrChannel) {
    bits.push(`작성자 ${escapeHtml(candidate.authorOrChannel)}`)
  }

  return bits
}

function buildSourceRows(candidates = []) {
  return candidates
    .map((item) => {
      const author = item.authorOrChannel ? ` / ${escapeHtml(item.authorOrChannel)}` : ''
      return `
        <tr>
          <td>${escapeHtml(item.sourceLabel || item.sourceType || '')}</td>
          <td><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>${author}</td>
          <td>${escapeHtml(item.publishedAt ? new Date(item.publishedAt).toLocaleString('ko-KR') : '-')}</td>
        </tr>
      `
    })
    .join('')
}

function buildCandidateSectionHtml(item, index) {
  const metaLine = sourceMetaBits(item)
  const summary = normalizeText(item.summary || item.rawMeta?.pageMeta?.description || '')
  const bullets = summaryToBullets(summary, 4)
  const context = normalizeText(item.rawMeta?.pageMeta?.htmlSnippet || '')

  return `
    <section>
      <h2>${index + 1}. ${escapeHtml(item.title)}</h2>
      ${metaLine.length > 0 ? `<p class="meta-line">${metaLine.join(' · ')}</p>` : ''}
      ${bullets.length > 0 ? `<ul>${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : '<p>공개된 메타데이터 기준으로 추가 정보가 제한적이라 핵심만 짧게 정리했습니다.</p>'}
      ${
        isReadableContext(context)
          ? `<blockquote>${escapeHtml(context.slice(0, 360))}</blockquote>`
          : ''
      }
      <p>출처: <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceLabel || sourceKindLabel(item))}</a></p>
    </section>
  `
}

function buildKoreanFallbackHeadline(primaryCandidate) {
  const existingTitle = normalizeText(primaryCandidate.title)
  const keepsEnglishPrefix =
    /^(Launch|Show|Ask)\s+HN:/i.test(existingTitle) ||
    (primaryCandidate.sourceType === 'github' && /^[^/\s]+\/[^/\s]+/.test(existingTitle))

  if (hasMeaningfulHangul(existingTitle) && !keepsEnglishPrefix) {
    return primaryCandidate.title
  }

  const normalizedTitle = normalizeHeadlineSeed(primaryCandidate.title)
  const projectName = extractProjectName(primaryCandidate.title) || normalizedTitle || primaryCandidate.title
  const summary = normalizeText(primaryCandidate.summary || '')

  switch (primaryCandidate.sourceType) {
    case 'arxiv':
      return `${projectName} 논문, 핵심만 한국어로 정리`
    case 'github':
      if (summary.includes('오픈소스 AI 에이전트')) {
        return `${repoDisplayName(primaryCandidate.title)}: 코드 제안 너머로 확장된 오픈소스 AI 에이전트`
      }
      if (summary.includes('터미널') || summary.includes('CLI')) {
        return `${repoDisplayName(primaryCandidate.title)}, 터미널 중심으로 다듬은 오픈소스 도구`
      }
      return `${repoDisplayName(primaryCandidate.title)}, 지금 볼 만한 오픈소스 프로젝트`
    case 'hackerNews':
      if (summary.includes('API')) {
        return `${projectName}, 수작업 소프트웨어 흐름을 API로 바꾸겠다는 서비스`
      }
      return `${projectName}, 해커 뉴스 반응까지 묶어 본 핵심 정리`
    default:
      return `${projectName}, 지금 읽어야 할 이유`
  }
}

function shouldPreferFallbackTitle(rawTitle, fallbackTitle, primaryCandidate) {
  const normalizedRawTitle = normalizeText(rawTitle)
  if (!hasMeaningfulHangul(normalizedRawTitle)) {
    return true
  }
  if (primaryCandidate.sourceType === 'hackerNews' && /^(Launch|Show|Ask)\s+HN:/i.test(normalizedRawTitle)) {
    return true
  }
  if (primaryCandidate.sourceType === 'github' && /^[^/\s]+\/[^/\s]+/.test(normalizedRawTitle)) {
    return true
  }
  return !normalizedRawTitle || normalizedRawTitle === normalizeText(primaryCandidate.title)
}

function buildFallbackSummaries(primaryCandidate, relatedCandidates = []) {
  const title = buildKoreanFallbackHeadline(primaryCandidate)
  const sourceKind = sourceKindLabel(primaryCandidate)
  const subtitleLines = [
    `${sourceKind} · ${primaryCandidate.categoryLabel || primaryCandidate.category} · ${new Date(primaryCandidate.publishedAt || primaryCandidate.discoveredAt).toLocaleString('ko-KR')}`,
    relatedCandidates.length > 0
      ? `관련 흐름 ${relatedCandidates.length}건까지 함께 묶어 맥락 중심으로 정리했습니다.`
      : '공개된 제목, 설명, 메타데이터만 바탕으로 보수적으로 재구성한 한국어 브리핑입니다.',
  ]
  const lead = normalizeText([
    `${title}는 이번 배치에서 우선 검토 대상으로 올라온 항목입니다.`,
    primaryCandidate.summary || '공개된 설명이 길지 않아 제목과 메타데이터를 중심으로 맥락을 정리했습니다.',
    '아래 글은 원문 전체를 복제하지 않고, 공개된 정보 범위 안에서 왜 이 소식이 중요해 보이는지 정리한 분석형 브리핑입니다.',
  ].join(' '))
  const threeLineSummary = [
    `${title}가 이번 배치에서 중요 신호로 분류됐습니다.`,
    `${primaryCandidate.sourceLabel || sourceKind} 기준 최신성과 반응 신호를 함께 반영했습니다.`,
    '본문 하단에서 원문 링크와 출처를 바로 확인할 수 있습니다.',
  ]
  return { title, subtitleLines, lead, threeLineSummary }
}

function buildFallbackBodyHtml(primaryCandidate, relatedCandidates = []) {
  const primaryBullets = summaryToBullets(primaryCandidate.summary, 4)
  const whyImportant = [
    `${primaryCandidate.sourceLabel || sourceKindLabel(primaryCandidate)}에서 올라온 항목이고, 최신성·반응 신호·출처 신뢰도를 함께 봤을 때 우선 확인할 가치가 높았습니다.`,
    primaryCandidate.rawMeta?.pageMeta?.description
      ? `메타데이터 설명을 보면 ${normalizeText(primaryCandidate.rawMeta.pageMeta.description).slice(0, 180)}`
      : '공개된 설명이 제한적인 경우에는 제목과 출처 메타데이터를 중심으로만 정리했습니다.',
  ]

  return [
    `<section><h2>무슨 소식인가</h2><p>${escapeHtml(normalizeText(primaryCandidate.summary || `${primaryCandidate.title} 관련 공개 소식입니다.`))}</p></section>`,
    `<section><h2>핵심 포인트</h2><ul>${primaryBullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`,
    `<section><h2>왜 주목할 만한가</h2><p>${escapeHtml(normalizeText(whyImportant.join(' ')))}</p></section>`,
    buildCandidateSectionHtml(primaryCandidate, 0),
    relatedCandidates.length > 0
      ? `<section><h2>같이 보면 좋은 관련 흐름</h2>${relatedCandidates.map((item, index) => buildCandidateSectionHtml(item, index)).join('')}</section>`
      : `<section><h2>추가로 확인할 포인트</h2><p>제품 공개 이후 저장소 활동이나 후속 발표가 이어지는지, 실제 사용 사례가 나오는지 정도를 추가로 확인하면 좋습니다.</p></section>`,
  ].join('')
}

export function buildAutoPostPrompt({
  primaryCandidate,
  relatedCandidates = [],
  mediaAttachments = [],
}) {
  const sourcePayload = [primaryCandidate, ...relatedCandidates].map((item) => ({
    title: item.title,
    summary: item.summary,
    url: item.url,
    sourceLabel: item.sourceLabel,
    publishedAt: item.publishedAt,
    authorOrChannel: item.authorOrChannel,
    rawMeta: item.rawMeta,
  }))
  const mediaPayload = mediaAttachments.map((item) => ({
    kind: item.kind,
    title: item.title,
    description: item.description,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    provider: item.provider,
  }))

  return [
    '당신은 최신 AI 소식을 한국어 분석글로 정리하는 편집자다.',
    '목표는 번역문 티가 나는 요약이 아니라, 한국어 커뮤니티 정보글처럼 자연스럽고 읽히는 브리핑을 쓰는 것이다.',
    '반드시 한국어로 작성하고, 영어는 고유명사·원문 제목·서비스명처럼 꼭 필요한 경우에만 유지한다.',
    '원문에 없는 사실을 만들지 말고, 메타데이터만 있을 때는 제목·설명·초록·공개 메타데이터 범위에서만 설명한다.',
    'JSON-LD, schema.org, 스크립트 조각, HTML 속성, raw markup를 본문에 노출하지 말라.',
    '과장, 클릭베이트, 근거 없는 단정, 투자 조언, 과도한 미래 예측 금지.',
    '반드시 JSON 객체만 반환하라.',
    'JSON 형식:',
    '{"title":"","subtitleLines":["",""],"lead":"","tags":["",""],"plainTextSummary":"","threeLineSummary":["","",""],"html":""}',
    'html 필드는 바로 읽을 수 있는 한국어 기사 본문이어야 한다. 제목, 부제, 리드, 소제목 4~8개, 출처 표, 세 줄 요약을 포함하라.',
    `프롬프트 버전: ${AUTO_POST_PROMPT_VERSION}`,
    `대표 후보:\n${JSON.stringify(sourcePayload[0], null, 2)}`,
    relatedCandidates.length > 0
      ? `관련 후보:\n${JSON.stringify(sourcePayload.slice(1), null, 2)}`
      : '관련 후보: []',
    mediaPayload.length > 0 ? `미디어 후보:\n${JSON.stringify(mediaPayload, null, 2)}` : '미디어 후보: []',
  ].join('\n\n')
}

function buildDocumentHtml({
  title,
  subtitleLines,
  lead,
  category,
  createdAt,
  primaryCandidate,
  relatedCandidates,
  mediaAttachments,
  bodyHtml,
  threeLineSummary,
}) {
  const hero = pickHeroMedia(mediaAttachments)
  const secondaryMedia = pickSecondaryMedia(mediaAttachments)
  const heroHtml = hero ? renderMediaHtml(hero, {}) : ''
  const secondaryHtml = secondaryMedia
    .map((item) => `<div class="gallery-item">${renderMediaHtml(item, {})}</div>`)
    .join('')
  const summaryList = threeLineSummary
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('')

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f2ea;
        --paper: #fffdf9;
        --line: rgba(64, 48, 24, 0.12);
        --text: #1f1a14;
        --muted: #6c5d49;
        --accent: #9a7842;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at top, rgba(154, 120, 66, 0.14), transparent 34%),
          linear-gradient(180deg, #f7f3ea 0%, #efe8da 100%);
        color: var(--text);
        font: 18px/1.78 "Pretendard", "Noto Sans KR", sans-serif;
      }
      main {
        max-width: 820px;
        margin: 48px auto;
        padding: 0 22px 56px;
      }
      article {
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 34px;
        padding: 40px 36px 42px;
        box-shadow: 0 24px 80px rgba(77, 56, 17, 0.08);
      }
      .eyebrow, .meta-line, .source-footer { color: var(--muted); font-size: 14px; }
      h1 { margin: 10px 0 16px; font-size: clamp(34px, 5vw, 48px); line-height: 1.14; letter-spacing: -0.02em; }
      h2 { margin: 42px 0 14px; font-size: 28px; line-height: 1.32; letter-spacing: -0.02em; }
      p, li, td, th, blockquote { margin: 0 0 16px; }
      ul { padding-left: 22px; }
      .subtitle { margin: 0 0 8px; color: var(--muted); }
      .lead { font-size: 20px; line-height: 1.9; margin-top: 18px; }
      .hero-media { margin: 28px 0 22px; border-radius: 24px; overflow: hidden; border: 1px solid var(--line); background: #f0e7d6; }
      .auto-post-media { width: 100%; display: block; min-height: 220px; background: #e9dfcb; }
      .auto-post-media--embed iframe { width: 100%; min-height: 420px; border: 0; display: block; }
      .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 0 0 20px; }
      .gallery-item { border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: #efe7d8; }
      blockquote {
        padding: 18px 20px;
        border-left: 4px solid var(--accent);
        background: rgba(154, 120, 66, 0.08);
        border-radius: 18px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 24px 0;
        font-size: 15px;
      }
      th, td {
        border-bottom: 1px solid var(--line);
        padding: 12px 10px;
        text-align: left;
        vertical-align: top;
      }
      .summary-box {
        margin-top: 36px;
        padding: 22px 24px;
        border-radius: 22px;
        background: #f4ecdd;
        border: 1px solid var(--line);
      }
      a { color: #765318; }
      .source-footer ul { padding-left: 20px; }
    </style>
  </head>
  <body>
    <main>
      <article>
        <div class="eyebrow">${escapeHtml(category)} · ${escapeHtml(new Date(createdAt).toLocaleString('ko-KR'))}</div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitleLines.map((line) => `<p class="subtitle">${escapeHtml(line)}</p>`).join('')}
        ${heroHtml ? `<div class="hero-media">${heroHtml}</div>` : ''}
        ${secondaryHtml ? `<div class="gallery">${secondaryHtml}</div>` : ''}
        <p class="lead">${escapeHtml(lead)}</p>
        ${bodyHtml}
        <section>
          <h2>원문 링크와 출처</h2>
          <table>
            <thead>
              <tr>
                <th>출처</th>
                <th>항목</th>
                <th>날짜</th>
              </tr>
            </thead>
            <tbody>
              ${buildSourceRows([primaryCandidate, ...relatedCandidates])}
            </tbody>
          </table>
        </section>
        <section class="summary-box">
          <h2>세 줄 요약</h2>
          <ul>${summaryList}</ul>
        </section>
      </article>
    </main>
  </body>
</html>`
}

function normalizeGeneratedHtml(
  html,
  {
    title,
    subtitleLines,
    lead,
    category,
    schedulerRunAt,
    primaryCandidate,
    relatedCandidates,
    mediaAttachments,
    threeLineSummary,
  },
) {
  const normalized = String(html ?? '').trim()
  if (!normalized) {
    return ''
  }

  if (/<html[\s>]/i.test(normalized)) {
    return normalized
  }

  return buildDocumentHtml({
    title,
    subtitleLines,
    lead,
    category,
    createdAt: schedulerRunAt,
    primaryCandidate,
    relatedCandidates,
    mediaAttachments,
    bodyHtml: normalized,
    threeLineSummary,
  })
}

export function buildFallbackGeneratedPost({
  primaryCandidate,
  relatedCandidates = [],
  mediaAttachments = [],
  schedulerRunAt,
  generationModel,
  errors = [],
}) {
  const fallback = buildFallbackSummaries(primaryCandidate, relatedCandidates)
  const bodyHtml = buildFallbackBodyHtml(primaryCandidate, relatedCandidates)

  return {
    title: fallback.title,
    slug: slugify(fallback.title),
    subtitleLines: fallback.subtitleLines,
    lead: fallback.lead,
    plainTextSummary: fallback.lead,
    threeLineSummary: fallback.threeLineSummary,
    html: buildDocumentHtml({
      title: fallback.title,
      subtitleLines: fallback.subtitleLines,
      lead: fallback.lead,
      category: primaryCandidate.categoryLabel || primaryCandidate.category,
      createdAt: schedulerRunAt,
      primaryCandidate,
      relatedCandidates,
      mediaAttachments,
      bodyHtml,
      threeLineSummary: fallback.threeLineSummary,
    }),
    tags: [
      primaryCandidate.categoryLabel || primaryCandidate.category,
      primaryCandidate.sourceLabel || primaryCandidate.sourceType,
    ].filter(Boolean),
    generationModel: generationModel || 'fallback',
    generationPromptVersion: AUTO_POST_PROMPT_VERSION,
    errors,
  }
}

export async function generateAutoPost({
  primaryCandidate,
  relatedCandidates = [],
  mediaAttachments = [],
  schedulerRunAt,
  generationModel,
  generateText,
}) {
  const prompt = buildAutoPostPrompt({
    primaryCandidate,
    relatedCandidates,
    mediaAttachments,
  })
  const errors = []

  if (generateText) {
    try {
      const response = await generateText({
        prompt,
        model: generationModel,
      })
      const payload = parseGeneratedPayload(response?.text || response || '')

      if (payload && typeof payload.html === 'string' && payload.html.trim()) {
        const fallback = buildFallbackSummaries(primaryCandidate, relatedCandidates)
        const rawTitle = String(payload.title || '').trim()
        const rawLead = String(payload.lead || '').trim()
        const rawPlainTextSummary = String(payload.plainTextSummary || '').trim()
        const title = shouldPreferFallbackTitle(rawTitle, fallback.title, primaryCandidate)
          ? fallback.title
          : rawTitle
        const subtitleLines = normalizeLineArray(payload.subtitleLines)
        const lead = hasMeaningfulHangul(rawLead) ? rawLead : fallback.lead
        const threeLineSummary = normalizeLineArray(payload.threeLineSummary)
        const normalizedThreeLineSummary =
          threeLineSummary.length >= 3 && threeLineSummary.every((line) => hasMeaningfulHangul(line))
            ? threeLineSummary.slice(0, 3)
            : fallback.threeLineSummary
        const plainTextSummary = hasMeaningfulHangul(rawPlainTextSummary)
          ? rawPlainTextSummary
          : lead

        return {
          title,
          slug: slugify(title),
          subtitleLines: subtitleLines.length > 0 ? subtitleLines : fallback.subtitleLines,
          lead,
          plainTextSummary,
          threeLineSummary: normalizedThreeLineSummary,
          html: normalizeGeneratedHtml(payload.html, {
            title,
            subtitleLines: subtitleLines.length > 0 ? subtitleLines : fallback.subtitleLines,
            lead,
            category: primaryCandidate.categoryLabel || primaryCandidate.category,
            schedulerRunAt,
            primaryCandidate,
            relatedCandidates,
            mediaAttachments,
            threeLineSummary: normalizedThreeLineSummary,
          }),
          tags: Array.isArray(payload.tags)
            ? payload.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
            : [],
          generationModel: generationModel || response?.model || 'codex',
          generationPromptVersion: AUTO_POST_PROMPT_VERSION,
          errors,
        }
      }

      errors.push('모델이 비어 있거나 형식을 맞추지 못한 응답을 반환했습니다.')
    } catch (error) {
      errors.push(error instanceof Error ? error.message : '게시글 생성 호출에 실패했습니다.')
    }
  } else {
    errors.push('생성 모델 호출기가 연결되지 않아 규칙 기반 게시글로 대체했습니다.')
  }

  return buildFallbackGeneratedPost({
    primaryCandidate,
    relatedCandidates,
    mediaAttachments,
    schedulerRunAt,
    generationModel,
    errors,
  })
}
