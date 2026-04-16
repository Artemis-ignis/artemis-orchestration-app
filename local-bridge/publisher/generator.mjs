import { canonicalizeUrl, nowIso } from '../auto-posts/normalize.mjs'

export const PUBLISHER_PROMPT_VERSION = '2026-04-16-source-agnostic-v1'

function compactText(value = '', limit = 160) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }

  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trim()}…` : normalized
}

export function determineSummaryType(item = {}) {
  if (item.sourceType === 'paper' || item.arxivId || item.doi) {
    return 'paper-intro'
  }

  const publishedTime = Date.parse(item.publishedAt || 0)
  const ageHours = Number.isFinite(publishedTime) ? Math.max(0, (Date.now() - publishedTime) / 3_600_000) : 48
  if (ageHours <= 12) {
    return 'breaking'
  }

  return 'brief-points'
}

function buildSourceLine(item = {}) {
  const parts = [item.provider, item.subtitle].filter(Boolean)
  const label = parts.join(' · ')
  return label ? `출처: ${label}` : '출처: 공개 메타데이터'
}

function buildRuleBasedDraft(item = {}, summaryType) {
  const sourceUrl = canonicalizeUrl(item.sourceUrl || item.canonicalUrl || '')
  const authorLine = item.authors?.length ? `저자: ${item.authors.slice(0, 4).join(', ')}` : ''
  const publishedLine = item.publishedAt ? `발행: ${new Date(item.publishedAt).toLocaleString('ko-KR')}` : ''
  const abstractText = compactText(item.abstractOrSnippet || '', summaryType === 'paper-intro' ? 420 : 260)
  const tagLine = Array.isArray(item.tags) && item.tags.length > 0 ? `태그: ${item.tags.slice(0, 5).join(', ')}` : ''

  if (summaryType === 'paper-intro') {
    return [
      `${item.title}`,
      '',
      `${buildSourceLine(item)}`,
      authorLine,
      publishedLine,
      tagLine,
      '',
      `${item.title}는 새로 확인된 논문 또는 연구 항목입니다. 현재 확보된 메타데이터 범위에서 보면, 핵심 주제는 ${compactText(
        item.subtitle || item.tags?.[0] || 'AI 연구',
        60,
      )}에 가깝습니다.`,
      '',
      abstractText
        ? `공개된 초록/설명에 따르면 ${abstractText}`
        : '현재는 제목과 저자, 공개 메타데이터만 확보된 상태라서 해설 범위도 그 수준에 맞춰 보수적으로 유지했습니다.',
      '',
      '읽기 포인트',
      `- 원문 제목: ${item.title}`,
      item.authors?.length ? `- 저자: ${item.authors.slice(0, 5).join(', ')}` : null,
      item.doi ? `- DOI: ${item.doi}` : null,
      item.arxivId ? `- arXiv ID: ${item.arxivId}` : null,
      sourceUrl ? `- 원문 링크: ${sourceUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (summaryType === 'breaking') {
    return [
      `${item.title}`,
      '',
      `${buildSourceLine(item)}`,
      publishedLine,
      '',
      abstractText
        ? `${compactText(item.title, 110)} 관련 최신 공개 항목입니다. 현재 확인된 스니펫 기준으로 보면 ${abstractText}`
        : `${compactText(item.title, 110)} 관련 최신 공개 항목입니다. 현재는 제목과 출처 메타데이터만 확보되어 있어, 추가 확인 전까지는 속보형 브리핑 수준으로 유지합니다.`,
      '',
      '핵심 포인트',
      `- 분류: ${item.sourceType}`,
      sourceUrl ? `- 원문 링크: ${sourceUrl}` : null,
      tagLine ? `- ${tagLine}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    `${item.title}`,
    '',
    `${buildSourceLine(item)}`,
    publishedLine,
    '',
    abstractText
      ? `한 줄 요약: ${compactText(abstractText, 180)}`
      : '한 줄 요약: 현재는 제목과 출처 메타데이터 중심으로만 요약합니다.',
    '',
    '핵심 포인트',
    `- 제공자: ${item.provider}`,
    item.authors?.length ? `- 관련 인물/저자: ${item.authors.slice(0, 4).join(', ')}` : null,
    sourceUrl ? `- 원문 링크: ${sourceUrl}` : null,
    tagLine ? `- ${tagLine}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildGenerationPrompt(item = {}, summaryType) {
  return [
    '다음 공개 소스를 바탕으로 내부 웹사이트 게시용 한국어 초안을 작성해라.',
    '목표는 클릭 유도 문구가 아니라, 운영자가 바로 승인할 수 있는 차분한 게시 초안이다.',
    '과장, 추측, 확정적 단정, full text를 읽은 것처럼 쓰는 표현은 금지한다.',
    '확보한 정보가 메타데이터뿐이면 그 범위를 넘지 마라.',
    '출력은 본문만 작성하고, 마지막 줄에 원문 링크를 포함해라.',
    summaryType === 'paper-intro'
      ? '형식은 논문 소개형으로, 제목/의미/읽기 포인트를 간결하게 설명해라.'
      : summaryType === 'breaking'
        ? '형식은 짧은 속보형으로, 왜 볼 가치가 있는지와 확인 가능한 사실만 적어라.'
        : '형식은 한 줄 요약 + 핵심 포인트형으로 작성해라.',
    '',
    `제목: ${item.title || ''}`,
    `부제/출처: ${item.subtitle || item.provider || ''}`,
    `저자: ${Array.isArray(item.authors) ? item.authors.join(', ') : ''}`,
    `발행일: ${item.publishedAt || ''}`,
    `요약/초록: ${item.abstractOrSnippet || ''}`,
    `태그: ${Array.isArray(item.tags) ? item.tags.join(', ') : ''}`,
    `원문 링크: ${canonicalizeUrl(item.sourceUrl || item.canonicalUrl || '')}`,
  ].join('\n')
}

export async function generatePublisherDraft({ item, settings, runCodex }) {
  const summaryType = determineSummaryType(item)
  const fallbackText = buildRuleBasedDraft(item, summaryType)
  const generatedAt = nowIso()

  if (typeof runCodex !== 'function') {
    return {
      text: fallbackText,
      usedFallback: true,
      generatedAt,
      promptVersion: PUBLISHER_PROMPT_VERSION,
      model: settings.generationModel,
      summaryType,
    }
  }

  try {
    const response = await runCodex({
      prompt: buildGenerationPrompt(item, summaryType),
      messages: [],
      settings: {
        agentName: 'Artemis Publisher',
        tone: '차분하고 실무적인 편집자',
        responseStyle: '짧은 내부 게시 초안',
        customInstructions:
          '과장하지 말고, 원문 링크를 포함하며, 메타데이터만 있는 경우 그 범위를 넘지 마라.',
        userName: '마스터',
        userRole: '운영자',
        organization: 'Artemis',
        interests: ['AI 소식', '논문', '내부 게시'],
        language: '한국어',
        timezone: 'Asia/Seoul',
        locationSharing: false,
        modelProvider: 'codex',
        ollamaModel: '',
        codexModel: settings.generationModel,
      },
      agent: {
        id: 'source-agnostic-publisher',
        name: 'Artemis Publisher',
        provider: 'codex',
        preset: 'codex-cli',
        model: settings.generationModel,
        systemPrompt:
          '당신은 공개 뉴스/논문 메타데이터를 내부 웹사이트용 한국어 게시 초안으로 정리하는 편집자다. 없는 사실은 쓰지 마라.',
      },
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      enabledTools: [],
    })

    const nextText = String(response?.text || response || '').trim()
    if (!nextText) {
      throw new Error('empty generation')
    }

    return {
      text: nextText,
      usedFallback: false,
      generatedAt,
      promptVersion: PUBLISHER_PROMPT_VERSION,
      model: settings.generationModel,
      summaryType,
    }
  } catch {
    return {
      text: fallbackText,
      usedFallback: true,
      generatedAt,
      promptVersion: PUBLISHER_PROMPT_VERSION,
      model: settings.generationModel,
      summaryType,
    }
  }
}
