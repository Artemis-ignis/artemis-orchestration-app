import { slugify } from './normalize.mjs'
import { pickHeroMedia, pickSecondaryMedia, renderMediaHtml } from './media.mjs'

export const AUTO_POST_PROMPT_VERSION = '2026-04-15-v1'

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

function buildSectionHtml(candidates = []) {
  return candidates
    .map((item, index) => {
      const metaLines = []
      const rawMeta = item.rawMeta ?? {}

      if (rawMeta.stars) {
        metaLines.push(`별 ${Number(rawMeta.stars).toLocaleString('ko-KR')}개`)
      }
      if (rawMeta.forks) {
        metaLines.push(`포크 ${Number(rawMeta.forks).toLocaleString('ko-KR')}개`)
      }
      if (rawMeta.points) {
        metaLines.push(`해커뉴스 점수 ${Number(rawMeta.points).toLocaleString('ko-KR')}`)
      }
      if (rawMeta.comments) {
        metaLines.push(`댓글 ${Number(rawMeta.comments).toLocaleString('ko-KR')}개`)
      }
      if (rawMeta.primaryCategory) {
        metaLines.push(`분류 ${escapeHtml(rawMeta.primaryCategory)}`)
      }

      const metaHtml = metaLines.length > 0 ? `<p class="meta-line">${metaLines.join(' · ')}</p>` : ''
      const description = escapeHtml(item.summary || item.rawMeta?.pageMeta?.description || '')
      const context = escapeHtml(item.rawMeta?.pageMeta?.htmlSnippet?.slice(0, 340) || '')

      return `
        <section>
          <h2>${index + 1}. ${escapeHtml(item.title)}</h2>
          ${metaHtml}
          <p>${description || '공개 메타데이터 기준으로 핵심만 정리했습니다.'}</p>
          ${context ? `<blockquote>${context}</blockquote>` : ''}
          <p>출처: <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceLabel || item.sourceType || item.url)}</a></p>
        </section>
      `
    })
    .join('')
}

