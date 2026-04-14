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

type NodeTone = 'trigger' | 'agent' | 'model' | 'memory' | 'skill' | 'router' | 'output'
type StepStatus = 'idle' | 'ready' | 'running' | 'done' | 'blocked'
type GraphVariant = 'hub' | 'main' | 'mini'

type GraphNode = {
  id: string
  title: string
  subtitle: string
  badge?: string
  tone: NodeTone
  icon: IconName
  page?: PageId
  agentId?: string
  variant: GraphVariant
  state: StepStatus
}

type GraphEdge = {
  id: string
  path: string
  kind: 'main' | 'support'
  status: StepStatus
}

function normalizeModelLabel(value: string) {
  return value.trim().replace(/:latest$/i, '')
}

function providerLabel(value: string) {
  if (value === 'ollama' || value === 'codex' || value === 'openai-compatible' || value === 'anthropic') {
    return getAgentProviderLabel(value)
  }

  return value || '미연결'
}

function clipText(value: string, maxLength = 28) {
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
      text: clipText(bridgeError, 22),
    }
  }

  if (workspaceError) {
    return {
      status: 'blocked' as const,
      badge: '폴더 오류',
      text: clipText(workspaceError, 22),
    }
  }

  if (requiresApiKey) {
    return {
      status: 'blocked' as const,
      badge: 'API 키 필요',
      text: '공식 키 연결',
    }
  }

  if (latestRun?.status === 'running') {
    return {
      status: 'running' as const,
      badge: '분기 진행',
      text: '파일 · 인사이트 · 로그',
    }
  }

  if (latestExecution) {
    return {
      status: 'done' as const,
      badge: '반영 완료',
      text: '파일 · 인사이트 · 로그',
    }
  }

  return {
    status: 'ready' as const,
    badge: '분기 준비',
    text: '파일 · 인사이트 · 로그',
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
  latestExecution,
  bridgeError,
  workspaceError,
  requiresApiKey,
}: Omit<
  OrchestrationCanvasProps,
  'onNavigate' | 'onSelectAgent' | 'signalTitles' | 'insightTitles' | 'activityTitles'
