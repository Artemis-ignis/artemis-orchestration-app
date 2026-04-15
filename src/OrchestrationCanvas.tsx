import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { PageId } from './crewData'
import { Icon, type IconName } from './icons'
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
  selectedAgents: AgentItem[]
  sessionRuns: AgentRun[]
  tools: ToolItem[]
  filesCount: number
  insightsCount: number
  signalCount: number
  activityCount: number
  taskDraft: string
  sessionTask: string
  recentPrompt: string
  messageCount: number
  latestExecution: LatestExecution | null
  bridgeError: string | null
  workspaceError: string | null
  requiresApiKey: boolean
  onNavigate: (page: PageId) => void
}

type StepStatus = 'idle' | 'ready' | 'running' | 'done' | 'blocked'
type NodeTone = 'trigger' | 'hub' | 'worker' | 'support' | 'output' | 'merge' | 'standby'
type NodeKind =
  | 'trigger'
  | 'hub'
  | 'worker'
  | 'merge'
  | 'memory'
  | 'signals'
  | 'tools'
  | 'files'
  | 'insights'
  | 'activity'
  | 'standby'

type FlowNodeData = {
  title: string
  fullTitle?: string
  subtitle?: string
  badge: string
  icon: IconName
  tone: NodeTone
  status: StepStatus
  kind: NodeKind
  page?: PageId
}

const BOARD_WIDTH = 1320
const BOARD_HEIGHT = 760

function normalizeModelLabel(value: string) {
  return value.trim().replace(/:latest$/i, '')
}

function compactModelLabel(value: string) {
  const normalized = normalizeModelLabel(value)
  const normalizedWithoutSuffix = normalized.replace(/:free$/i, '')

  if (!normalized) {
    return '모델 없음'
  }

  if (/gemma4-e4b-uncensored-q4fast/i.test(normalizedWithoutSuffix)) {
    return 'gemma4 E4B'
  }

  if (/gpt-5\.4/i.test(normalizedWithoutSuffix)) {
    return 'GPT-5.4'
  }

  if (/deepseek\/deepseek-r1/i.test(normalizedWithoutSuffix)) {
    return 'DeepSeek R1'
  }

  if (/qwen\/qwen3-30b-a3b/i.test(normalizedWithoutSuffix)) {
    return 'Qwen3 30B'
  }

  if (/auto-best-free/i.test(normalizedWithoutSuffix)) {
    return '공식 API'
  }

  if (/auto-code-free/i.test(normalizedWithoutSuffix)) {
    return '코딩 무료'
  }

  if (/auto-fast-free/i.test(normalizedWithoutSuffix)) {
    return '빠른 무료'
  }

  if (/gemini/i.test(normalizedWithoutSuffix)) {
    return 'Gemini'
  }

  if (/claude/i.test(normalizedWithoutSuffix)) {
    return 'Claude'
  }

  if (/openrouter/i.test(normalizedWithoutSuffix)) {
    return 'OpenRouter'
  }

  const tail =
    normalizedWithoutSuffix.split('/').filter(Boolean).at(-1) ?? normalizedWithoutSuffix
  return tail.length > 12 ? `${tail.slice(0, 12)}…` : tail
}

function providerLabel(value: string) {
  switch (value) {
    case 'ollama':
      return 'Ollama'
    case 'codex':
      return 'Codex CLI'
    case 'official-router':
      return '공식 API'
    case 'openai-compatible':
      return 'OpenAI 호환'
    case 'anthropic':
      return 'Anthropic'
    default:
      return value || '대기'
  }
}

function statusBadge(status: StepStatus) {
  switch (status) {
    case 'running':
      return '작업중'
    case 'done':
      return '완료'
    case 'blocked':
      return '막힘'
    case 'ready':
      return '준비'
    default:
      return '대기'
  }
}

