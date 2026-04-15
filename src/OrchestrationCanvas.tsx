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
import type { AgentItem, AgentRun } from './state/types'

type OrchestrationCanvasAgentState = {
  id: string
  ready: boolean
}

type OrchestrationCanvasProps = {
  selectedAgents: AgentItem[]
  agentStates: OrchestrationCanvasAgentState[]
  sessionRuns: AgentRun[]
  taskDraft: string
  sessionTask: string
  recentPrompt: string
  bridgeError: string | null
  workspaceError: string | null
  requiresApiKey: boolean
  onNavigate: (page: PageId) => void
}

type StepStatus = 'idle' | 'ready' | 'running' | 'done' | 'blocked'
type NodeTone = 'trigger' | 'hub' | 'worker' | 'output' | 'standby'
type NodeKind = 'trigger' | 'hub' | 'worker' | 'output' | 'standby'

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
  return tail.length > 14 ? `${tail.slice(0, 14)}…` : tail
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
    return { status: 'blocked' as const, badge: '브리지 오류' }
  }

  if (workspaceError) {
    return { status: 'blocked' as const, badge: '폴더 오류' }
  }

  if (requiresApiKey) {
    return { status: 'blocked' as const, badge: '키 확인' }
  }

  if (sessionRuns.some((run) => run.status === 'running')) {
    return { status: 'running' as const, badge: '실행 중' }
  }

  if (sessionRuns.some((run) => run.status === 'success')) {
    return { status: 'done' as const, badge: '최근 완료' }
  }

  if (sessionRuns.some((run) => run.status === 'error')) {
    return { status: 'blocked' as const, badge: '실패 있음' }
  }

  return { status: 'ready' as const, badge: '준비됨' }
}

function createParallelWorkerPositions(count: number) {
  const safeCount = Math.max(1, count)
  const gap = safeCount === 1 ? 0 : 216
  const totalWidth = gap * (safeCount - 1)
  const startX = Math.round(654 - totalWidth / 2)

  return Array.from({ length: safeCount }, (_, index) => ({
    x: startX + index * gap,
    y: 468,
  }))
}

function resolveWorkerVisualState({
  run,
  ready,
  hasSession,
}: {
  run: AgentRun | undefined
  ready: boolean
  hasSession: boolean
}) {
  if (run?.status === 'running') {
    return { status: 'running' as const, badge: '실행 중' }
  }

  if (run?.status === 'success') {
    return { status: 'done' as const, badge: '완료' }
  }

  if (run?.status === 'error') {
    return { status: 'blocked' as const, badge: '실패' }
  }

  if (!ready) {
    return { status: 'blocked' as const, badge: '미준비' }
  }

  return { status: 'ready' as const, badge: hasSession ? '실행 대기' : '연결됨' }
}

