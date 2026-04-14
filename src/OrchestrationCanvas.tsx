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
  selectedAgents: AgentItem[]
  sessionRuns: AgentRun[]
  tools: ToolItem[]
  filesCount: number
  insightsCount: number
  signalCount: number
  activityCount: number
  taskDraft: string
  recentPrompt: string
  messageCount: number
  latestExecution: LatestExecution | null
  bridgeError: string | null
  workspaceError: string | null
  requiresApiKey: boolean
  onNavigate: (page: PageId) => void
  onSelectAgent: (agentId: string) => void
}

type StepStatus = 'idle' | 'ready' | 'running' | 'done' | 'blocked'
type NodeTone = 'trigger' | 'hub' | 'worker' | 'support' | 'output' | 'merge'
type NodeKind =
  | 'trigger'
  | 'memory'
  | 'hub'
  | 'worker'
  | 'merge'
  | 'files'
  | 'insights'
  | 'activity'
  | 'signals'
  | 'tools'

type FlowNodeData = {
  title: string
  subtitle?: string
  badge: string
  icon: IconName
  tone: NodeTone
  status: StepStatus
  kind: NodeKind
  page?: PageId
  agentId?: string
}

const BOARD_WIDTH = 1180
const BOARD_HEIGHT = 560

function normalizeModelLabel(value: string) {
  return value.trim().replace(/:latest$/i, '')
}

function compactModelLabel(value: string) {
  const normalized = normalizeModelLabel(value)

  if (!normalized) {
    return '모델'
  }

  if (/gemma4-e4b-uncensored-q4fast/i.test(normalized)) {
    return 'gemma4 E4B'
  }

  if (/gpt-5\.4/i.test(normalized)) {
    return 'GPT-5.4'
  }

  if (/openrouter\/free/i.test(normalized)) {
    return '무료 라우터'
  }

  return normalized.length > 26 ? `${normalized.slice(0, 26)}…` : normalized
}

function providerLabel(value: string) {
  if (
    value === 'ollama' ||
    value === 'codex' ||
    value === 'openai-compatible' ||
    value === 'anthropic'
  ) {
    return getAgentProviderLabel(value)
  }

  return value || '연결 대기'
}

function workerDisplayTitle(agent: AgentItem) {
  if (agent.provider === 'ollama') {
    return 'Ollama'
  }

  if (agent.provider === 'codex') {
    return 'Codex'
  }

  if (agent.provider === 'official-router') {
    return '무료 라우터'
  }

  return providerLabel(agent.provider)
}

function statusBadge(status: StepStatus) {
  switch (status) {
    case 'running':
      return '진행'
    case 'done':
      return '완료'
    case 'blocked':
      return '오류'
    case 'ready':
      return '준비'
    default:
      return '대기'
  }
}

function routeSummary({
  sessionRuns,
  latestExecution,
  bridgeError,
  workspaceError,
  requiresApiKey,
}: {
  sessionRuns: AgentRun[]
  latestExecution: LatestExecution | null
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
    return { status: 'blocked' as const, badge: 'API' }
  }

  if (sessionRuns.some((run) => run.status === 'running')) {
    return { status: 'running' as const, badge: '수집 중' }
  }

  if (latestExecution || sessionRuns.some((run) => run.status === 'success')) {
    return { status: 'done' as const, badge: '반영' }
  }

  if (sessionRuns.some((run) => run.status === 'error')) {
    return { status: 'blocked' as const, badge: '재시도' }
  }

  return { status: 'ready' as const, badge: '대기' }
}