function latestRunMap(sessionRuns: AgentRun[]) {
  const sorted = sessionRuns
    .slice()
    .sort(
      (left, right) =>
        Date.parse(right.finishedAt ?? right.startedAt) - Date.parse(left.finishedAt ?? left.startedAt),
    )

  const map = new Map<string, AgentRun>()
  for (const run of sorted) {
    if (!map.has(run.agentId)) {
      map.set(run.agentId, run)
    }
  }
  return map
}

function routeSummary({
  sessionRuns,
  bridgeError,
  workspaceError,
  requiresApiKey,
}: {
  sessionRuns: AgentRun[]
  bridgeError: string | null
  workspaceError: string | null
  requiresApiKey: boolean
}) {
  if (bridgeError) {
    return { status: 'blocked' as const, badge: '브리지' }
  }

  if (workspaceError) {
    return { status: 'blocked' as const, badge: '폴더' }
  }

  if (requiresApiKey) {
    return { status: 'blocked' as const, badge: 'API 키' }
  }

  if (sessionRuns.some((run) => run.status === 'running')) {
    return { status: 'running' as const, badge: '병렬 실행' }
  }

  if (sessionRuns.some((run) => run.status === 'success')) {
    return { status: 'done' as const, badge: '최근 완료' }
  }

  if (sessionRuns.some((run) => run.status === 'error')) {
    return { status: 'blocked' as const, badge: '재시도' }
  }

  return { status: 'ready' as const, badge: '준비' }
}

function createParallelWorkerPositions(count: number) {
  const safeCount = Math.max(1, count)
  const gap = safeCount === 1 ? 0 : 188
  const totalWidth = gap * (safeCount - 1)
  const startX = Math.round(642 - totalWidth / 2)

  return Array.from({ length: safeCount }, (_, index) => ({
    x: startX + index * gap,
    y: 434,
  }))
}

