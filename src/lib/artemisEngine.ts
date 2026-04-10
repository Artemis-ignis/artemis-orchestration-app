import type { EngineResult, RuntimeState } from '../state/types'

function makeSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 28)
}

function buildSubject(prompt: string) {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 42) || '작업 초안'
}

function detectIntent(prompt: string): EngineResult['intent'] {
  const value = prompt.toLowerCase()

  if (/(ppt|pptx|pdf|보고서|문서|제안서|슬라이드|스프레드시트|발표)/.test(value)) {
    return 'document'
  }

  if (/(자동화|예약|매일|매주|리마인드|알림)/.test(value)) {
    return 'automation'
  }

  if (/(번역|translate|영문|영어|국문|한글)/.test(value)) {
    return 'translation'
  }

  if (/(코드|개발|버그|리팩터링|api|csv|테스트)/.test(value)) {
    return 'coding'
  }

  if (/(파일|폴더|정리|업로드|검색|저장)/.test(value)) {
    return 'files'
  }

  return 'general'
}

export function buildExecutionResult(
  _state: RuntimeState,
  prompt: string,
  options?: { assistantText?: string; provider?: string; model?: string },
): EngineResult {
  const intent = detectIntent(prompt)
  const subject = buildSubject(prompt)
  const generatedText = options?.assistantText?.trim()
  const stamp = new Date().toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  if (intent === 'document') {
    const fileName = `${makeSlug(subject) || 'artemis-document'}.md`

    return {
      intent,
      toolLabel: '문서 초안',
      toolText: `${fileName} 초안을 파일함에 저장했습니다.`,
      assistantText:
        generatedText ||
        '문서 작업으로 분류했습니다. 초안 파일을 만들었고, 원하시면 바로 목차와 세부 항목까지 확장하겠습니다.',
      artifacts: {
        files: [
          {
            name: fileName,
            mimeType: 'text/markdown',
            content: `# ${subject}\n\n- 생성 시각: ${stamp}\n- 요청 내용: ${prompt}\n${
              options?.provider
                ? `- 실행 모델: ${options.provider}${options.model ? ` / ${options.model}` : ''}\n`
                : ''
            }\n## 결과\n${generatedText || '문서 초안이 생성되었습니다.'}\n`,
            source: 'generated',
            tag: '초안',
          },
        ],
        insights: [
          {
            title: '문서 초안 생성',
            detail: `${fileName} 파일을 만들었습니다.`,
            source: 'chat',
          },
        ],
        activities: [
          {
            type: 'file',
            title: '문서 초안 생성',
            detail: fileName,
            page: 'files',
          },
        ],
      },
    }
  }

  if (intent === 'automation') {
    return {
      intent,
      toolLabel: '자동화 메모',
      toolText: '자동화 후보 작업을 인사이트와 활동에 기록했습니다.',
      assistantText:
        generatedText ||
        '자동화 후보로 분류했습니다. 추후 반복 실행 규칙이나 작업 흐름으로 확장할 수 있습니다.',
      artifacts: {
        insights: [
          {
            title: '자동화 후보 감지',
            detail: subject,
            source: 'chat',
          },
        ],
        activities: [
          {
            type: 'tool',
            title: '자동화 후보 기록',
            detail: prompt,
            page: 'activity',
          },
        ],
      },
    }
  }

  if (intent === 'translation') {
    const fileName = `${makeSlug(subject) || 'translation-result'}-번역본.md`

    return {
      intent,
      toolLabel: '번역 결과',
      toolText: `${fileName} 번역 초안을 파일함에 저장했습니다.`,
      assistantText:
        generatedText ||
        '번역 작업으로 분류했습니다. 결과 초안을 파일로 남겼고, 문단 단위로 더 다듬을 수 있습니다.',
      artifacts: {
        files: [
          {
            name: fileName,
            mimeType: 'text/markdown',
            content: `# 번역 초안\n\n원문 요청: ${prompt}\n\n## 결과\n${generatedText || '번역 결과 초안을 정리했습니다.'}\n`,
            source: 'generated',
            tag: '번역',
          },
        ],
        activities: [
          {
            type: 'file',
            title: '번역 초안 생성',
            detail: fileName,
            page: 'files',
          },
        ],
      },
    }
  }

  if (intent === 'coding') {
    const fileName = `${makeSlug(subject) || 'engineering-brief'}-spec.md`

    return {
      intent,
      toolLabel: '개발 메모',
      toolText: '개발 요청 메모를 파일함에 저장했습니다.',
      assistantText:
        generatedText ||
        '개발 요청으로 분류했습니다. 현재 상태에서 바로 다음 작업으로 이어갈 수 있게 메모와 인사이트를 함께 남겼습니다.',
      artifacts: {
        files: [
          {
            name: fileName,
            mimeType: 'text/markdown',
            content: `# 개발 작업 메모\n\n요청: ${prompt}\n\n## 모델 응답\n${generatedText || '문제 정의와 다음 구현 포인트를 정리했습니다.'}\n`,
            source: 'generated',
            tag: '개발',
          },
        ],
        insights: [
          {
            title: '개발 요청 정리',
            detail: subject,
            source: 'chat',
          },
        ],
        activities: [
          {
            type: 'tool',
            title: '개발 요청 메모',
            detail: subject,
            page: 'activity',
          },
        ],
      },
    }
  }

  if (intent === 'files') {
    return {
      intent,
      toolLabel: '파일 작업 메모',
      toolText: '파일 관련 요청을 활동과 인사이트에 기록했습니다.',
      assistantText:
        generatedText ||
        '파일 작업 요청으로 분류했습니다. 실제 파일 읽기나 정리는 다음 단계에서 이어서 처리할 수 있습니다.',
      artifacts: {
        insights: [
          {
            title: '파일 작업 요청',
            detail: subject,
            source: 'chat',
          },
        ],
        activities: [
          {
            type: 'file',
            title: '파일 작업 요청',
            detail: prompt,
            page: 'files',
          },
        ],
      },
    }
  }

  return {
    intent,
    toolLabel: '일반 작업 메모',
    toolText: '요청을 활동 로그와 인사이트에 기록했습니다.',
    assistantText:
      generatedText ||
      '요청 내용을 작업 메모로 정리했습니다. 필요하면 문서, 코드, 파일 흐름으로 더 구체화하겠습니다.',
    artifacts: {
      insights: [
        {
          title: '일반 요청 기록',
          detail: prompt,
          source: 'chat',
        },
      ],
      activities: [
        {
          type: 'chat',
          title: '일반 요청 기록',
          detail: subject,
          page: 'chat',
        },
      ],
    },
  }
}
