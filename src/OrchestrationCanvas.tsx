import { useMemo } from 'react'
import type { PageId } from './crewData'
import { Icon, type IconName } from './icons'
import { getAgentProviderLabel } from './lib/agentCatalog'
import type { ExecuteWorkspaceContext } from './lib/modelClient'
import type { AgentItem, AgentRun, ToolItem } from './state/types'

type LatestExecution = {
  source: 'chat' | 'agent'
  request: string
  provider: string
  model: string
  receivedAt: string
  workspace: ExecuteWorkspaceContext
}

type OrchestrationCanvasProps = {
  activeAgent: AgentItem | null
  tools: ToolItem[]
  runs: AgentRun[]
  filesCount: number
  insightsCount: number
  signalCount: number
  activityCount: number
  recentPrompt: string
  messageCount: number
  signalTitles: string[]
  insightTitles: string[]
  activityTitles: string[]
  latestExecution: LatestExecution | null
  bridgeError: string | null
  workspaceError: string | null
  requiresApiKey: boolean
  onNavigate: (page: PageId) => void
  onSelectAgent: (agentId: string) => void
}

type NodeTone =
  | 'trigger'
  | 'agent'
  | 'model'
  | 'memory'
  | 'skill'
  | 'router'
  | 'output'

type StepStatus = 'idle' | 'ready' | 'running' | 'done' | 'blocked'

type GraphNode = {
  id: string
  title: string
  subtitle: string
  badge?: string
  tone: NodeTone
  icon: IconName
  page?: PageId
  agentId?: string
  variant: 'main' | 'support' | 'output'
  label: string
  state: StepStatus
  details?: string[]
}

type GraphEdge = {
  id: string
  path: string
  kind: 'main' | 'support'
  status: StepStatus
}

type GraphEdgeLabel = {
  id: string
  text: string
  positionClassName: string
  status: StepStatus
}

function normalizeModelLabel(value: string) {
  return value.trim().replace(/:latest$/i, '')
}

function runtimeProviderLabel(value: string) {
  if (
    value === 'ollama' ||
    value === 'codex' ||
    value === 'openai-compatible' ||
    value === 'anthropic'
  ) {
    return getAgentProviderLabel(value)
  }

  return value || '미연결'
}

