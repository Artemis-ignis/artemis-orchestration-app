export type MessageItem = {
  id: string
  role: 'master' | 'assistant' | 'tool'
  speaker: string
  time: string
  text: string
}

export type ToolRun = {
  id: string
  icon: string
  name: string
  detail: string
  status: 'done' | 'running' | 'queued' | 'blocked'
  duration: string
}

export type ApprovalItem = {
  id: string
  title: string
  detail: string
  owner: string
  impact: string
}

export type RiskItem = {
  id: string
  title: string
  detail: string
  severity: 'high' | 'medium' | 'low'
  severityLabel: '높음' | '중간' | '낮음'
}

export type QueueItem = {
  id: string
  title: string
  channel: string
  due: string
}

export type FileItem = {
  id: string
  icon: string
  name: string
  meta: string
  tag: string
}

export type SignalItem = {
  id: string
  title: string
  detail: string
  delta: string
}

export type MetricItem = {
  label: string
  value: string
  context: string
}

export type Workspace = {
  id: string
  name: string
  summary: string
  objective: string
  objectiveDetail: string
  mode: string
  stage: string
  health: 'stable' | 'attention'
  connectors: string[]
  progress: {
    done: number
    total: number
    label: string
  }
  metrics: MetricItem[]
  prompts: string[]
  draftPrompt: string
  messages: MessageItem[]
  toolRuns: ToolRun[]
  approvals: ApprovalItem[]
  risks: RiskItem[]
  queue: QueueItem[]
  files: FileItem[]
  signals: SignalItem[]
}

