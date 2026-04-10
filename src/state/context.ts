import { createContext, useContext } from 'react'
import type { BridgeHealth } from '../lib/modelClient'
import type { WorkspaceEntry, WorkspaceFile, WorkspaceListing } from '../lib/workspaceClient'
import type {
  AgentItem,
  AgentPresetId,
  AgentRun,
  ChatThread,
  InsightItem,
  RuntimeState,
} from './types'

export type ArtemisContextValue = {
  state: RuntimeState
  activeThread: ChatThread
  activeAgent: AgentItem | null
  activeAgentRuns: AgentRun[]
  enabledToolsCount: number
  unreadInsightsCount: number
  dailyPromptCount: number
  storageUsedBytes: number
  isGenerating: boolean
  bridgeHealth: BridgeHealth | null
  bridgeError: string | null
  workspaceRootPath: string
  workspaceCurrentPath: string
  workspaceAbsolutePath: string
  workspaceParentPath: string | null
  workspaceEntries: WorkspaceEntry[]
  workspaceSummary: WorkspaceListing['summary']
  workspaceLoading: boolean
  workspaceError: string | null
  setComposerText: (text: string) => void
  sendPrompt: (
    prompt?: string,
    options?: { provider?: 'ollama' | 'codex'; model?: string; agentId?: string },
  ) => Promise<void>
  refreshBridgeHealth: () => Promise<void>
  syncSkills: () => Promise<void>
  createThread: () => void
  connectWorkspace: (rootPath: string) => Promise<void>
  refreshWorkspace: (nextPath?: string) => Promise<void>
  createWorkspaceFolder: (name: string) => Promise<void>
  uploadWorkspaceFiles: (files: FileList) => Promise<void>
  openWorkspaceFolder: (path: string) => Promise<void>
  readWorkspaceFile: (path: string) => Promise<WorkspaceFile>
  saveWorkspaceFile: (path: string, content: string) => Promise<WorkspaceFile>
  deleteWorkspaceEntry: (path: string) => Promise<void>
  revealWorkspacePath: (path?: string) => Promise<void>
  toggleTool: (toolId: string) => void
  markInsight: (insightId: string, status: InsightItem['status']) => void
  updateSettings: (patch: Partial<RuntimeState['settings']>) => void
  selectChatModel: (provider: 'ollama' | 'codex', model: string) => void
  addApiKey: (label: string, key: string) => void
  removeApiKey: (keyId: string) => void
  setActiveAgent: (agentId: string) => void
  createAgent: (presetId?: AgentPresetId) => void
  updateAgent: (agentId: string, patch: Partial<AgentItem>) => void
  deleteAgent: (agentId: string) => void
  runAgentTask: (agentId: string, task: string) => Promise<void>
  addSignal: (title: string, category: string, description: string) => void
  toggleSignal: (signalId: string) => void
  resetAll: () => void
}

export const ArtemisContext = createContext<ArtemisContextValue | null>(null)

export function useArtemisApp() {
  const context = useContext(ArtemisContext)

  if (!context) {
    throw new Error('ArtemisProvider 바깥에서는 useArtemisApp을 사용할 수 없습니다.')
  }

  return context
}
