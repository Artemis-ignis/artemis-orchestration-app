export type SignalCandidate = {
  id: string
  sourceType: 'hackerNews' | 'github' | 'arxiv' | 'rss' | 'webpage'
  category: string
  categoryLabel?: string
  title: string
  summary: string
  url: string
  sourceLabel: string
  publishedAt: string
  discoveredAt: string
  score: number
  language: string
  authorOrChannel: string
  slug?: string
  dedupeKey?: string
  rawMeta: Record<string, unknown>
}

export type MediaAttachment = {
  id: string
  kind: 'image' | 'video' | 'embed' | 'thumbnail' | 'screenshot'
  url: string
  embedHtml: string
  thumbnailUrl: string
  width: number | null
  height: number | null
  provider: string
  title: string
  description: string
  localPath: string
  mimeType: string
  priority: number
  previewUrl?: string
}

export type GeneratedPostStatus = 'draft' | 'ready' | 'failed'

export type GeneratedPostSummary = {
  id: string
  slug: string
  createdAt: string
  updatedAt: string
  category: string
  status: GeneratedPostStatus
  topicScore: number
  title: string
  previewText: string
  threeLineSummary: string[]
  thumbnail: string
  dedupeKey: string
  generationModel: string
  sourceCount: number
  workspacePath: string
  htmlPath: string
  jsonPath: string
}

export type GeneratedPost = {
  id: string
  slug: string
  createdAt: string
  updatedAt: string
  schedulerRunAt: string
  status: GeneratedPostStatus
  topicScore: number
  title: string
  subtitleLines: string[]
  lead: string
  category: string
  tags: string[]
  sourceItems: SignalCandidate[]
  mediaAttachments: MediaAttachment[]
  html: string
  plainTextSummary: string
  threeLineSummary: string[]
  dedupeKey: string
  workspacePath: string
  generationModel: string
  generationPromptVersion: string
  errors: string[]
  logs?: Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    createdAt: string
  }>
  summary?: GeneratedPostSummary
}

export type SchedulerState = {
  lastRunAt: string | null
  lastSuccessAt: string | null
  nextRunAt: string | null
  inProgress: boolean
  lastError: string
  processedUrlHashes: string[]
  generatedPostIds: string[]
}

export type AutoPostSettings = {
  enabled: boolean
  intervalMs: number
  topK: number
  categoryWeights: Record<string, number>
  generationModel: string
  screenshotFallback: boolean
  outputDir: string
}

export type AutoPostsListResponse = {
  ok: boolean
  items: GeneratedPostSummary[]
  settings: AutoPostSettings
  state: SchedulerState
}

export type AutoPostDetailResponse = {
  ok: boolean
} & GeneratedPost

export type AutoPostsRunResponse = {
  ok: boolean
  runId: string
  createdCount: number
  posts: GeneratedPostSummary[]
  selectedCandidates: Array<Pick<SignalCandidate, 'id' | 'title' | 'url' | 'score' | 'category'>>
  logs: Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    createdAt: string
  }>
  state: SchedulerState
  error?: string
}

export type AutoPostsStateResponse = {
  ok: boolean
  settings: AutoPostSettings
  state: SchedulerState
}

export type AutoPostExportResponse = {
  ok: boolean
  format: 'html' | 'markdown'
  absolutePath: string
  relativePath: string
}
