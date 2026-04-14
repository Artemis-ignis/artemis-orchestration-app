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

type StepStatus = 'idle' | 'ready' | 'running' | 'done' | 'blocked'
type NodeTone = 'trigger' | 'hub' | 'support' | 'output'
type NodeKind =
  | 'trigger'
  | 'memory'
  | 'hub'
  | 'router'
  | 'files'
  | 'insights'
  | 'activity'
  | 'model'
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

const BOARD_WIDTH = 1120
const BOARD_HEIGHT = 540

function normalizeModelLabel(value: string) {
  return value.trim().replace(/:latest$/i, '')
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

  return value || '연결 안 됨'
}

function statusBadge(status: StepStatus) {
  switch (status) {
    case 'running':
      return '실행'
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
    return { status: 'blocked' as const, badge: '브리지' }
  }

  if (workspaceError) {
    return { status: 'blocked' as const, badge: '폴더' }
  }

  if (requiresApiKey) {
    return { status: 'blocked' as const, badge: 'API' }
  }

  if (latestRun?.status === 'running') {
    return { status: 'running' as const, badge: '실행' }
  }

  if (latestExecution) {
    return { status: 'done' as const, badge: '반영' }
  }

  return { status: 'ready' as const, badge: '준비' }
}

function createFlowModel({
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
  const changedFileCount = latestExecution?.workspace.changedFiles.length ?? 0
  const runtimeModel = normalizeModelLabel(latestExecution?.model || activeAgent?.model || '')
  const route = routeSummary({
    latestRun,
    latestExecution,
    bridgeError,
    workspaceError,
    requiresApiKey,
  })

  const triggerStatus: StepStatus =
    recentPrompt.trim() || latestRun?.task ? (latestRun?.status === 'running' ? 'running' : 'done') : 'idle'
  const hubStatus: StepStatus = activeAgent
    ? activeAgent.status === 'success'
      ? 'done'
      : activeAgent.status === 'error'
        ? 'blocked'
        : activeAgent.status === 'running'
          ? 'running'
          : 'ready'
    : 'blocked'
  const modelStatus: StepStatus = runtimeModel ? 'done' : activeAgent ? 'ready' : 'blocked'
  const memoryStatus: StepStatus = messageCount > 0 ? 'ready' : 'idle'
  const signalStatus: StepStatus = signalCount > 0 ? 'ready' : 'idle'
  const toolsStatus: StepStatus = activeTools.length > 0 ? 'ready' : 'idle'
  const filesStatus: StepStatus = changedFileCount > 0 ? 'done' : filesCount > 0 ? 'ready' : 'idle'
  const insightsStatus: StepStatus = insightsCount > 0 ? 'done' : 'idle'
  const activityStatus: StepStatus = activityCount > 0 ? 'done' : 'idle'

  const nodes: Array<Node<FlowNodeData>> = [
    {
      id: 'trigger',
      type: 'orchestration',
      position: { x: 72, y: 238 },
      data: {
        title: '입력',
        badge: recentPrompt.trim() ? '입력됨' : statusBadge(triggerStatus),
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
      id: 'memory',
      type: 'orchestration',
      position: { x: 448, y: 82 },
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
    },
    {
      id: 'hub',
      type: 'orchestration',
      position: { x: 350, y: 194 },
      data: {
        title: activeAgent?.name || '에이전트 선택',
        subtitle: activeAgent
          ? `${providerLabel(activeAgent.provider)} · ${normalizeModelLabel(activeAgent.model)}`
          : '설정에서 실행기를 고릅니다.',
        badge: statusBadge(hubStatus),
        icon: 'agent',
        tone: 'hub',
        status: hubStatus,
        kind: 'hub',
        page: activeAgent ? undefined : 'settings',
        agentId: activeAgent?.id,
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'router',
      type: 'orchestration',
      position: { x: 744, y: 238 },
      data: {
        title: '분기',
        badge: route.badge,
        icon: 'route',
        tone: 'support',
        status: route.status,
        kind: 'router',
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'files',
      type: 'orchestration',
      position: { x: 946, y: 96 },
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
      position: { x: 946, y: 238 },
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
      position: { x: 946, y: 380 },
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
    {
      id: 'model',
      type: 'orchestration',
      position: { x: 216, y: 396 },
      data: {
        title: '모델',
        badge: runtimeModel ? runtimeModel : statusBadge(modelStatus),
        icon: 'chat',
        tone: 'support',
        status: modelStatus,
        kind: 'model',
        page: 'settings',
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'signals',
      type: 'orchestration',
      position: { x: 450, y: 396 },
      data: {
        title: '시그널',
        badge: signalCount > 0 ? `${signalCount}` : statusBadge(signalStatus),
        icon: 'signals',
        tone: 'support',
        status: signalStatus,
        kind: 'signals',
        page: 'signals',
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'tools',
      type: 'orchestration',
      position: { x: 684, y: 396 },
      data: {
        title: '도구',
        badge: activeTools.length > 0 ? `${activeTools.length}` : statusBadge(toolsStatus),
        icon: 'tools',
        tone: 'support',
        status: toolsStatus,
        kind: 'tools',
        page: 'tools',
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
    {
      id: 'memory-hub',
      source: 'memory',
      sourceHandle: 'out-bottom',
      target: 'hub',
      targetHandle: 'in-top',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${memoryStatus}`,
    },
    {
      id: 'model-hub',
      source: 'model',
      sourceHandle: 'out-top',
      target: 'hub',
      targetHandle: 'in-bottom-left',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${modelStatus}`,
    },
    {
      id: 'signals-hub',
      source: 'signals',
      sourceHandle: 'out-top',
      target: 'hub',
      targetHandle: 'in-bottom',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${signalStatus}`,
    },
    {
      id: 'tools-hub',
      source: 'tools',
      sourceHandle: 'out-top',
      target: 'hub',
      targetHandle: 'in-bottom-right',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${toolsStatus}`,
    },
    {
      id: 'hub-router',
      source: 'hub',
      sourceHandle: 'out-right',
      target: 'router',
      targetHandle: 'in-left',
      type: 'smoothstep',
      animated: route.status === 'running',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${route.status}`,
    },
    {
      id: 'router-files',
      source: 'router',
      sourceHandle: 'out-right-top',
      target: 'files',
      targetHandle: 'in-left',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${filesStatus}`,
    },
    {
      id: 'router-insights',
      source: 'router',
      sourceHandle: 'out-right',
      target: 'insights',
      targetHandle: 'in-left',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${insightsStatus}`,
    },
    {
      id: 'router-activity',
      source: 'router',
      sourceHandle: 'out-right-bottom',
      target: 'activity',
      targetHandle: 'in-left',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${activityStatus}`,
    },
  ]

  return { nodes, edges }
}

function OrchestrationFlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const isHub = data.kind === 'hub'

  return (
    <div
      className={[
        'orchestration-flow-node',
        isHub ? 'orchestration-flow-node--hub' : 'orchestration-flow-node--mini',
        `orchestration-flow-node--${data.tone}`,
        `is-${data.status}`,
      ].join(' ')}
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
            style={{ left: '30%' }}
          />
          <Handle
            className="orchestration-flow-node__handle"
            position={Position.Bottom}
            type="target"
            id="in-bottom"
            style={{ left: '50%' }}
          />
          <Handle
            className="orchestration-flow-node__handle"
            position={Position.Bottom}
            type="target"
            id="in-bottom-right"
            style={{ left: '70%' }}
          />
        </>
      ) : null}

      <div className="orchestration-flow-node__head">
        <span className="orchestration-flow-node__icon" aria-hidden="true">
          <Icon name={data.icon} size={isHub ? 13 : 11} />
        </span>
        <strong>{data.title}</strong>
        <span className="orchestration-flow-node__badge">
          <i className={`orchestration-flow-node__dot is-${data.status}`} />
          {data.badge}
        </span>
      </div>

      {data.subtitle ? <p className="orchestration-flow-node__subtitle">{data.subtitle}</p> : null}

      {data.kind === 'memory' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Bottom} type="source" id="out-bottom" />
      ) : null}

      {data.kind === 'model' || data.kind === 'signals' || data.kind === 'tools' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Top} type="source" id="out-top" />
      ) : null}

      {data.kind === 'trigger' || data.kind === 'hub' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Right} type="source" id="out-right" />
      ) : null}

      {data.kind === 'router' ? (
        <>
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
            id="out-right"
            style={{ top: '50%' }}
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
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)

  const graph = useMemo(
    () =>
      createFlowModel({
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

  useEffect(() => {
    if (!flowInstance) {
      return
    }

    const fit = () =>
      flowInstance.fitView({
        padding: 0.16,
        minZoom: 0.74,
        maxZoom: 1.2,
        duration: 240,
      })

    const firstFrame = window.requestAnimationFrame(fit)
    const secondPass = window.setTimeout(fit, 180)

    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.clearTimeout(secondPass)
    }
  }, [flowInstance, activeAgent?.id, latestExecution?.receivedAt, bridgeError, workspaceError, requiresApiKey])

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
        fitViewOptions={{ padding: 0.16, minZoom: 0.74, maxZoom: 1.2 }}
        minZoom={0.58}
        maxZoom={1.4}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
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