function clipText(value: string, maxLength = 72) {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return ''
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function statusBadge(status: StepStatus) {
  switch (status) {
    case 'running':
      return '실행 중'
    case 'done':
      return '완료'
    case 'blocked':
      return '차단'
    case 'ready':
      return '준비'
    default:
      return '대기'
  }
}

function summarizeList(items: string[], fallback: string, maxLength = 22, limit = 2) {
  const visible = items.map((item) => clipText(item, maxLength)).filter(Boolean).slice(0, limit)
  return visible.length > 0 ? visible : [fallback]
}

function routeSummary({
  latestRun,
  latestExecution,
  bridgeError,
  workspaceError,
  requiresApiKey,
}: {
  latestRun: AgentRun | undefined
  latestExecution: LatestExecution | null
  bridgeError: string | null
  workspaceError: string | null
  requiresApiKey: boolean
}) {
  if (bridgeError) {
    return {
      status: 'blocked' as const,
      badge: '브리지 오류',
      text: clipText(bridgeError, 54),
    }
  }

  if (workspaceError) {
    return {
      status: 'blocked' as const,
      badge: '폴더 오류',
      text: clipText(workspaceError, 54),
    }
  }

  if (requiresApiKey) {
    return {
      status: 'blocked' as const,
      badge: 'API 키 필요',
      text: '선택한 에이전트는 API 키 연결이 필요합니다.',
    }
  }

  if (latestRun?.status === 'running') {
    return {
      status: 'running' as const,
      badge: '실행 중',
      text: '실행 결과를 파일, 인사이트, 로그로 정리하고 있습니다.',
    }
  }

  if (latestExecution) {
    return {
      status: 'done' as const,
      badge: '최근 실행 반영',
      text: `최근 실행 결과가 파일 ${latestExecution.workspace.changedFiles.length}개에 반영됐습니다.`,
    }
  }

  return {
    status: 'ready' as const,
    badge: '분기 준비',
    text: '실행 결과를 파일, 인사이트, 활동 로그로 나눕니다.',
  }
}

function buildGraph({
  activeAgent,
  tools,
  runs,
  filesCount,
  insightsCount,
  signalCount,
  activityCount,
  recentPrompt,
  messageCount,
  signalTitles,
  insightTitles,
  activityTitles,
  latestExecution,
  bridgeError,
  workspaceError,
  requiresApiKey,
}: Omit<OrchestrationCanvasProps, 'onNavigate' | 'onSelectAgent'>) {
  const latestRun = runs[0]
  const activeTools = tools.filter((item) => item.enabled)
  const route = routeSummary({
    latestRun,
    latestExecution,
    bridgeError,
    workspaceError,
    requiresApiKey,
  })

  const runtimeModel = normalizeModelLabel(latestExecution?.model || activeAgent?.model || '')
  const runtimeProvider = latestExecution?.provider || activeAgent?.provider || ''

  const triggerStatus: StepStatus =
    recentPrompt.trim() || latestRun?.task ? (latestRun?.status === 'running' ? 'running' : 'done') : 'idle'

  const agentStatus: StepStatus = activeAgent
    ? activeAgent.status === 'success'
      ? 'done'
      : activeAgent.status === 'error'
        ? 'blocked'
        : activeAgent.status === 'running'
          ? 'running'
          : 'ready'
    : 'blocked'

  const modelStatus: StepStatus = activeAgent
    ? latestRun?.status === 'running'
      ? 'running'
      : latestExecution
        ? 'done'
        : 'ready'
    : 'blocked'

  const memoryStatus: StepStatus = messageCount > 0 || insightsCount > 0 ? 'ready' : 'idle'
  const signalStatus: StepStatus = signalCount > 0 ? 'ready' : 'idle'
  const toolsStatus: StepStatus = activeTools.length > 0 ? 'ready' : 'idle'
  const filesStatus: StepStatus =
    (latestExecution?.workspace.changedFiles.length ?? 0) > 0 ? 'done' : filesCount > 0 ? 'ready' : 'idle'
  const insightsStatus: StepStatus = insightsCount > 0 ? 'done' : 'idle'
  const activityStatus: StepStatus = activityCount > 0 || runs.length > 0 ? 'done' : 'idle'

  const trigger: GraphNode = {
    id: 'trigger',
    title: '작업 입력',
    subtitle:
      clipText(latestRun?.task || recentPrompt, 58) ||
      '채팅이나 수동 요청이 여기서 들어오고, 실행 흐름이 시작됩니다.',
    badge: messageCount > 0 ? `대화 ${messageCount}개` : '입력 대기',
    tone: 'trigger',
    icon: 'spark',
    page: 'chat',
    variant: 'main',
    label: '입력',
    state: triggerStatus,
    details: summarizeList([latestExecution?.request || '', latestRun?.task || '', recentPrompt], '최근 요청 없음'),
  }

  const agent: GraphNode = {
    id: 'agent',
    title: activeAgent?.name || '에이전트 선택 필요',
    subtitle: activeAgent
      ? `${activeAgent.role} · ${statusBadge(agentStatus)}`
      : '설정에서 실행 에이전트를 먼저 선택하세요.',
    badge: activeAgent ? statusBadge(agentStatus) : '선택 필요',
    tone: 'agent',
    icon: 'agent',
    page: activeAgent ? undefined : 'settings',
    agentId: activeAgent?.id,
    variant: 'main',
    label: '중심 처리',
    state: agentStatus,
    details: activeAgent
      ? summarizeList(
          [runtimeProviderLabel(activeAgent.provider), normalizeModelLabel(activeAgent.model)],
          '실행 정보 없음',
          18,
        )
      : ['설정에서 선택'],
  }

  const memory: GraphNode = {
    id: 'memory',
    title: '메모리',
    subtitle: `대화 ${messageCount} · 인사이트 ${insightsCount} · 활동 ${activityCount}`,
    badge: statusBadge(memoryStatus),
    tone: 'memory',
    icon: 'memory',
    page: 'insights',
    variant: 'support',
    label: '참조',
    state: memoryStatus,
    details: summarizeList(
      [
        messageCount > 0 ? `대화 ${messageCount}개` : '',
          insightsCount > 0 ? `인사이트 ${insightsCount}개` : '',
          activityCount > 0 ? `활동 ${activityCount}건` : '',
        ],
        '기록 없음',
        18,
        2,
      ),
    }

  const model: GraphNode = {
    id: 'model',
    title: runtimeModel || '모델 연결 필요',
    subtitle: runtimeProvider ? `${runtimeProviderLabel(runtimeProvider)} 실행 모델` : '현재 실행 모델을 추적합니다.',
    badge: runtimeProvider ? runtimeProviderLabel(runtimeProvider) : '미연결',
    tone: 'model',
    icon: 'chat',
    page: 'settings',
    variant: 'support',
    label: '모델',
    state: modelStatus,
    details: summarizeList([runtimeModel, runtimeProviderLabel(runtimeProvider)], '모델 미연결', 18, 1),
  }

  const signals: GraphNode = {
    id: 'signals',
    title: '시그널',
    subtitle: signalCount > 0 ? `구독 시그널 ${signalCount}개` : '연결된 시그널이 없습니다.',
    badge: `${signalCount}개`,
    tone: 'memory',
    icon: 'signals',
    page: 'signals',
    variant: 'support',
    label: '보조 입력',
    state: signalStatus,
    details: summarizeList(signalTitles, '구독 없음', 18, 1),
  }

  const toolsNode: GraphNode = {
    id: 'tools',
    title: activeTools.length > 0 ? `도구 ${activeTools.length}개` : '도구 연결 없음',
    subtitle:
      activeTools.length > 0
        ? `${clipText(activeTools[0]?.title || '', 22)} 중심으로 실행 준비됨`
        : '활성 스킬과 도구가 아직 없습니다.',
    badge: activeTools.length > 0 ? `${activeTools.length}개` : '0개',
    tone: 'skill',
    icon: 'tools',
    page: 'tools',
    variant: 'support',
    label: '도구',
    state: toolsStatus,
    details: summarizeList(activeTools.map((item) => item.title), '활성 도구 없음', 18, 1),
  }

  const router: GraphNode = {
    id: 'router',
    title: '조건 분기',
    subtitle: route.text,
    badge: route.badge,
    tone: 'router',
    icon: 'route',
    variant: 'main',
    label: '판정',
    state: route.status,
    details: summarizeList(
      [
        bridgeError || '',
        workspaceError || '',
        requiresApiKey ? 'API 키 연결 필요' : '',
        latestExecution ? '최근 실행 기록 있음' : '',
      ],
      '조건 확인 중',
      18,
      1,
    ),
  }

  const changedFileCount = latestExecution?.workspace.changedFiles.length ?? 0
  const latestLogCount = latestRun?.logs.length ?? 0

  const outputs: GraphNode[] = [
    {
      id: 'files',
      title: '내 파일',
      subtitle: changedFileCount > 0 ? `변경 파일 ${changedFileCount}개` : `작업 폴더 파일 ${filesCount}개`,
      badge: changedFileCount > 0 ? `변경 ${changedFileCount}` : `${filesCount}개`,
      tone: 'output',
      icon: 'files',
      page: 'files',
      variant: 'output',
      label: '결과',
      state: filesStatus,
      details: summarizeList(
        (latestExecution?.workspace.changedFiles ?? []).map((item) => item.relativePath),
        '변경 파일 없음',
        18,
        1,
      ),
    },
    {
      id: 'insights',
      title: '인사이트',
      subtitle: insightsCount > 0 ? `후속 메모 ${insightsCount}개` : '아직 기록된 인사이트가 없습니다.',
      badge: `${insightsCount}개`,
      tone: 'output',
      icon: 'insights',
      page: 'insights',
      variant: 'output',
      label: '결과',
      state: insightsStatus,
      details: summarizeList(insightTitles, '인사이트 없음', 18, 1),
    },
    {
      id: 'activity',
      title: '활동 로그',
      subtitle: latestLogCount > 0 ? `최근 실행 로그 ${latestLogCount}개` : `누적 활동 ${activityCount}건`,
      badge: latestLogCount > 0 ? `로그 ${latestLogCount}` : `${activityCount}건`,
      tone: 'output',
      icon: 'activity',
      page: 'activity',
      variant: 'output',
      label: '결과',
      state: activityStatus,
      details: summarizeList(activityTitles, '최근 로그 없음', 18, 1),
    },
  ]

  const edges: GraphEdge[] = [
    {
      id: 'trigger-agent',
      path: 'M200 285 C285 285 325 285 390 285',
      kind: 'main',
      status: trigger.state === 'running' ? 'running' : trigger.state === 'done' ? 'done' : 'ready',
    },
    {
      id: 'agent-router',
      path: 'M680 285 C735 285 770 285 825 285',
      kind: 'main',
      status: route.status,
    },
    {
      id: 'router-files',
      path: 'M940 260 C1005 220 1050 185 1085 150',
      kind: 'main',
      status: outputs[0].state,
    },
    {
      id: 'router-insights',
      path: 'M950 285 C1010 285 1048 285 1085 285',
      kind: 'main',
      status: outputs[1].state,
    },
    {
      id: 'router-activity',
      path: 'M940 310 C1005 350 1050 390 1085 430',
      kind: 'main',
      status: outputs[2].state,
    },
    {
      id: 'memory-agent',
      path: 'M515 155 C515 195 515 220 515 240',
      kind: 'support',
      status: memory.state,
    },
    {
      id: 'model-agent',
      path: 'M350 470 C400 425 438 390 470 348',
      kind: 'support',
      status: model.state,
    },
    {
      id: 'signals-agent',
      path: 'M515 470 C515 430 515 390 515 348',
      kind: 'support',
      status: signals.state,
    },
    {
      id: 'tools-agent',
      path: 'M680 470 C638 425 600 390 560 348',
      kind: 'support',
      status: toolsNode.state,
    },
  ]

  const edgeLabels: GraphEdgeLabel[] = [
    { id: 'label-memory', text: '메모리 참조', positionClassName: 'flow-graph__edgeLabel--memory', status: memory.state },
    { id: 'label-model', text: '모델 연결', positionClassName: 'flow-graph__edgeLabel--model', status: model.state },
    { id: 'label-signals', text: '시그널 입력', positionClassName: 'flow-graph__edgeLabel--signals', status: signals.state },
    { id: 'label-tools', text: '도구 호출', positionClassName: 'flow-graph__edgeLabel--tools', status: toolsNode.state },
  ]

  return {
    trigger,
    agent,
    memory,
    model,
    signals,
    toolsNode,
    router,
    outputs,
    edges,
    edgeLabels,
  }
}

function GraphCard({
  node,
  className,
  onNavigate,
  onSelectAgent,
}: {
  node: GraphNode
  className?: string
  onNavigate: (page: PageId) => void
  onSelectAgent: (agentId: string) => void
}) {
  const interactive = Boolean(node.page || node.agentId)
  const iconSize = node.variant === 'main' ? 16 : 14
  const classes = [
    'flow-graph__node',
    `flow-graph__node--${node.tone}`,
    `flow-graph__node--${node.variant}`,
    `is-${node.state}`,
    className || '',
  ]
    .filter(Boolean)
    .join(' ')

  const visibleDetails =
    node.variant === 'main'
      ? node.id === 'agent'
        ? node.details?.slice(0, 2) ?? []
        : node.details?.slice(0, 1) ?? []
      : node.variant === 'output'
        ? []
        : node.details?.slice(0, 1) ?? []

  const handleClick = () => {
    if (node.agentId) {
      onSelectAgent(node.agentId)
    }

    if (node.page) {
      onNavigate(node.page)
    }
  }

  const content = (
    <>
      <small className="flow-graph__label">{node.label}</small>
      <div className="flow-graph__nodeTop">
        <span className="flow-graph__iconWrap" aria-hidden="true">
          <Icon name={node.icon} size={iconSize} />
        </span>
        <span className="flow-graph__badge">
          <span className={`flow-graph__statusDot is-${node.state}`} />
          {node.badge || statusBadge(node.state)}
        </span>
      </div>
      <div className="flow-graph__copy">
        <strong>{node.title}</strong>
        <p>{node.subtitle}</p>
      </div>
      {visibleDetails.length ? (
        <div className="flow-graph__details">
          {visibleDetails.map((detail) => (
            <span key={detail} className="flow-graph__detailChip">
              {detail}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )

  if (interactive) {
    return (
      <button className={classes} onClick={handleClick} type="button">
        {content}
      </button>
    )
  }

  return <article className={classes}>{content}</article>
}

export function OrchestrationCanvas({
  activeAgent,
  tools,
  runs,
  filesCount,
  insightsCount,
  signalCount,
  activityCount,
  recentPrompt,
  messageCount,
  signalTitles,
  insightTitles,
  activityTitles,
  latestExecution,
  bridgeError,
  workspaceError,
  requiresApiKey,
  onNavigate,
  onSelectAgent,
}: OrchestrationCanvasProps) {
  const graph = useMemo(
    () =>
      buildGraph({
        activeAgent,
        tools,
        runs,
        filesCount,
        insightsCount,
        signalCount,
        activityCount,
        recentPrompt,
        messageCount,
        signalTitles,
        insightTitles,
        activityTitles,
        latestExecution,
        bridgeError,
        workspaceError,
        requiresApiKey,
      }),
    [
      activeAgent,
      tools,
      runs,
      filesCount,
      insightsCount,
      signalCount,
      activityCount,
      recentPrompt,
      messageCount,
      signalTitles,
      insightTitles,
      activityTitles,
      latestExecution,
      bridgeError,
      workspaceError,
      requiresApiKey,
    ],
  )

  return (
    <div className="orchestration-canvas orchestration-canvas--graph">
      <div className="orchestration-canvas__body orchestration-canvas__body--graph">
        <section className="flow-graph" aria-label="오케스트레이션 실행 흐름">
          <div className="flow-graph__canvas">
            <div className="flow-graph__nebula flow-graph__nebula--left" aria-hidden="true" />
            <div className="flow-graph__nebula flow-graph__nebula--right" aria-hidden="true" />
            <div className="flow-graph__stardust flow-graph__stardust--top" aria-hidden="true" />
            <div className="flow-graph__stardust flow-graph__stardust--bottom" aria-hidden="true" />
            <div className="flow-graph__coreGlow" aria-hidden="true" />
            <svg
              className="flow-graph__links"
              preserveAspectRatio="none"
              viewBox="0 0 1200 540"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="flow-arrow-main"
                  markerWidth="10"
                  markerHeight="10"
                  refX="8"
                  refY="5"
                  orient="auto"
                >
                  <path d="M0 0 L10 5 L0 10 Z" fill="rgba(158, 205, 255, 0.96)" />
                </marker>
                <marker
                  id="flow-arrow-support"
                  markerWidth="10"
                  markerHeight="10"
                  refX="8"
                  refY="5"
                  orient="auto"
                >
                  <path d="M0 0 L10 5 L0 10 Z" fill="rgba(171, 187, 214, 0.64)" />
                </marker>
              </defs>
              {graph.edges.map((edge) => (
                <path
                  key={edge.id}
                  className={`flow-link flow-link--${edge.kind} is-${edge.status}`}
                  d={edge.path}
                  markerEnd={`url(#${edge.kind === 'main' ? 'flow-arrow-main' : 'flow-arrow-support'})`}
                />
              ))}
            </svg>

            <div className="flow-graph__surface">
              {graph.edgeLabels.map((item) => (
                <span
                  key={item.id}
                  className={`flow-graph__edgeLabel ${item.positionClassName} is-${item.status}`}
                >
                  {item.text}
                </span>
              ))}

              <div className="flow-graph__anchor flow-graph__anchor--trigger">
                <GraphCard
                  node={graph.trigger}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--memory">
                <GraphCard
                  node={graph.memory}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--agent">
                <GraphCard
                  node={graph.agent}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--router">
                <GraphCard
                  node={graph.router}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--model">
                <GraphCard
                  node={graph.model}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--signals">
                <GraphCard
                  node={graph.signals}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--tools">
                <GraphCard
                  node={graph.toolsNode}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--files">
                <GraphCard
                  node={graph.outputs[0]}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--insights">
                <GraphCard
                  node={graph.outputs[1]}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--activity">
                <GraphCard
                  node={graph.outputs[2]}
                  onNavigate={onNavigate}
                  onSelectAgent={onSelectAgent}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default OrchestrationCanvas
