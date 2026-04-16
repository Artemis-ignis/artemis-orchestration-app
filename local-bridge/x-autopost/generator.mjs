import { canonicalizeUrl, nowIso } from '../auto-posts/normalize.mjs'

export const X_AUTOPOST_PROMPT_VERSION = '2026-04-16-x-v1'

function trimSummary(value = '', limit = 120) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }

  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}…` : normalized
}

function pickTemplateVariant(sourceItem) {
  const signature = `${sourceItem.sourceTitle || sourceItem.title || ''}${sourceItem.sourceUrl || sourceItem.url || ''}`
  const number = Array.from(signature).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return number % 4
}

function buildRuleBasedDraft(sourceItem) {
  const title = trimSummary(sourceItem.sourceTitle || sourceItem.title || '', 88)
  const summary = trimSummary(sourceItem.summary || '', 118)
  const sourceUrl = canonicalizeUrl(sourceItem.sourceUrl || sourceItem.url || '')
  const author = String(sourceItem.authorOrChannel || '').trim()
  const publishedLabel = sourceItem.publishedAt
    ? new Date(sourceItem.publishedAt).toLocaleDateString('ko-KR')
    : ''
  const variant = pickTemplateVariant(sourceItem)

  const variants = [
    [
      `${title}${title.endsWith('.') ? '' : '.'}`,
      summary ? `핵심은 ${summary}` : `${sourceItem.sourceLabel || sourceItem.source || '출처'}에서 직접 확인할 만한 업데이트입니다.`,
      `${author ? `${author} / ` : ''}${publishedLabel ? `${publishedLabel} 공개 신호` : '공개 신호 정리'}`,
    ],
    [
      `지금 체크할 AI 업데이트는 ${title}${title.endsWith('.') ? '' : '.'}`,
      summary ? `${summary}` : '실무적으로 바로 영향을 줄 수 있는 변화입니다.',
      `${sourceItem.sourceLabel || sourceItem.source || '출처'} 원문: ${sourceUrl}`,
    ],
    [
      `${title}${title.endsWith('.') ? '' : '.'}`,
      summary ? `왜 보냐면 ${summary}` : '기능 변화보다 운영 맥락을 같이 봐야 하는 신호입니다.',
      `${sourceItem.sourceLabel || sourceItem.source || '출처'} 기준으로 정리했습니다.`,
    ],
    [
      `${title}${title.endsWith('.') ? '' : '.'}`,
      summary ? `요약하면 ${summary}` : '과장 없이 원문 기준만 짧게 정리합니다.',
      `${author ? `${author} / ` : ''}${sourceItem.category || 'AI 및 기술'} 신호`,
    ],
  ]

  const lines = variants[variant].filter(Boolean)
  if (sourceUrl && !lines[lines.length - 1]?.includes(sourceUrl)) {
    lines.push(sourceUrl)
  }

  return lines.join('\n')
}

function fitTextToX(text, sourceUrl = '') {
  const normalized = String(text ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!sourceUrl) {
    return normalized.slice(0, 280).trim()
  }

  const bareText = normalized.replace(sourceUrl, '').trim()
  const reservedUrlLength = Math.max(sourceUrl.length, 24)
  const budget = Math.max(120, 278 - reservedUrlLength - 1)
  const fitted = bareText.length > budget ? `${bareText.slice(0, budget - 1).trim()}…` : bareText
  return `${fitted}\n${sourceUrl}`.trim()
}

function buildGenerationPrompt(sourceItem) {
  return [
    '다음 공개 시그널을 바탕으로 X 게시글 초안을 한국어로 작성하세요.',
    '목표는 링크 공유가 아니라 짧은 분석형 브리핑입니다.',
    '과장, 낚시성 표현, 확정적 단정, 근거 없는 예측 금지.',
    '문장 패턴을 최대한 흔한 템플릿처럼 쓰지 말고, 실무자가 바로 읽어도 되는 수준으로 차분하게 작성하세요.',
    '반드시 출처 링크를 마지막 줄에 포함하세요.',
    '해시태그는 기본적으로 쓰지 마세요.',
    '280자 안쪽으로 유지하고, 본문은 2~4개의 짧은 문장으로 구성하세요.',
    '출력은 게시글 본문만 반환하세요.',
    '',
    `출처: ${sourceItem.sourceLabel || sourceItem.source || '공개 시그널'}`,
    `분류: ${sourceItem.category || 'AI 및 기술'}`,
    `제목: ${sourceItem.sourceTitle || sourceItem.title || ''}`,
    `요약: ${sourceItem.summary || ''}`,
    `작성자/채널: ${sourceItem.authorOrChannel || ''}`,
    `게시 시각: ${sourceItem.publishedAt || ''}`,
    `링크: ${canonicalizeUrl(sourceItem.sourceUrl || sourceItem.url || '')}`,
  ].join('\n')
}

export async function generateXAutopostDraft({ sourceItem, settings, runCodex }) {
  const sourceUrl = canonicalizeUrl(sourceItem.sourceUrl || sourceItem.url || '')
  const fallbackText = fitTextToX(buildRuleBasedDraft(sourceItem), sourceUrl)
  const generatedAt = nowIso()

  if (typeof runCodex !== 'function') {
    return {
      text: fallbackText,
      usedFallback: true,
      generatedAt,
      promptVersion: X_AUTOPOST_PROMPT_VERSION,
      model: settings.generationModel,
    }
  }

  try {
    const response = await runCodex({
      prompt: buildGenerationPrompt(sourceItem),
      messages: [],
      settings: {
        agentName: 'Artemis X Publisher',
        tone: '차분하고 실무적인 편집자',
        responseStyle: '짧은 X 게시글',
        customInstructions: '사실을 과장하지 않고, 같은 템플릿을 반복하지 않으며, 출처 링크를 항상 포함하세요.',
        userName: '마스터',
        userRole: '오너',
        organization: 'Artemis',
        interests: ['AI 시그널', '자동 게시'],
        language: '한국어',
        timezone: 'Asia/Seoul',
        locationSharing: false,
        modelProvider: 'codex',
        ollamaModel: '',
        codexModel: settings.generationModel,
      },
      agent: {
        id: 'x-autopost-generator',
        name: 'Artemis X Publisher',
        provider: 'codex',
        preset: 'codex-cli',
        model: settings.generationModel,
        systemPrompt: '당신은 AI 시그널을 X 게시글 초안으로 압축하는 편집자다. 과장하지 말고, 실무자 관점의 맥락을 짧게 설명하라.',
      },
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      enabledTools: [],
    })

    const nextText = fitTextToX(String(response?.text || response || '').trim(), sourceUrl)
    if (!nextText) {
      throw new Error('생성 결과가 비어 있습니다.')
    }

    return {
      text: nextText,
      usedFallback: false,
      generatedAt,
      promptVersion: X_AUTOPOST_PROMPT_VERSION,
      model: settings.generationModel,
    }
  } catch {
    return {
      text: fallbackText,
      usedFallback: true,
      generatedAt,
      promptVersion: X_AUTOPOST_PROMPT_VERSION,
      model: settings.generationModel,
    }
  }
}