export const workspaces: Workspace[] = [
  {
    id: 'partnership-launch-cell',
    name: '파트너십 런치 셀',
    summary: '메일, 일정, 문서를 묶어 4월 파트너십 아웃리치를 승인 가능한 상태로 압축합니다.',
    objective: '제안서 발송 직전까지 승인과 리스크를 한 화면에서 잠근다',
    objectiveDetail:
      '법무, 대표, 영업 리더의 승인 게이트를 먼저 통과시키고, 그 다음에만 외부 발송이 열리도록 설계한 오케스트레이션 화면입니다.',
    mode: '감독형 오토파일럿',
    stage: '승인 직전',
    health: 'stable',
    connectors: ['Gmail', 'Calendar', 'Drive', 'CRM', 'Slack', 'Docs'],
    progress: {
      done: 7,
      total: 9,
      label: '법무 검토와 대표 승인 슬롯만 남아 있습니다.',
    },
    metrics: [
      {
        label: '실행 중 도구',
        value: '3개',
        context: 'CRM 동기화, 캘린더 탐색, 문서 비교가 동시에 돌아가는 중입니다.',
      },
      {
        label: '승인 대기',
        value: '2건',
        context: '대표 승인과 외부 발송 허용이 아직 잠겨 있습니다.',
      },
      {
        label: '다음 마감',
        value: '오늘 17:00',
        context: '그 전에 아웃리치 명단과 첨부 버전이 고정되어야 합니다.',
      },
    ],
    prompts: ['상위 12개만 다시 추려줘', '법무 코멘트 반영본 보여줘', '승인 없으면 발송 막아'],
    draftPrompt:
      '대표 승인 전에는 외부 발송을 잠그고, 법무 코멘트 반영본과 첨부 파일 버전 차이만 먼저 비교해줘.',
    messages: [
      {
        id: 'plc-message-1',
        role: 'master',
        speaker: '마스터',
        time: '09:12',
        text: '이번 주 안에 보낼 파트너 제안서 후보군 다시 정리해. 승인 전에는 외부 발송 열지 마.',
      },
      {
        id: 'plc-message-2',
        role: 'assistant',
        speaker: '아르테미스',
        time: '09:13',
        text: '후보군 재정렬, 법무 반영본 비교, 대표 승인 슬롯 확보 순으로 묶겠습니다. 승인 게이트는 잠가두겠습니다.',
      },
      {
        id: 'plc-message-3',
        role: 'tool',
        speaker: '도구 로그',
        time: '09:15',
        text: 'CRM과 Gmail 이력 교차 조회 완료. 최근 60일 기준 응답 이력이 있는 파트너 12곳이 우선 후보입니다.',
      },
      {
        id: 'plc-message-4',
        role: 'assistant',
        speaker: '아르테미스',
        time: '09:17',
        text: '현재 리스크는 두 가지입니다. 첨부 문서 버전 차이 1건, 대표 일정 충돌 1건. 둘 중 하나라도 열리기 전에는 발송을 보류하겠습니다.',
      },
    ],
    toolRuns: [
      {
        id: 'plc-tool-1',
        icon: 'CRM',
        name: '연락처 신선도 점검',
        detail: '반송 이력이 있는 파트너와 최근 응답 파트너를 분리했습니다.',
        status: 'done',
        duration: '41초',
      },
      {
        id: 'plc-tool-2',
        icon: 'CAL',
        name: '대표 승인 슬롯 탐색',
        detail: '오늘 15:30과 16:10 사이 짧은 승인 슬롯을 찾는 중입니다.',
        status: 'running',
        duration: '진행 중',
      },
      {
        id: 'plc-tool-3',
        icon: 'DOC',
        name: '제안서 버전 비교',
        detail: '법무 반영본과 외부 공유본의 조항 차이를 추적 중입니다.',
        status: 'running',
        duration: '진행 중',
      },
      {
        id: 'plc-tool-4',
        icon: 'SLK',
        name: '영업 리더 브리핑 예약',
        detail: '대표 승인 이후에만 자동 전송되도록 큐에 올렸습니다.',
        status: 'queued',
        duration: '13:00 예정',
      },
    ],
    approvals: [
      {
        id: 'plc-approval-1',
        title: '외부 발송 대상 12곳 확정',
        detail: '최근 응답률과 기존 소개 관계를 반영한 최종 명단입니다. 일부 투자사 연락처는 최신 여부 재확인이 필요합니다.',
        owner: '대표',
        impact: '승인 후 아웃리치 큐가 열립니다.',
      },
      {
        id: 'plc-approval-2',
        title: '제안서 v7 외부 공유 허용',
        detail: '법무 수정 조항 2개가 반영되면 공유 링크를 고정하고 발송용 첨부를 교체합니다.',
        owner: '법무',
        impact: '승인 전까지 외부 공유 링크는 잠겨 있습니다.',
      },
    ],
    risks: [
      {
        id: 'plc-risk-1',
        title: '첨부 버전 불일치',
        detail: '영업 드라이브 폴더에는 v7, 공유 드라이브에는 v6가 남아 있어 잘못된 링크 전송 가능성이 있습니다.',
        severity: 'high',
        severityLabel: '높음',
      },
      {
        id: 'plc-risk-2',
        title: '대표 승인 슬롯 부족',
        detail: '오늘 오후 일정이 촘촘해 승인 요청이 밀리면 전체 발송이 하루 늦어질 수 있습니다.',
        severity: 'medium',
        severityLabel: '중간',
      },
      {
        id: 'plc-risk-3',
        title: '일부 파트너 연락처 노후화',
        detail: '최근 반송 이력이 있는 주소가 2건 보입니다. 발송 직전 재검증이 필요합니다.',
        severity: 'low',
        severityLabel: '낮음',
      },
    ],
    queue: [
      {
        id: 'plc-queue-1',
        title: '대표 승인 브리핑 전달',
        channel: 'Slack DM',
        due: '10:30',
      },
      {
        id: 'plc-queue-2',
        title: '법무 코멘트 반영본 생성',
        channel: 'Docs',
        due: '13:00',
      },
      {
        id: 'plc-queue-3',
        title: '발송 전 최종 링크 교체 점검',
        channel: 'Drive',
        due: '16:30',
      },
    ],
    files: [
      {
        id: 'plc-file-1',
        icon: 'PDF',
        name: 'partner_outreach_v7.pdf',
        meta: '최종 외부 발송본 후보',
        tag: '승인 전',
      },
      {
        id: 'plc-file-2',
        icon: 'XLS',
        name: 'shortlist_q2.xlsx',
        meta: '우선 파트너 12곳과 점수표',
        tag: '후보군',
      },
      {
        id: 'plc-file-3',
        icon: 'MD',
        name: 'ceo_brief.md',
        meta: '대표 2분 승인용 요약',
        tag: '브리핑',
      },
    ],
    signals: [
      {
        id: 'plc-signal-1',
        title: '예상 오픈율 상향',
        detail: '후보군 재정렬 후 초기 오픈율 추정이 개선되었습니다.',
        delta: '+6%',
      },
      {
        id: 'plc-signal-2',
        title: '반송 가능 주소 감지',
        detail: '연락처 2건이 지난달 반송 목록과 겹칩니다.',
        delta: '-2건',
      },
      {
        id: 'plc-signal-3',
        title: '승인 병목 집중',
        detail: '현재 전체 흐름은 대표 승인 슬롯 하나에 가장 크게 의존합니다.',
        delta: '-1 병목',
      },
    ],
  },
  {
    id: 'launch-war-room',
    name: '제품 출시 워룸',
    summary: '출시 체크리스트, QA 신호, 커뮤니케이션 초안을 한 판에서 묶어 릴리스 직전 흔들림을 줄입니다.',
    objective: '릴리스 직전 이슈를 분류하고, 공지와 대응안을 같은 흐름으로 엮는다',
    objectiveDetail:
      '버그 재현, 공지 초안, 지원팀 응대 매크로까지 하나의 워크스페이스에서 이어지도록 구성했습니다.',
    mode: '자율 실행',
    stage: '운영 중',
    health: 'attention',
    connectors: ['GitHub', 'Sentry', 'Linear', 'Slack', 'Notion', 'Docs'],
    progress: {
      done: 5,
      total: 8,
      label: '핫픽스 우선순위와 공지 문구 동기화가 필요합니다.',
    },
    metrics: [
      {
        label: '핫픽스 후보',
        value: '4건',
        context: '크래시 재현과 결제 흐름 오류가 상단에 묶여 있습니다.',
      },
      {
        label: '공지 초안',
        value: '2종',
        context: '사용자용 공지와 내부 대응 초안을 나눠 준비했습니다.',
      },
      {
        label: '응답 SLA',
        value: '11분',
        context: '지원팀 첫 답변 평균이 목표치보다 약간 느립니다.',
      },
    ],
    prompts: ['상위 버그만 다시 묶어', '출시 공지 초안 보여줘', '지원팀 답변 톤 통일해'],
    draftPrompt:
      'Sentry 상위 크래시만 따로 뽑고, 공지 초안은 결제 오류와 로그인 오류를 구분해서 다시 써줘.',
    messages: [
      {
        id: 'lwr-message-1',
        role: 'master',
        speaker: '마스터',
        time: '08:50',
        text: '오늘 출시 전에 치명도 높은 버그만 먼저 정리하고, 사용자 공지도 과장 없이 써.',
      },
      {
        id: 'lwr-message-2',
        role: 'assistant',
        speaker: '아르테미스',
        time: '08:51',
        text: 'Sentry, Linear, 기존 공지 초안을 묶어 상위 이슈만 분리하겠습니다. 결제 흐름과 로그인 흐름을 별도 트랙으로 관리하겠습니다.',
      },
      {
        id: 'lwr-message-3',
        role: 'tool',
        speaker: '도구 로그',
        time: '08:54',
        text: '지난 12시간 기준 크래시 상위 3개는 iOS 로그인, 결제 리다이렉트, 이미지 업로드 타임아웃입니다.',
      },
    ],
    toolRuns: [
      {
        id: 'lwr-tool-1',
        icon: 'SEN',
        name: '상위 크래시 집계',
        detail: '릴리스 빌드 기준 사용자 영향도 순으로 그룹핑했습니다.',
        status: 'done',
        duration: '32초',
      },
      {
        id: 'lwr-tool-2',
        icon: 'GIT',
        name: '핫픽스 브랜치 영향 파일 분석',
        detail: '로그인 모듈과 결제 콜백 처리 코드가 동시에 바뀐 커밋을 추적 중입니다.',
        status: 'running',
        duration: '진행 중',
      },
      {
        id: 'lwr-tool-3',
        icon: 'DOC',
        name: '사용자 공지 초안 정리',
        detail: '문제 원인 단정 없이 영향 범위와 우회 방법 중심으로 문안을 다듬고 있습니다.',
        status: 'queued',
        duration: '09:40 예정',
      },
      {
        id: 'lwr-tool-4',
        icon: 'SUP',
        name: '지원팀 답변 매크로 재작성',
        detail: '현재 결제 오류 설명에 근거 없는 추정 문구가 있어 자동 배포를 막았습니다.',
        status: 'blocked',
        duration: '근거 확인 필요',
      },
    ],
    approvals: [
      {
        id: 'lwr-approval-1',
        title: '사용자 공지 게시',
        detail: '결제 실패와 로그인 지연을 분리 공지할지, 하나의 공지로 묶을지 결정이 필요합니다.',
        owner: '제품 총괄',
        impact: '게시되면 지원팀 매크로도 함께 열립니다.',
      },
    ],
    risks: [
      {
        id: 'lwr-risk-1',
        title: '지원팀 매크로의 추정 문구',
        detail: '원인이 확정되지 않았는데 특정 브라우저 이슈로 단정하는 문구가 남아 있습니다.',
        severity: 'high',
        severityLabel: '높음',
      },
      {
        id: 'lwr-risk-2',
        title: '핫픽스 범위 확장',
        detail: '결제 콜백 수정이 로그인 상태 유지 로직과 겹쳐 배포 범위가 넓어질 수 있습니다.',
        severity: 'medium',
        severityLabel: '중간',
      },
    ],
    queue: [
      {
        id: 'lwr-queue-1',
        title: '릴리스 노트 초안 정리',
        channel: 'Notion',
        due: '09:45',
      },
      {
        id: 'lwr-queue-2',
        title: '핫픽스 후보 커밋 비교',
        channel: 'GitHub',
        due: '10:10',
      },
      {
        id: 'lwr-queue-3',
        title: '지원팀 대응 매크로 배포',
        channel: 'Slack',
        due: '승인 후',
      },
    ],
    files: [
      {
        id: 'lwr-file-1',
        icon: 'TXT',
        name: 'release_notice_draft.txt',
        meta: '사용자 공지 초안',
        tag: '초안',
      },
      {
        id: 'lwr-file-2',
        icon: 'DOC',
        name: 'support_macro_v3.docx',
        meta: '지원팀 매크로 재작성본',
        tag: '검토 중',
      },
      {
        id: 'lwr-file-3',
        icon: 'CSV',
        name: 'sentry_top_crashes.csv',
        meta: '상위 크래시 묶음',
        tag: '원본',
      },
    ],
    signals: [
      {
        id: 'lwr-signal-1',
        title: '크래시 집중도 상승',
        detail: '로그인 관련 예외가 40분 사이 급증했습니다.',
        delta: '-18%',
      },
      {
        id: 'lwr-signal-2',
        title: '공지 초안 완성도 상승',
        detail: '사용자 영향과 우회 방법이 분리되며 읽기 쉬워졌습니다.',
        delta: '+1 단계',
      },
      {
        id: 'lwr-signal-3',
        title: '배포 범위 확장 가능성',
        detail: '핫픽스가 다른 인증 모듈까지 건드릴 수 있습니다.',
        delta: '-주의',
      },
    ],
  },
  {
    id: 'inbound-command-desk',
    name: '인바운드 커맨드 데스크',
    summary: '문의, 리드, 미팅 후속 작업을 하나로 묶어 놓치는 항목 없이 다음 액션으로 연결합니다.',
    objective: '인바운드와 후속 작업을 자동 분류해 응답 누락을 줄인다',
    objectiveDetail:
      '메일 요약, 미팅 메모, 후속 액션 생성을 한 흐름으로 연결해 사람이 놓치기 쉬운 틈을 줄이는 콘솔입니다.',
    mode: '감독형',
    stage: '정리 중',
    health: 'stable',
    connectors: ['Gmail', 'Calendar', 'HubSpot', 'Drive', 'Slack'],
    progress: {
      done: 6,
      total: 7,
      label: 'VIP 문의 1건만 답변 결재를 기다리는 상태입니다.',
    },
    metrics: [
      {
        label: '미응답 문의',
        value: '1건',
        context: 'VIP 고객 문의만 승인 응답을 기다리고 있습니다.',
      },
      {
        label: '자동 분류 정확도',
        value: '94%',
        context: '최근 30개 스레드 기준으로 분류 재작업이 크게 줄었습니다.',
      },
      {
        label: '다음 후속 미팅',
        value: '14:00',
        context: '오늘 오후 고객 데모 후속 메일 초안이 준비되어 있습니다.',
      },
    ],
    prompts: ['VIP 문의만 추려줘', '미팅 후속 메일 만들어줘', '답변 톤을 더 차분하게'],
    draftPrompt:
      'VIP 문의 1건은 승인 대기 큐에 두고, 나머지는 회신 초안과 다음 액션만 먼저 정리해줘.',
    messages: [
      {
        id: 'icd-message-1',
        role: 'master',
        speaker: '마스터',
        time: '07:48',
        text: '어제 데모 이후 들어온 메일과 미팅 액션을 한 번에 정리해.',
      },
      {
        id: 'icd-message-2',
        role: 'assistant',
        speaker: '아르테미스',
        time: '07:49',
        text: '문의 성격 분류, 미팅 메모 요약, 후속 메일 초안까지 묶어서 보여드리겠습니다. VIP 문의는 승인 게이트에 올려두겠습니다.',
      },
      {
        id: 'icd-message-3',
        role: 'tool',
        speaker: '도구 로그',
        time: '07:53',
        text: '새 인바운드 14건을 가격 문의, 기능 문의, 일정 조율, VIP 대응으로 자동 분류했습니다.',
      },
    ],
    toolRuns: [
      {
        id: 'icd-tool-1',
        icon: 'GML',
        name: '새 메일 분류',
        detail: '14건을 태그와 우선순위 기준으로 정리했습니다.',
        status: 'done',
        duration: '19초',
      },
      {
        id: 'icd-tool-2',
        icon: 'CAL',
        name: '후속 미팅 액션 추출',
        detail: '캘린더 메모와 미팅 노트를 합쳐 다음 액션 초안을 만들었습니다.',
        status: 'done',
        duration: '27초',
      },
      {
        id: 'icd-tool-3',
        icon: 'HUB',
        name: 'CRM 리드 업데이트',
        detail: 'VIP 문의 1건은 승인 없이는 상태를 변경하지 않도록 잠가두었습니다.',
        status: 'queued',
        duration: '승인 후',
      },
    ],
    approvals: [
      {
        id: 'icd-approval-1',
        title: 'VIP 문의 답변 발송',
        detail: '가격 예외 정책 언급이 포함되어 있어 외부 발송 전 최종 검토가 필요합니다.',
        owner: '영업 리드',
        impact: '승인 후 CRM 상태와 후속 미팅 초안이 동시에 열립니다.',
      },
    ],
    risks: [
      {
        id: 'icd-risk-1',
        title: '가격 예외 문구 노출 가능성',
        detail: '내부 승인 기준이 외부 답변 초안에 일부 남아 있습니다.',
        severity: 'high',
        severityLabel: '높음',
      },
    ],
    queue: [
      {
        id: 'icd-queue-1',
        title: '데모 후속 메일 발송',
        channel: 'Gmail',
        due: '14:10',
      },
      {
        id: 'icd-queue-2',
        title: 'CRM 리드 단계 갱신',
        channel: 'HubSpot',
        due: '승인 후',
      },
      {
        id: 'icd-queue-3',
        title: '후속 미팅 자료 공유',
        channel: 'Drive',
        due: '16:00',
      },
    ],
    files: [
      {
        id: 'icd-file-1',
        icon: 'MD',
        name: 'demo_followup_notes.md',
        meta: '데모 후속 메모와 액션',
        tag: '내부용',
      },
      {
        id: 'icd-file-2',
        icon: 'EML',
        name: 'vip_reply_draft.eml',
        meta: 'VIP 문의 답변 초안',
        tag: '승인 대기',
      },
      {
        id: 'icd-file-3',
        icon: 'CSV',
        name: 'inbound_triage.csv',
        meta: '문의 분류 결과',
        tag: '리포트',
      },
    ],
    signals: [
      {
        id: 'icd-signal-1',
        title: '자동 분류 안정화',
        detail: '수동 재분류가 지난주 대비 줄었습니다.',
        delta: '+9%',
      },
      {
        id: 'icd-signal-2',
        title: 'VIP 답변 리스크 감지',
        detail: '가격 예외 정책이 외부 문구에 섞여 있습니다.',
        delta: '-1 리스크',
      },
    ],
  },
]