function createFlowModel({
  selectedAgents,
  sessionRuns,
  tools,
  filesCount,
  insightsCount,
  signalCount,
  activityCount,
  taskDraft,
  sessionTask,
  recentPrompt,
  messageCount,
  latestExecution,
  bridgeError,
  workspaceError,
  requiresApiKey,
}: Omit<OrchestrationCanvasProps, 'onNavigate'>) {
  const activeTools = tools.filter((item) => item.enabled)
  const latestRunsByAgent = latestRunMap(sessionRuns)
  const hasDraft = Boolean(taskDraft.trim())
  const hasSessionTask = Boolean(sessionTask.trim())
  const hasRecentPrompt = Boolean(recentPrompt.trim())
  const hasSession = sessionRuns.length > 0
  const sessionRunning = sessionRuns.some((run) => run.status === 'running')
  const shouldExpandFlow = hasDraft || hasSession || hasSessionTask
  const route = routeSummary({
    sessionRuns,
    bridgeError,
    workspaceError,
    requiresApiKey,
  })
  const changedFileCount = hasSession ? latestExecution?.workspace.changedFiles.length ?? 0 : 0

  const nodes: Array<Node<FlowNodeData>> = [
    {
      id: 'trigger',
      type: 'orchestration',
      position: { x: 96, y: 300 },
      data: {
        title: '입력',
        subtitle: hasDraft ? '지시 준비' : hasRecentPrompt ? '최근 입력' : '대기',
        badge: hasDraft ? '입력됨' : hasRecentPrompt ? '최근 있음' : '대기',
        icon: 'spark',
        tone: 'trigger',
        status: hasDraft ? 'ready' : hasRecentPrompt ? 'ready' : 'idle',
        kind: 'trigger',
        page: 'chat',
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'hub',
      type: 'orchestration',
      position: { x: 470, y: 248 },
      data: {
        title: '병렬 허브',
        subtitle: shouldExpandFlow
          ? `${Math.max(selectedAgents.length, 1)}개 모델 배치`
          : '실행하면 병렬 모델 생성',
        badge: shouldExpandFlow ? route.badge : '준비',
        icon: 'agent',
        tone: 'hub',
        status: route.status,
        kind: 'hub',
      },
      draggable: true,
      selectable: false,
    },
  ]

  const edges: Array<Edge> = [
    {
      id: 'trigger-hub',
      source: 'trigger',
      sourceHandle: 'out-right',
      target: 'hub',
      targetHandle: 'in-left',
      type: 'smoothstep',
      animated: hasDraft || hasSession,
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${hasDraft || hasSession ? 'running' : 'ready'}`,
    },
  ]

  if (!shouldExpandFlow) {
    nodes.push({
      id: 'standby',
      type: 'orchestration',
      position: { x: 930, y: 300 },
      data: {
        title: '출력',
        subtitle: selectedAgents.length > 0 ? '실행 후 결과 생성' : '모델을 먼저 고르세요',
        badge: selectedAgents.length > 0 ? `${selectedAgents.length}개 준비` : '선택 필요',
        icon: 'route',
        tone: 'standby',
        status: selectedAgents.length > 0 ? 'ready' : 'blocked',
        kind: 'standby',
        page: selectedAgents.length > 0 ? 'chat' : 'settings',
      },
      draggable: true,
      selectable: false,
    })

    edges.push({
      id: 'hub-standby',
      source: 'hub',
      sourceHandle: 'out-right',
      target: 'standby',
      targetHandle: 'in-left',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${selectedAgents.length > 0 ? 'ready' : 'blocked'}`,
    })

    return { nodes, edges }
  }

  if (sessionRunning && messageCount > 0) {
    nodes.push({
      id: 'memory',
      type: 'orchestration',
      position: { x: 520, y: 96 },
      data: {
        title: '메모리',
        subtitle: '문맥',
        badge: `${messageCount}개`,
        icon: 'memory',
        tone: 'support',
        status: 'ready',
        kind: 'memory',
        page: 'insights',
      },
      draggable: true,
      selectable: false,
    })

    edges.push({
      id: 'memory-hub',
      source: 'memory',
      sourceHandle: 'out-bottom',
      target: 'hub',
      targetHandle: 'in-top',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: 'orchestration-flow__edge orchestration-flow__edge--support is-ready',
    })
  }

  const workerAgents = selectedAgents.slice(0, 6)
  const workerPositions = createParallelWorkerPositions(workerAgents.length)

  if (workerAgents.length === 0) {
    nodes.push({
      id: 'worker-empty',
      type: 'orchestration',
      position: { x: 530, y: 450 },
      data: {
        title: '모델 없음',
        subtitle: '설정에서 추가',
        badge: '설정 필요',
        icon: 'chat',
        tone: 'worker',
        status: 'blocked',
        kind: 'worker',
        page: 'settings',
      },
      draggable: true,
      selectable: false,
    })

    edges.push({
      id: 'hub-worker-empty',
      source: 'hub',
      sourceHandle: 'out-bottom',
      target: 'worker-empty',
      targetHandle: 'in-top',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: 'orchestration-flow__edge is-blocked',
    })
  } else {
    workerAgents.forEach((agent, index) => {
      const workerId = `worker-${agent.id}`
      const run = latestRunsByAgent.get(agent.id)
      const status: StepStatus =
        run?.status === 'running'
          ? 'running'
          : run?.status === 'success'
            ? 'done'
            : run?.status === 'error'
              ? 'blocked'
              : hasDraft
                ? 'ready'
                : 'idle'

      nodes.push({
        id: workerId,
        type: 'orchestration',
        position: workerPositions[index],
        data: {
          title: compactModelLabel(agent.model || agent.name),
          fullTitle: agent.name,
          subtitle: providerLabel(agent.provider),
          badge: statusBadge(status),
          icon: 'chat',
          tone: 'worker',
          status,
          kind: 'worker',
          page: 'settings',
        },
        draggable: true,
        selectable: false,
      })

      edges.push({
        id: `hub-${workerId}`,
        source: 'hub',
        sourceHandle: 'out-bottom',
        target: workerId,
        targetHandle: 'in-top',
        type: 'smoothstep',
        animated: status === 'running',
        markerEnd: { type: MarkerType.ArrowClosed },
        className: `orchestration-flow__edge is-${status}`,
      })
    })
  }

  nodes.push({
    id: 'merge',
    type: 'orchestration',
    position: { x: 930, y: 314 },
    data: {
      title: '분기',
      subtitle: sessionRunning ? '결과 취합' : '대기',
      badge: route.badge,
      icon: 'route',
      tone: 'merge',
      status: route.status,
      kind: 'merge',
    },
    draggable: true,
    selectable: false,
  })

  if (workerAgents.length > 0) {
    workerAgents.forEach((agent) => {
      const workerId = `worker-${agent.id}`
      const run = latestRunsByAgent.get(agent.id)
      const status: StepStatus =
        run?.status === 'running'
          ? 'running'
          : run?.status === 'success'
            ? 'done'
            : run?.status === 'error'
              ? 'blocked'
              : hasDraft
                ? 'ready'
                : 'idle'

      edges.push({
        id: `${workerId}-merge`,
        source: workerId,
        sourceHandle: 'out-right',
        target: 'merge',
        targetHandle: 'in-left',
        type: 'smoothstep',
        animated: status === 'running',
        markerEnd: { type: MarkerType.ArrowClosed },
        className: `orchestration-flow__edge is-${status}`,
      })
    })
  } else {
    edges.push({
      id: 'worker-empty-merge',
      source: 'worker-empty',
      sourceHandle: 'out-right',
      target: 'merge',
      targetHandle: 'in-left',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: 'orchestration-flow__edge is-blocked',
    })
  }

  if (hasSession && signalCount > 0) {
    nodes.push({
      id: 'signals',
      type: 'orchestration',
      position: { x: 314, y: 618 },
      data: {
        title: '시그널',
        subtitle: '입력',
        badge: `${signalCount}개`,
        icon: 'signals',
        tone: 'support',
        status: 'ready',
        kind: 'signals',
        page: 'signals',
      },
      draggable: true,
      selectable: false,
    })

    edges.push({
      id: 'signals-hub',
      source: 'signals',
      sourceHandle: 'out-top',
      target: 'hub',
      targetHandle: 'in-bottom-left',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: 'orchestration-flow__edge orchestration-flow__edge--support is-ready',
    })
  }

  if (hasSession && activeTools.length > 0) {
    nodes.push({
      id: 'tools',
      type: 'orchestration',
      position: { x: 666, y: 618 },
      data: {
        title: '도구',
        subtitle: '실행',
        badge: `${activeTools.length}개`,
        icon: 'tools',
        tone: 'support',
        status: 'ready',
        kind: 'tools',
        page: 'tools',
      },
      draggable: true,
      selectable: false,
    })

    edges.push({
      id: 'tools-hub',
      source: 'tools',
      sourceHandle: 'out-top',
      target: 'hub',
      targetHandle: 'in-bottom-right',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: 'orchestration-flow__edge orchestration-flow__edge--support is-ready',
    })
  }

  if (hasSession) {
    nodes.push(
      {
        id: 'files',
        type: 'orchestration',
        position: { x: 1134, y: 154 },
        data: {
          title: '파일',
          subtitle: '산출물',
          badge: changedFileCount > 0 ? `+${changedFileCount}` : `${filesCount}`,
          icon: 'folder',
          tone: 'output',
          status: changedFileCount > 0 ? 'done' : 'ready',
          kind: 'files',
          page: 'files',
        },
        draggable: true,
        selectable: false,
      },
      {
        id: 'insights',
        type: 'orchestration',
        position: { x: 1134, y: 314 },
        data: {
          title: '인사이트',
          subtitle: '요약',
          badge: insightsCount > 0 ? `${insightsCount}` : '대기',
          icon: 'insights',
          tone: 'output',
          status: insightsCount > 0 ? 'done' : 'ready',
          kind: 'insights',
          page: 'insights',
        },
        draggable: true,
        selectable: false,
      },
      {
        id: 'activity',
        type: 'orchestration',
        position: { x: 1134, y: 474 },
        data: {
          title: '로그',
          subtitle: '기록',
          badge: `${activityCount}`,
          icon: 'activity',
          tone: 'output',
          status: activityCount > 0 ? 'done' : 'ready',
          kind: 'activity',
          page: 'activity',
        },
        draggable: true,
        selectable: false,
      },
    )

    edges.push(
      {
        id: 'merge-files',
        source: 'merge',
        sourceHandle: 'out-right-top',
        target: 'files',
        targetHandle: 'in-left',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        className: `orchestration-flow__edge is-${changedFileCount > 0 ? 'done' : 'ready'}`,
      },
      {
        id: 'merge-insights',
        source: 'merge',
        sourceHandle: 'out-right',
        target: 'insights',
        targetHandle: 'in-left',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        className: `orchestration-flow__edge is-${insightsCount > 0 ? 'done' : 'ready'}`,
      },
      {
        id: 'merge-activity',
        source: 'merge',
        sourceHandle: 'out-right-bottom',
        target: 'activity',
        targetHandle: 'in-left',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        className: `orchestration-flow__edge is-${activityCount > 0 ? 'done' : 'ready'}`,
      },
    )
  } else {
    nodes.push({
      id: 'result-ready',
      type: 'orchestration',
      position: { x: 1134, y: 314 },
      data: {
        title: '출력',
        subtitle: '실행 후 생성',
        badge: '대기',
        icon: 'route',
        tone: 'output',
        status: 'idle',
        kind: 'standby',
      },
      draggable: true,
      selectable: false,
    })

    edges.push({
      id: 'merge-result-ready',
      source: 'merge',
      sourceHandle: 'out-right',
      target: 'result-ready',
      targetHandle: 'in-left',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: 'orchestration-flow__edge is-ready',
    })
  }

  return { nodes, edges }
}

function OrchestrationFlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const isHub = data.kind === 'hub'
  const isMini =
    data.kind === 'memory' ||
    data.kind === 'signals' ||
    data.kind === 'tools' ||
    data.kind === 'files' ||
    data.kind === 'insights' ||
    data.kind === 'activity'
  const isCompact = isMini || data.kind === 'trigger' || data.kind === 'merge' || data.kind === 'standby'

  const nodeClasses = [
    'orchestration-flow-node',
    `orchestration-flow-node--${data.tone}`,
    `is-${data.status}`,
    isHub ? 'orchestration-flow-node--hub' : '',
    isMini ? 'orchestration-flow-node--mini' : '',
    isCompact ? 'orchestration-flow-node--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={nodeClasses} title={data.fullTitle ?? data.title}>
      {data.kind !== 'trigger' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Left} type="target" id="in-left" />
      ) : null}

      {data.kind === 'hub' ? (
        <>
          <Handle className="orchestration-flow-node__handle" position={Position.Top} type="target" id="in-top" />
          <Handle
            className="orchestration-flow-node__handle"
            position={Position.Bottom}
            type="target"
            id="in-bottom-left"
            style={{ left: '40%' }}
          />
          <Handle
            className="orchestration-flow-node__handle"
            position={Position.Bottom}
            type="target"
            id="in-bottom-right"
            style={{ left: '60%' }}
          />
        </>
      ) : null}

      {data.kind === 'worker' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Top} type="target" id="in-top" />
      ) : null}

      {isCompact ? (
        <>
          <div className="orchestration-flow-node__head orchestration-flow-node__head--compact">
            <span className="orchestration-flow-node__icon" aria-hidden="true">
              <Icon name={data.icon} size={12} />
            </span>
            <strong className="orchestration-flow-node__title">{data.title}</strong>
          </div>
          <div className="orchestration-flow-node__meta">
            <i className={`orchestration-flow-node__dot is-${data.status}`} />
            <span>{data.badge}</span>
          </div>
          {data.subtitle ? <p className="orchestration-flow-node__subtitle">{data.subtitle}</p> : null}
        </>
      ) : (
        <>
          <div className="orchestration-flow-node__head">
            <span className="orchestration-flow-node__icon" aria-hidden="true">
              <Icon name={data.icon} size={isHub ? 14 : 12} />
            </span>
            <strong className="orchestration-flow-node__title">{data.title}</strong>
            <span className="orchestration-flow-node__badge">
              <i className={`orchestration-flow-node__dot is-${data.status}`} />
              {data.badge}
            </span>
          </div>
          {data.subtitle ? <p className="orchestration-flow-node__subtitle">{data.subtitle}</p> : null}
        </>
      )}

      {data.kind === 'trigger' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Right} type="source" id="out-right" />
      ) : null}

      {data.kind === 'hub' ? (
        <>
          <Handle className="orchestration-flow-node__handle" position={Position.Right} type="source" id="out-right" />
          <Handle className="orchestration-flow-node__handle" position={Position.Bottom} type="source" id="out-bottom" />
        </>
      ) : null}

      {data.kind === 'memory' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Bottom} type="source" id="out-bottom" />
      ) : null}

      {data.kind === 'signals' || data.kind === 'tools' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Top} type="source" id="out-top" />
      ) : null}

      {data.kind === 'worker' || data.kind === 'standby' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Right} type="source" id="out-right" />
      ) : null}

      {data.kind === 'merge' ? (
        <>
          <Handle className="orchestration-flow-node__handle" position={Position.Right} type="source" id="out-right" />
          <Handle
            className="orchestration-flow-node__handle"
            position={Position.Right}
            type="source"
            id="out-right-top"
            style={{ top: '26%' }}
          />
          <Handle
            className="orchestration-flow-node__handle"
            position={Position.Right}
            type="source"
            id="out-right-bottom"
            style={{ top: '74%' }}
          />
        </>
      ) : null}
    </div>
  )
}

