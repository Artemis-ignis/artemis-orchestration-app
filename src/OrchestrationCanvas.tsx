import { useMemo } from 'react'
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

type NodeTone = 'trigger' | 'hub' | 'support' | 'output'
type NodeVariant = 'hub' | 'mini'
type StepStatus = 'idle' | 'ready' | 'running' | 'done' | 'blocked'

type FlowNodeData = {
  title: string
  subtitle?: string
  badge: string
  tone: NodeTone
  variant: NodeVariant
  state: StepStatus
  icon: IconName
  page?: PageId
  agentId?: string
}

const BOARD_WIDTH = 1180
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

  return value || '연결 대기'
}

function statusBadge(status: StepStatus) {
  switch (status) {
    case 'running':
      return '실행'
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
    return { status: 'blocked' as const, badge: '브리지', text: '브리지 오류' }
  }

  if (workspaceError) {
    return { status: 'blocked' as const, badge: '폴더', text: '작업 폴더 오류' }
  }

  if (requiresApiKey) {
    return { status: 'blocked' as const, badge: 'API', text: 'API 키 연결 필요' }
  }

  if (latestRun?.status === 'running') {
    return { status: 'running' as const, badge: '실행', text: '결과를 파일 · 인사이트 · 로그로 나눕니다.' }
  }

  if (latestExecution) {
    return { status: 'done' as const, badge: '반영', text: '결과가 파일 · 인사이트 · 로그에 반영됩니다.' }
  }

  return { status: 'ready' as const, badge: '준비', text: '결과를 파일 · 인사이트 · 로그로 나눕니다.' }
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
  const latestLogCount = latestRun?.logs.length ?? 0
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
  const memoryStatus: StepStatus = messageCount > 0 || insightsCount > 0 ? 'ready' : 'idle'
  const signalStatus: StepStatus = signalCount > 0 ? 'ready' : 'idle'
  const toolsStatus: StepStatus = activeTools.length > 0 ? 'ready' : 'idle'
  const filesStatus: StepStatus = changedFileCount > 0 ? 'done' : filesCount > 0 ? 'ready' : 'idle'
  const insightsStatus: StepStatus = insightsCount > 0 ? 'done' : 'idle'
  const activityStatus: StepStatus = activityCount > 0 || latestLogCount > 0 ? 'done' : 'idle'

  const nodes: Array<Node<FlowNodeData>> = [
    {
      id: 'trigger',
      type: 'orchestration',
      position: { x: 58, y: 226 },
      draggable: false,
      selectable: false,
      data: {
        title: '입력',
        badge: recentPrompt.trim() ? '입력됨' : statusBadge(triggerStatus),
        tone: 'trigger',
        variant: 'mini',
        state: triggerStatus,
        icon: 'spark',
        page: 'chat',
      },
    },
    {
      id: 'memory',
      type: 'orchestration',
      position: { x: 392, y: 76 },
      draggable: false,
      selectable: false,
      data: {
        title: '메모리',
        badge: messageCount > 0 ? '대화' : statusBadge(memoryStatus),
        tone: 'support',
        variant: 'mini',
        state: memoryStatus,
        icon: 'memory',
        page: 'insights',
      },
    },
    {
      id: 'hub',
      type: 'orchestration',
      position: { x: 332, y: 176 },
      draggable: false,
      selectable: false,
      data: {
        title: activeAgent?.name || '에이전트 선택',
        subtitle: activeAgent
          ? `${providerLabel(activeAgent.provider)} · ${normalizeModelLabel(activeAgent.model)}`
          : '설정에서 실행기를 고릅니다.',
        badge: statusBadge(hubStatus),
        tone: 'hub',
        variant: 'hub',
        state: hubStatus,
        icon: 'agent',
        page: activeAgent ? undefined : 'settings',
        agentId: activeAgent?.id,
      },
    },
    {
      id: 'router',
      type: 'orchestration',
      position: { x: 734, y: 226 },
      draggable: false,
      selectable: false,
      data: {
        title: '분기',
        badge: route.badge,
        tone: 'support',
        variant: 'mini',
        state: route.status,
        icon: 'route',
      },
    },
    {
      id: 'files',
      type: 'orchestration',
      position: { x: 952, y: 96 },
      draggable: false,
      selectable: false,
      data: {
        title: '파일',
        badge: changedFileCount > 0 ? `+${changedFileCount}` : `${filesCount}`,
        tone: 'output',
        variant: 'mini',
        state: filesStatus,
        icon: 'folder',
        page: 'files',
      },
    },
    {
      id: 'insights',
      type: 'orchestration',
      position: { x: 952, y: 226 },
      draggable: false,
      selectable: false,
      data: {
        title: '인사이트',
        badge: insightsCount > 0 ? `${insightsCount}` : statusBadge(insightsStatus),
        tone: 'output',
        variant: 'mini',
        state: insightsStatus,
        icon: 'insights',
        page: 'insights',
      },
    },
    {
      id: 'activity',
      type: 'orchestration',
      position: { x: 952, y: 356 },
      draggable: false,
      selectable: false,
      data: {
        title: '로그',
        badge: latestLogCount > 0 ? `${latestLogCount}` : `${activityCount}`,
        tone: 'output',
        variant: 'mini',
        state: activityStatus,
        icon: 'activity',
        page: 'activity',
      },
    },
    {
      id: 'model',
      type: 'orchestration',
      position: { x: 210, y: 386 },
      draggable: false,
      selectable: false,
      data: {
        title: '모델',
        badge: runtimeModel ? '연결' : statusBadge(modelStatus),
        tone: 'support',
        variant: 'mini',
        state: modelStatus,
        icon: 'chat',
        page: 'settings',
      },
    },
    {
      id: 'signals',
      type: 'orchestration',
      position: { x: 432, y: 386 },
      draggable: false,
      selectable: false,
      data: {
        title: '시그널',
        badge: signalCount > 0 ? `${signalCount}` : statusBadge(signalStatus),
        tone: 'support',
        variant: 'mini',
        state: signalStatus,
        icon: 'signals',
        page: 'signals',
      },
    },
    {
      id: 'tools',
      type: 'orchestration',
      position: { x: 654, y: 386 },
      draggable: false,
      selectable: false,
      data: {
        title: '도구',
        badge: activeTools.length > 0 ? `${activeTools.length}` : statusBadge(toolsStatus),
        tone: 'support',
        variant: 'mini',
        state: toolsStatus,
        icon: 'tools',
        page: 'tools',
      },
    },
  ]

  const edges: Array<Edge> = [
    {
      id: 'trigger-hub',
      source: 'trigger',
      sourceHandle: 'right-source',
      target: 'hub',
      targetHandle: 'left-target',
      type: 'smoothstep',
      animated: triggerStatus === 'running',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${triggerStatus === 'running' ? 'running' : 'ready'}`,
    },
    {
      id: 'memory-hub',
      source: 'memory',
      sourceHandle: 'bottom-source',
      target: 'hub',
      targetHandle: 'top-target',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${memoryStatus}`,
    },
    {
      id: 'model-hub',
      source: 'model',
      sourceHandle: 'top-source',
      target: 'hub',
      targetHandle: 'bottom-left-target',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${modelStatus}`,
    },
    {
      id: 'signals-hub',
      source: 'signals',
      sourceHandle: 'top-source',
      target: 'hub',
      targetHandle: 'bottom-target',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${signalStatus}`,
    },
    {
      id: 'tools-hub',
      source: 'tools',
      sourceHandle: 'top-source',
      target: 'hub',
      targetHandle: 'bottom-right-target',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge orchestration-flow__edge--support is-${toolsStatus}`,
    },
    {
      id: 'hub-router',
      source: 'hub',
      sourceHandle: 'right-source',
      target: 'router',
      targetHandle: 'left-target',
      type: 'smoothstep',
      animated: route.status === 'running',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${route.status}`,
    },
    {
      id: 'router-files',
      source: 'router',
      sourceHandle: 'right-top-source',
      target: 'files',
      targetHandle: 'left-target',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${filesStatus}`,
    },
    {
      id: 'router-insights',
      source: 'router',
      sourceHandle: 'right-source',
      target: 'insights',
      targetHandle: 'left-target',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${insightsStatus}`,
    },
    {
      id: 'router-activity',
      source: 'router',
      sourceHandle: 'right-bottom-source',
      target: 'activity',
      targetHandle: 'left-target',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${activityStatus}`,
    },
  ]

  return { nodes, edges }
}

function OrchestrationFlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const iconSize = data.variant === 'hub' ? 15 : 12

  return (
    <div
      className={[
        'orchestration-flow-node',
        `orchestration-flow-node--${data.variant}`,
        `orchestration-flow-node--${data.tone}`,
        `is-${data.state}`,
      ].join(' ')}
    >
      <Handle className="orchestration-flow-node__handle" position={Position.Left} type="target" id="left-target" />
      <Handle className="orchestration-flow-node__handle" position={Position.Top} type="target" id="top-target" />
      <Handle
        className="orchestration-flow-node__handle"
        position={Position.Bottom}
        type="target"
        id="bottom-left-target"
        style={{ left: '28%' }}
      />
      <Handle
        className="orchestration-flow-node__handle"
        position={Position.Bottom}
        type="target"
        id="bottom-target"
        style={{ left: '50%' }}
      />
      <Handle
        className="orchestration-flow-node__handle"
        position={Position.Bottom}
        type="target"
        id="bottom-right-target"
        style={{ left: '72%' }}
      />

      <div className="orchestration-flow-node__head">
        <span className="orchestration-flow-node__icon" aria-hidden="true">
          <Icon name={data.icon} size={iconSize} />
        </span>
        <div className="orchestration-flow-node__copy">
          <strong>{data.title}</strong>
          {data.subtitle ? <span>{data.subtitle}</span> : null}
        </div>
        <span className="orchestration-flow-node__badge">
          <i className={`orchestration-flow-node__dot is-${data.state}`} />
          {data.badge}
        </span>
      </div>

      <Handle
        className="orchestration-flow-node__handle"
        position={Position.Right}
        type="source"
        id="right-top-source"
        style={{ top: '28%' }}
      />
      <Handle
        className="orchestration-flow-node__handle"
        position={Position.Right}
        type="source"
        id="right-source"
        style={{ top: '50%' }}
      />
      <Handle
        className="orchestration-flow-node__handle"
        position={Position.Right}
        type="source"
        id="right-bottom-source"
        style={{ top: '72%' }}
      />
      <Handle
        className="orchestration-flow-node__handle"
        position={Position.Bottom}
        type="source"
        id="bottom-source"
      />
      <Handle
        className="orchestration-flow-node__handle"
        position={Position.Top}
        type="source"
        id="top-source"
      />
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

  return (
    <div className="orchestration-canvas orchestration-canvas--flow">
      <div className="orchestration-canvas__hud">
        <span>드래그 이동</span>
        <span>휠 확대</span>
      </div>
      <ReactFlow
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.74 }}
        minZoom={0.58}
        maxZoom={1.5}
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        translateExtent={[
          [-120, -80],
          [BOARD_WIDTH + 120, BOARD_HEIGHT + 120],
        ]}
        onNodeClick={(_, node) => {
          if (node.data.agentId) {
            onSelectAgent(node.data.agentId)
          }
          if (node.data.page) {
            onNavigate(node.data.page)
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
          color="rgba(218, 229, 255, 0.14)"
          gap={30}
          size={1.1}
        />
        <Controls className="orchestration-flow__controls" position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export default OrchestrationCanvas