>) {
  const latestRun = runs[0]
  const activeTools = tools.filter((item) => item.enabled)
  const runtimeModel = normalizeModelLabel(latestExecution?.model || activeAgent?.model || '')
  const runtimeProvider = latestExecution?.provider || activeAgent?.provider || ''
  const route = routeSummary({
    latestRun,
    latestExecution,
    bridgeError,
    workspaceError,
    requiresApiKey,
  })

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

  const changedFileCount = latestExecution?.workspace.changedFiles.length ?? 0
  const latestLogCount = latestRun?.logs.length ?? 0

  const trigger: GraphNode = {
    id: 'trigger',
    title: '입력',
    subtitle: clipText(latestRun?.task || recentPrompt, 22) || '최근 요청 대기',
    badge: messageCount > 0 ? `대화 ${messageCount}` : statusBadge(triggerStatus),
    tone: 'trigger',
    icon: 'spark',
    page: 'chat',
    variant: 'mini',
    state: triggerStatus,
  }

  const agent: GraphNode = {
    id: 'agent',
    title: activeAgent?.name || '에이전트 선택',
    subtitle: activeAgent
      ? `${providerLabel(activeAgent.provider)} · ${normalizeModelLabel(activeAgent.model)}`
      : '설정에서 연결',
    badge: statusBadge(agentStatus),
    tone: 'agent',
    icon: 'agent',
    page: activeAgent ? undefined : 'settings',
    agentId: activeAgent?.id,
    variant: 'hub',
    state: agentStatus,
  }

  const memory: GraphNode = {
    id: 'memory',
    title: '메모리',
    subtitle: messageCount > 0 ? `대화 ${messageCount} · 로그 ${activityCount}` : '기록 없음',
    badge: statusBadge(memoryStatus),
    tone: 'memory',
    icon: 'memory',
    page: 'insights',
    variant: 'mini',
    state: memoryStatus,
  }

  const model: GraphNode = {
    id: 'model',
    title: '모델',
    subtitle: runtimeModel || '미연결',
    badge: runtimeProvider ? providerLabel(runtimeProvider) : statusBadge(modelStatus),
    tone: 'model',
    icon: 'chat',
    page: 'settings',
    variant: 'mini',
    state: modelStatus,
  }

  const signals: GraphNode = {
    id: 'signals',
    title: '시그널',
    subtitle: signalCount > 0 ? `구독 ${signalCount}` : '구독 없음',
    badge: signalCount > 0 ? `${signalCount}개` : statusBadge(signalStatus),
    tone: 'memory',
    icon: 'signals',
    page: 'signals',
    variant: 'mini',
    state: signalStatus,
  }

  const toolsNode: GraphNode = {
    id: 'tools',
    title: '도구',
    subtitle: activeTools.length > 0 ? `활성 ${activeTools.length}` : '활성 없음',
    badge: activeTools.length > 0 ? `${activeTools.length}개` : statusBadge(toolsStatus),
    tone: 'skill',
    icon: 'tools',
    page: 'tools',
    variant: 'mini',
    state: toolsStatus,
  }

  const router: GraphNode = {
    id: 'router',
    title: '분기',
    subtitle: route.text,
    badge: route.badge,
    tone: 'router',
    icon: 'route',
    variant: 'mini',
    state: route.status,
  }

  const outputs: GraphNode[] = [
    {
      id: 'files',
      title: '파일',
      subtitle: changedFileCount > 0 ? `변경 ${changedFileCount}` : `파일 ${filesCount}`,
      badge: changedFileCount > 0 ? `변경 ${changedFileCount}` : `${filesCount}개`,
      tone: 'output',
      icon: 'files',
      page: 'files',
      variant: 'mini',
      state: filesStatus,
    },
    {
      id: 'insights',
      title: '인사이트',
      subtitle: insightsCount > 0 ? `메모 ${insightsCount}` : '기록 없음',
      badge: insightsCount > 0 ? `${insightsCount}개` : statusBadge(insightsStatus),
      tone: 'output',
      icon: 'insights',
      page: 'insights',
      variant: 'mini',
      state: insightsStatus,
    },
    {
      id: 'activity',
      title: '로그',
      subtitle: latestLogCount > 0 ? `로그 ${latestLogCount}` : `누적 ${activityCount}`,
      badge: latestLogCount > 0 ? `로그 ${latestLogCount}` : `${activityCount}건`,
      tone: 'output',
      icon: 'activity',
      page: 'activity',
      variant: 'mini',
      state: activityStatus,
    },
  ]

  const edges: GraphEdge[] = [
    {
      id: 'trigger-agent',
      path: 'M190 278 C262 278 320 278 408 278',
      kind: 'main',
      status: trigger.state === 'running' ? 'running' : trigger.state === 'done' ? 'done' : 'ready',
    },
    {
      id: 'agent-router',
      path: 'M735 278 C785 278 828 278 884 278',
      kind: 'main',
      status: route.status,
    },
    {
      id: 'router-files',
      path: 'M986 250 C1048 214 1090 178 1124 146',
      kind: 'main',
      status: outputs[0].state,
    },
    {
      id: 'router-insights',
      path: 'M996 278 C1056 278 1088 278 1122 278',
      kind: 'main',
      status: outputs[1].state,
    },
    {
      id: 'router-activity',
      path: 'M986 306 C1048 340 1090 374 1124 410',
      kind: 'main',
      status: outputs[2].state,
    },
    {
      id: 'memory-agent',
      path: 'M570 152 C570 192 570 216 570 236',
      kind: 'support',
      status: memory.state,
    },
    {
      id: 'model-agent',
      path: 'M358 432 C420 394 464 360 505 322',
      kind: 'support',
      status: model.state,
    },
    {
      id: 'signals-agent',
      path: 'M570 432 C570 392 570 356 570 322',
      kind: 'support',
      status: signals.state,
    },
    {
      id: 'tools-agent',
      path: 'M782 432 C728 394 684 360 636 322',
      kind: 'support',
      status: toolsNode.state,
    },
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
  const classes = [
    'flow-graph__node',
    `flow-graph__node--${node.tone}`,
    `flow-graph__node--${node.variant}`,
    `is-${node.state}`,
    className || '',
  ]
    .filter(Boolean)
    .join(' ')

  const iconSize = node.variant === 'hub' ? 15 : node.variant === 'main' ? 13 : 11

  const handleClick = () => {
    if (node.agentId) {
      onSelectAgent(node.agentId)
    }

    if (node.page) {
      onNavigate(node.page)
    }
  }

  const content = (
    <div className="flow-graph__head">
      <span className="flow-graph__iconWrap" aria-hidden="true">
        <Icon name={node.icon} size={iconSize} />
      </span>
      <div className="flow-graph__titleBlock">
        <strong>{node.title}</strong>
        {node.variant === 'hub' ? <span>{node.subtitle}</span> : null}
      </div>
      <span className="flow-graph__badge">
        <span className={`flow-graph__statusDot is-${node.state}`} />
        {node.badge || statusBadge(node.state)}
      </span>
    </div>
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

export function OrchestrationCanvas(props: OrchestrationCanvasProps) {
  const {
    activeAgent,
    tools,
    runs,
    filesCount,
    insightsCount,
    signalCount,
    activityCount,
    recentPrompt,
    messageCount,
    latestExecution,
    bridgeError,
    workspaceError,
    requiresApiKey,
    onNavigate,
    onSelectAgent,
  } = props

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
              <div className="flow-graph__anchor flow-graph__anchor--trigger">
                <GraphCard node={graph.trigger} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--memory">
                <GraphCard node={graph.memory} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--agent">
                <GraphCard node={graph.agent} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--router">
                <GraphCard node={graph.router} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--model">
                <GraphCard node={graph.model} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--signals">
                <GraphCard node={graph.signals} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--tools">
                <GraphCard node={graph.toolsNode} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--files">
                <GraphCard node={graph.outputs[0]} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--insights">
                <GraphCard node={graph.outputs[1]} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>

              <div className="flow-graph__anchor flow-graph__anchor--activity">
                <GraphCard node={graph.outputs[2]} onNavigate={onNavigate} onSelectAgent={onSelectAgent} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default OrchestrationCanvas