const nodeTypes = { orchestration: OrchestrationFlowNode }

export function OrchestrationCanvas(props: OrchestrationCanvasProps) {
  const {
    selectedAgents,
    sessionRuns,
    tools,
    filesCount,
    insightsCount,
    signalCount,
    activityCount,
    taskDraft,
    sessionTask,
    recentPrompt,
    messageCount,
    latestExecution,
    bridgeError,
    workspaceError,
    requiresApiKey,
    onNavigate,
  } = props

  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)

  const graph = useMemo(
    () =>
      createFlowModel({
        selectedAgents,
        sessionRuns,
        tools,
        filesCount,
        insightsCount,
        signalCount,
        activityCount,
        taskDraft,
        sessionTask,
        recentPrompt,
        messageCount,
        latestExecution,
        bridgeError,
        workspaceError,
        requiresApiKey,
      }),
    [
      selectedAgents,
      sessionRuns,
      tools,
      filesCount,
      insightsCount,
      signalCount,
      activityCount,
      taskDraft,
      sessionTask,
      recentPrompt,
      messageCount,
      latestExecution,
      bridgeError,
      workspaceError,
      requiresApiKey,
    ],
  )

  useEffect(() => {
    if (!flowInstance) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      flowInstance.fitView({
        padding: 0.16,
        minZoom: 0.52,
        maxZoom: 1.12,
        duration: 220,
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [flowInstance, graph.nodes.length, graph.edges.length])

  return (
    <div className="orchestration-canvas orchestration-canvas--flow">
      <div className="orchestration-canvas__hud">
        <span>드래그로 이동 · 휠로 확대</span>
      </div>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.16, minZoom: 0.52, maxZoom: 1.12 }}
        minZoom={0.48}
        maxZoom={1.48}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        selectionOnDrag={false}
        panOnDrag
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        translateExtent={[
          [-260, -180],
          [BOARD_WIDTH + 320, BOARD_HEIGHT + 260],
        ]}
        onInit={setFlowInstance}
        onNodeClick={(_, node) => {
          const flowNode = node as Node<FlowNodeData>
          if (flowNode.data.page) {
            onNavigate(flowNode.data.page)
          }
        }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          className="orchestration-flow__background"
          color="rgba(218, 229, 255, 0.12)"
          gap={30}
          size={1}
        />
        <Controls className="orchestration-flow__controls" position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export default OrchestrationCanvas