function workerYPositions(count: number) {
  switch (count) {
    case 1:
      return [220]
    case 2:
      return [170, 270]
    case 3:
      return [120, 220, 320]
    default:
      return [90, 180, 270, 360]
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

function createFlowModel({
  selectedAgents,
  sessionRuns,
  tools,
  filesCount,
  insightsCount,
  signalCount,
  activityCount,
  taskDraft,
  recentPrompt,
  messageCount,
  latestExecution,
  bridgeError,
  workspaceError,
  requiresApiKey,
}: Omit<OrchestrationCanvasProps, 'onNavigate' | 'onSelectAgent'>) {
  const activeTools = tools.filter((item) => item.enabled)
  const changedFileCount = latestExecution?.workspace.changedFiles.length ?? 0
  const hasDraft = Boolean(taskDraft.trim())
  const hasSession = sessionRuns.length > 0
  const latestRunsByAgent = latestRunMap(sessionRuns)
  const route = routeSummary({
    sessionRuns,
    latestExecution,
    bridgeError,
    workspaceError,
    requiresApiKey,
  })

  const triggerStatus: StepStatus = hasSession
    ? sessionRuns.some((run) => run.status === 'running')
      ? 'running'
      : 'done'
    : hasDraft || recentPrompt.trim()
      ? 'ready'
      : 'idle'

  const hubStatus: StepStatus = bridgeError || workspaceError || requiresApiKey
    ? 'blocked'
    : sessionRuns.some((run) => run.status === 'running')
      ? 'running'
      : sessionRuns.some((run) => run.status === 'success')
        ? 'done'
        : selectedAgents.length > 0
          ? 'ready'
          : 'blocked'

  const memoryStatus: StepStatus = messageCount > 0 ? (hasSession ? 'done' : 'ready') : 'idle'
  const signalStatus: StepStatus =
    signalCount > 0 ? (hasSession ? 'ready' : 'idle') : hasSession ? 'idle' : 'idle'
  const toolsStatus: StepStatus =
    activeTools.length > 0 ? (hasSession ? 'ready' : 'idle') : hasSession ? 'idle' : 'idle'
  const mergeStatus: StepStatus = route.status
  const filesStatus: StepStatus = changedFileCount > 0 ? 'done' : hasSession ? 'ready' : 'idle'
  const insightsStatus: StepStatus = insightsCount > 0 ? 'done' : hasSession ? 'ready' : 'idle'
  const activityStatus: StepStatus = activityCount > 0 ? 'done' : hasSession ? 'ready' : 'idle'

  const workerAgents = selectedAgents.length > 0 ? selectedAgents.slice(0, 4) : []
  const workerYs = workerYPositions(Math.max(workerAgents.length, 1))
  const showSupportNodes = hasSession
  const showMergeNode = hasSession
  const showOutputNodes = hasSession

  const nodes: Array<Node<FlowNodeData>> = [
    {
      id: 'trigger',
      type: 'orchestration',
      position: { x: 58, y: 214 },
      data: {
        title: '입력',
        subtitle: hasDraft ? '실행 대기 중' : recentPrompt.trim() ? '최근 질문 반영' : undefined,
        badge: hasDraft ? '대기' : statusBadge(triggerStatus),
        icon: 'spark',
        tone: 'trigger',
        status: triggerStatus,
        kind: 'trigger',
        page: 'chat',
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'hub',
      type: 'orchestration',
      position: { x: 248, y: 172 },
      data: {
        title: '병렬 허브',
        subtitle:
          workerAgents.length > 0
            ? `${workerAgents.length}개 모델 동시 실행`
            : '모델을 하나 이상 선택해 주세요',
        badge: workerAgents.length > 0 ? `${workerAgents.length}개` : statusBadge(hubStatus),
        icon: 'agent',
        tone: 'hub',
        status: hubStatus,
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
      animated: triggerStatus === 'running',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${triggerStatus === 'running' ? 'running' : 'ready'}`,
    },
  ]

  if (showSupportNodes) {
    nodes.push({
      id: 'memory',
      type: 'orchestration',
      position: { x: 286, y: 54 },
      data: {
        title: '메모리',
        badge: messageCount > 0 ? `대화 ${messageCount}` : statusBadge(memoryStatus),
        icon: 'memory',
        tone: 'support',
        status: memoryStatus,
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
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${memoryStatus}`,
    })

    nodes.push({
      id: 'signals',
      type: 'orchestration',
      position: { x: 250, y: 352 },
      data: {
        title: '시그널',
        badge: signalCount > 0 ? `${signalCount}개` : statusBadge(signalStatus),
        icon: 'signals',
        tone: 'support',
        status: signalStatus,
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
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${signalStatus}`,
    })

    nodes.push({
      id: 'tools',
      type: 'orchestration',
      position: { x: 404, y: 352 },
      data: {
        title: '도구',
        badge: activeTools.length > 0 ? `${activeTools.length}개` : statusBadge(toolsStatus),
        icon: 'tools',
        tone: 'support',
        status: toolsStatus,
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
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${toolsStatus}`,
    })
  }

  if (workerAgents.length === 0) {
    nodes.push({
      id: 'worker-empty',
      type: 'orchestration',
      position: { x: 522, y: 214 },
      data: {
        title: '모델 선택',
        subtitle: '실행할 모델을 고르세요',
        badge: '필수',
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
      sourceHandle: 'out-right',
      target: 'worker-empty',
      targetHandle: 'in-left',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: 'orchestration-flow__edge is-blocked',
    })
  } else {
    workerAgents.forEach((agent, index) => {
      const run = latestRunsByAgent.get(agent.id)
      const status: StepStatus =
        run?.status === 'running'
          ? 'running'
          : run?.status === 'success'
            ? 'done'
            : run?.status === 'error'
              ? 'blocked'
              : 'ready'

      const workerId = `worker-${agent.id}`

      nodes.push({
        id: workerId,
        type: 'orchestration',
        position: { x: 536, y: workerYs[index] },
        data: {
          title: workerDisplayTitle(agent),
          subtitle: compactModelLabel(agent.model),
          badge: statusBadge(status),
          icon: 'agent',
          tone: 'worker',
          status,
          kind: 'worker',
          agentId: agent.id,
        },
        draggable: true,
        selectable: false,
      })

      edges.push({
        id: `hub-${workerId}`,
        source: 'hub',
        sourceHandle: 'out-right',
        target: workerId,
        targetHandle: 'in-left',
        type: 'smoothstep',
        animated: status === 'running',
        markerEnd: { type: MarkerType.ArrowClosed },
        className: `orchestration-flow__edge is-${status}`,
      })

      if (showMergeNode) {
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
      }
    })
  }

  if (showMergeNode) {
    nodes.push({
      id: 'merge',
      type: 'orchestration',
      position: { x: 782, y: 214 },
      data: {
        title: '분기',
        subtitle: sessionRuns.some((run) => run.status === 'running') ? '결과 집계 중' : '결과 분배',
        badge: route.badge,
        icon: 'route',
        tone: 'merge',
        status: mergeStatus,
        kind: 'merge',
      },
      draggable: true,
      selectable: false,
    })
  }

  if (showOutputNodes) {
    nodes.push(
      {
        id: 'files',
        type: 'orchestration',
        position: { x: 980, y: 112 },
        data: {
          title: '파일',
          badge: changedFileCount > 0 ? `+${changedFileCount}` : `${filesCount}`,
          icon: 'folder',
          tone: 'output',
          status: filesStatus,
          kind: 'files',
          page: 'files',
        },
        draggable: true,
        selectable: false,
      },
      {
        id: 'insights',
        type: 'orchestration',
        position: { x: 980, y: 214 },
        data: {
          title: '인사이트',
          badge: insightsCount > 0 ? `${insightsCount}` : statusBadge(insightsStatus),
          icon: 'insights',
          tone: 'output',
          status: insightsStatus,
          kind: 'insights',
          page: 'insights',
        },
        draggable: true,
        selectable: false,
      },
      {
        id: 'activity',
        type: 'orchestration',
        position: { x: 980, y: 316 },
        data: {
          title: '로그',
          badge: `${activityCount}`,
          icon: 'activity',
          tone: 'output',
          status: activityStatus,
          kind: 'activity',
          page: 'activity',
        },
        draggable: true,
        selectable: false,
      },
    )

    if (showMergeNode) {
      edges.push(
        {
          id: 'merge-files',
          source: 'merge',
          sourceHandle: 'out-right',
          target: 'files',
          targetHandle: 'in-left',
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          className: `orchestration-flow__edge is-${filesStatus}`,
        },
        {
          id: 'merge-insights',
          source: 'merge',
          sourceHandle: 'out-right',
          target: 'insights',
          targetHandle: 'in-left',
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          className: `orchestration-flow__edge is-${insightsStatus}`,
        },
        {
          id: 'merge-activity',
          source: 'merge',
          sourceHandle: 'out-right',
          target: 'activity',
          targetHandle: 'in-left',
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          className: `orchestration-flow__edge is-${activityStatus}`,
        },
      )
    }
  }

  return { nodes, edges }
}

function OrchestrationFlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const isHub = data.kind === 'hub'
  const isWorker = data.kind === 'worker'
  const isMerge = data.kind === 'merge'

  return (
    <div
      className={[
        'orchestration-flow-node',
        isHub ? 'orchestration-flow-node--hub' : '',
        isWorker ? 'orchestration-flow-node--worker' : '',
        isMerge ? 'orchestration-flow-node--merge' : '',
        `orchestration-flow-node--${data.tone}`,
        `is-${data.status}`,
      ]
        .filter(Boolean)
        .join(' ')}
    >
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
            style={{ left: '35%' }}
          />
          <Handle
            className="orchestration-flow-node__handle"
            position={Position.Bottom}
            type="target"
            id="in-bottom-right"
            style={{ left: '65%' }}
          />
        </>
      ) : null}

      <div className="orchestration-flow-node__head">
        <span className="orchestration-flow-node__icon" aria-hidden="true">
          <Icon name={data.icon} size={isHub ? 14 : 12} />
        </span>
        <div className="orchestration-flow-node__copy">
          <strong>{data.title}</strong>
          {data.subtitle ? <span>{data.subtitle}</span> : null}
        </div>
        <span className="orchestration-flow-node__badge">
          <i className={`orchestration-flow-node__dot is-${data.status}`} />
          {data.badge}
        </span>
      </div>

      {data.kind === 'memory' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Bottom} type="source" id="out-bottom" />
      ) : null}

      {data.kind === 'signals' || data.kind === 'tools' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Top} type="source" id="out-top" />
      ) : null}

      {data.kind === 'trigger' || data.kind === 'hub' || data.kind === 'worker' || data.kind === 'merge' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Right} type="source" id="out-right" />
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
    recentPrompt,
    messageCount,
    latestExecution,
    bridgeError,
    workspaceError,
    requiresApiKey,
    onNavigate,
    onSelectAgent,
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

    const fit = () =>
      flowInstance.fitView({
        padding: 0.12,
        minZoom: 0.68,
        maxZoom: 1.08,
        duration: 240,
      })

    const firstFrame = window.requestAnimationFrame(fit)
    const secondPass = window.setTimeout(fit, 180)

    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.clearTimeout(secondPass)
    }
  }, [
    flowInstance,
    selectedAgents,
    sessionRuns,
    taskDraft,
    recentPrompt,
    latestExecution?.receivedAt,
    bridgeError,
    workspaceError,
    requiresApiKey,
  ])

  return (
    <div className="orchestration-canvas orchestration-canvas--flow">
      <div className="orchestration-canvas__hud">
        <span>드래그 이동 · 휠 확대</span>
      </div>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, minZoom: 0.68, maxZoom: 1.08 }}
        minZoom={0.58}
        maxZoom={1.28}
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
          [-240, -180],
          [BOARD_WIDTH + 240, BOARD_HEIGHT + 180],
        ]}
        onInit={setFlowInstance}
        onNodeClick={(_, node) => {
          const flowNode = node as Node<FlowNodeData>

          if (flowNode.data.agentId) {
            onSelectAgent(flowNode.data.agentId)
          }

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