function createFlowModel({
  selectedAgents,
  agentStates,
  sessionRuns,
  taskDraft,
  sessionTask,
  recentPrompt,
  bridgeError,
  workspaceError,
  requiresApiKey,
}: Omit<OrchestrationCanvasProps, 'onNavigate'>) {
  const latestRunsByAgent = latestRunMap(sessionRuns)
  const readyAgentMap = new Map(agentStates.map((item) => [item.id, item.ready]))
  const hasDraft = Boolean(taskDraft.trim())
  const hasSessionTask = Boolean(sessionTask.trim())
  const hasRecentPrompt = Boolean(recentPrompt.trim())
  const hasSession = sessionRuns.length > 0
  const hasWorkers = selectedAgents.length > 0
  const route = routeSummary({
    sessionRuns,
    bridgeError,
    workspaceError,
    requiresApiKey,
  })

  const sessionSuccessCount = sessionRuns.filter((run) => run.status === 'success').length
  const sessionErrorCount = sessionRuns.filter((run) => run.status === 'error').length
  const sessionRunningCount = sessionRuns.filter((run) => run.status === 'running').length

  const triggerSubtitle = hasDraft
    ? '입력 준비'
    : hasSessionTask
      ? '최근 실행 지시'
      : hasRecentPrompt
        ? '최근 입력'
        : '대기'
  const triggerBadge = hasDraft
    ? '입력됨'
    : hasSessionTask
      ? '최근 실행'
      : hasRecentPrompt
        ? '최근 있음'
        : '대기'

  const resultStatus: StepStatus =
    sessionRunningCount > 0
      ? 'running'
      : sessionSuccessCount > 0
        ? 'done'
        : sessionErrorCount > 0
          ? 'blocked'
          : hasWorkers
            ? 'ready'
            : 'idle'
  const resultBadge =
    sessionRunningCount > 0
      ? '수집 중'
      : sessionSuccessCount > 0
        ? `${sessionSuccessCount}개 도착`
        : sessionErrorCount > 0
          ? '오류 있음'
          : hasWorkers
            ? '대기'
            : '선택 필요'
  const resultSubtitle =
    hasSession
      ? `완료 ${sessionSuccessCount} · 실패 ${sessionErrorCount} · 진행 ${sessionRunningCount}`
      : hasWorkers
        ? '실행 후 결과 카드 생성'
        : '모델을 먼저 고르세요'

  const nodes: Array<Node<FlowNodeData>> = [
    {
      id: 'trigger',
      type: 'orchestration',
      position: { x: 88, y: 318 },
      data: {
        title: '입력',
        subtitle: triggerSubtitle,
        badge: triggerBadge,
        icon: 'spark',
        tone: 'trigger',
        status: hasDraft || hasSessionTask || hasRecentPrompt ? 'ready' : 'idle',
        kind: 'trigger',
        page: 'chat',
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'hub',
      type: 'orchestration',
      position: { x: 428, y: 282 },
      data: {
        title: '병렬 허브',
        subtitle: hasWorkers ? `${selectedAgents.length}개 모델 동시 실행` : '실행할 모델 선택 대기',
        badge: hasWorkers ? route.badge : '준비',
        icon: 'agent',
        tone: 'hub',
        status: hasWorkers ? route.status : 'idle',
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
      animated: hasDraft || hasSession || hasSessionTask,
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `orchestration-flow__edge is-${hasDraft || hasSession || hasSessionTask ? 'running' : 'ready'}`,
    },
  ]

  if (!hasWorkers) {
    nodes.push({
      id: 'standby',
      type: 'orchestration',
      position: { x: 988, y: 318 },
      data: {
        title: '결과',
        subtitle: '모델을 고르면 여기에 결과가 모입니다',
        badge: '선택 필요',
        icon: 'route',
        tone: 'standby',
        status: 'blocked',
        kind: 'standby',
        page: 'settings',
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
      className: 'orchestration-flow__edge is-blocked',
    })

    return { nodes, edges }
  }

  const workerAgents = selectedAgents.slice(0, 6)
  const workerPositions = createParallelWorkerPositions(workerAgents.length)

  nodes.push({
    id: 'result',
    type: 'orchestration',
    position: { x: 1016, y: 302 },
    data: {
      title: '결과',
      subtitle: resultSubtitle,
      badge: resultBadge,
      icon: 'route',
      tone: 'output',
      status: resultStatus,
      kind: 'output',
    },
    draggable: true,
    selectable: false,
  })

  workerAgents.forEach((agent, index) => {
    const workerId = `worker-${agent.id}`
    const run = latestRunsByAgent.get(agent.id)
    const ready = readyAgentMap.get(agent.id) ?? true
    const workerState = resolveWorkerVisualState({
      run,
      ready,
      hasSession,
    })

    nodes.push({
      id: workerId,
      type: 'orchestration',
      position: workerPositions[index],
      data: {
        title: compactModelLabel(agent.model || agent.name),
        fullTitle: agent.name,
        subtitle: providerLabel(agent.provider),
        badge: workerState.badge,
        icon: 'chat',
        tone: 'worker',
        status: workerState.status,
        kind: 'worker',
        page: 'settings',
      },
      draggable: true,
      selectable: false,
    })

    edges.push(
      {
        id: `hub-${workerId}`,
        source: 'hub',
        sourceHandle: 'out-bottom',
        target: workerId,
        targetHandle: 'in-top',
        type: 'smoothstep',
        animated: workerState.status === 'running',
        markerEnd: { type: MarkerType.ArrowClosed },
        className: `orchestration-flow__edge is-${workerState.status}`,
      },
      {
        id: `${workerId}-result`,
        source: workerId,
        sourceHandle: 'out-right',
        target: 'result',
        targetHandle: 'in-left',
        type: 'smoothstep',
        animated: workerState.status === 'running',
        markerEnd: { type: MarkerType.ArrowClosed },
        className: `orchestration-flow__edge is-${workerState.status}`,
      },
    )
  })

  return { nodes, edges }
}

function OrchestrationFlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const isHub = data.kind === 'hub'
  const isCompact = data.kind === 'trigger' || data.kind === 'standby'

  const nodeClasses = [
    'orchestration-flow-node',
    `orchestration-flow-node--${data.tone}`,
    `is-${data.status}`,
    isHub ? 'orchestration-flow-node--hub' : '',
    isCompact ? 'orchestration-flow-node--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={nodeClasses} title={data.fullTitle ?? data.title}>
      {data.kind === 'worker' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Top} type="target" id="in-top" />
      ) : data.kind !== 'trigger' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Left} type="target" id="in-left" />
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

      {data.kind === 'worker' ? (
        <Handle className="orchestration-flow-node__handle" position={Position.Right} type="source" id="out-right" />
      ) : null}
    </div>
  )
}

const nodeTypes = { orchestration: OrchestrationFlowNode }

export function OrchestrationCanvas(props: OrchestrationCanvasProps) {
  const {
    selectedAgents,
    agentStates,
    sessionRuns,
    taskDraft,
    sessionTask,
    recentPrompt,
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
        agentStates,
        sessionRuns,
        taskDraft,
        sessionTask,
        recentPrompt,
        bridgeError,
        workspaceError,
        requiresApiKey,
      }),
    [
      selectedAgents,
      agentStates,
      sessionRuns,
      taskDraft,
      sessionTask,
      recentPrompt,
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
        padding: 0.18,
        minZoom: 0.54,
        maxZoom: 1.08,
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
        fitViewOptions={{ padding: 0.18, minZoom: 0.54, maxZoom: 1.08 }}
        minZoom={0.48}
        maxZoom={1.36}
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
          [-220, -180],
          [BOARD_WIDTH + 260, BOARD_HEIGHT + 220],
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