function buildFallbackSummaries(primaryCandidate, relatedCandidates = []) {
  const title = primaryCandidate.title
  const subtitleLines = [
    `${primaryCandidate.sourceLabel || primaryCandidate.sourceType}에서 포착된 최신 AI 신호`,
    relatedCandidates.length > 0
      ? `함께 볼 만한 관련 항목 ${relatedCandidates.length}건을 묶어 맥락을 정리했습니다.`
      : `${primaryCandidate.categoryLabel || primaryCandidate.category} 흐름을 중심으로 정리했습니다.`,
  ]
  const lead = [
    `${primaryCandidate.title}는 이번 시간대에 포착된 시그널 가운데 의미가 큰 항목으로 분류됐습니다.`,
    `${primaryCandidate.summary || '공개 메타데이터를 바탕으로 핵심 의미만 보수적으로 해설합니다.'}`,
    `아래 정리는 원문 전체를 복제하지 않고, 공개된 제목·설명·메타데이터와 대표 자료를 기준으로 재구성한 한국어 브리핑입니다.`,
  ].join(' ')
  const threeLineSummary = [
    `${primaryCandidate.title}가 이번 배치에서 높은 점수를 기록했습니다.`,
    `${primaryCandidate.sourceLabel || primaryCandidate.sourceType} 기준 최신성과 반응 신호를 함께 반영했습니다.`,
    `원문 링크와 대표 미디어는 본문 하단에서 바로 확인할 수 있습니다.`,
  ]
  return { title, subtitleLines, lead, threeLineSummary }
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
    '당신은 공개 AI 시그널을 바탕으로 한국어 장문 정보글 HTML을 작성하는 편집자입니다.',
    '기사 원문 전체를 베끼지 말고, 공개 메타데이터와 요약 정보를 바탕으로 해설형으로 재구성하세요.',
    '과장, 추정, 근거 없는 예측 금지. 입력에 없는 사실은 만들지 마세요.',
    '반드시 JSON 객체만 반환하세요.',
    'JSON 형식:',
    '{"title":"","subtitleLines":["",""],"lead":"","tags":["",""],"plainTextSummary":"","threeLineSummary":["","",""],"html":""}',
    'HTML은 중앙 카드형 기사 레이아웃으로 작성하고, 제목/부제/리드/4~8개 소제목/필요 시 표/출처 푸터/세 줄 요약을 포함하세요.',
    '비디오나 임베드는 대표 미디어로 자연스럽게 배치하고, 불가능하면 이미지나 썸네일 링크를 활용하세요.',
    `프롬프트 버전: ${AUTO_POST_PROMPT_VERSION}`,
    `대표 후보:\n${JSON.stringify(sourcePayload[0], null, 2)}`,
    relatedCandidates.length > 0
      ? `보조 후보:\n${JSON.stringify(sourcePayload.slice(1), null, 2)}`
      : '보조 후보: []',
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
          radial-gradient(circle at top, rgba(154, 120, 66, 0.16), transparent 36%),
          linear-gradient(180deg, #f7f3ea 0%, #efe8da 100%);
        color: var(--text);
        font: 17px/1.74 "Pretendard", "Noto Sans KR", sans-serif;
      }
      main {
        max-width: 760px;
        margin: 48px auto;
        padding: 0 20px 48px;
      }
      article {
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 32px;
        padding: 36px 34px 40px;
        box-shadow: 0 24px 80px rgba(77, 56, 17, 0.08);
      }
      .eyebrow, .meta-line, .source-footer { color: var(--muted); font-size: 14px; }
      h1 { margin: 12px 0 14px; font-size: clamp(32px, 5vw, 46px); line-height: 1.16; }
      h2 { margin: 42px 0 14px; font-size: 26px; line-height: 1.3; }
      p, li, td, th, blockquote { margin: 0 0 16px; }
      ul { padding-left: 22px; }
      .subtitle { margin: 0 0 8px; color: var(--muted); }
      .lead { font-size: 19px; line-height: 1.82; margin-top: 18px; }
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
        padding: 20px 22px;
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

export function buildFallbackGeneratedPost({
  primaryCandidate,
  relatedCandidates = [],
  mediaAttachments = [],
  schedulerRunAt,
  generationModel,
  errors = [],
}) {
  const fallback = buildFallbackSummaries(primaryCandidate, relatedCandidates)
  const bodyHtml = [
    `<section><h2>왜 이 항목이 중요했나</h2><p>${escapeHtml(
      `${primaryCandidate.title}는 ${primaryCandidate.sourceLabel || primaryCandidate.sourceType}에서 포착된 항목이며, 최신성·출처 신뢰도·반응 신호를 함께 고려했을 때 우선 검토 가치가 높았습니다.`,
    )}</p></section>`,
    `<section><h2>핵심 내용</h2><p>${escapeHtml(
      primaryCandidate.summary || '공개 설명이 짧아 제목과 메타데이터 위주로 정리했습니다.',
    )}</p></section>`,
    buildSectionHtml([primaryCandidate]),
    relatedCandidates.length > 0
      ? `<section><h2>같이 보면 좋은 관련 흐름</h2>${buildSectionHtml(relatedCandidates)}</section>`
      : '<section><h2>후속 확인 포인트</h2><p>원문 링크와 대표 미디어를 함께 저장했으므로, 실제 제품 발표인지 연구 공개인지, 저장소 활동이 이어지는지 정도를 추가로 점검하면 좋습니다.</p></section>',
  ].join('')

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
    tags: [primaryCandidate.categoryLabel || primaryCandidate.category, primaryCandidate.sourceLabel || primaryCandidate.sourceType].filter(Boolean),
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
        const title = String(payload.title || primaryCandidate.title).trim() || primaryCandidate.title
        const subtitleLines = normalizeLineArray(payload.subtitleLines)
        const lead = String(payload.lead || '').trim() || primaryCandidate.summary || ''
        const threeLineSummary = normalizeLineArray(payload.threeLineSummary)

        return {
          title,
          slug: slugify(title),
          subtitleLines: subtitleLines.length > 0 ? subtitleLines : buildFallbackSummaries(primaryCandidate, relatedCandidates).subtitleLines,
          lead,
          plainTextSummary: String(payload.plainTextSummary || lead).trim(),
          threeLineSummary:
            threeLineSummary.length >= 3
              ? threeLineSummary.slice(0, 3)
              : buildFallbackGeneratedPost({
                  primaryCandidate,
                  relatedCandidates,
                  mediaAttachments,
                  schedulerRunAt,
                  generationModel,
                }).threeLineSummary,
          html: payload.html.trim(),
          tags: Array.isArray(payload.tags)
            ? payload.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
            : [],
          generationModel: generationModel || response?.model || 'codex',
          generationPromptVersion: AUTO_POST_PROMPT_VERSION,
          errors,
        }
      }

      errors.push('모델이 비어 있거나 파싱 불가능한 게시글을 반환했습니다.')
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
