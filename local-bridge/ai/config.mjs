import { readFileSync } from 'node:fs'
import path from 'node:path'

export const AI_PROVIDER_IDS = ['openrouter', 'nvidia-build', 'gemini']
export const ROUTING_MODES = [
  'auto-best-free',
  'auto-best-free-coding',
  'auto-best-free-fast',
  'manual',
]

let cachedRegistry = null

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function getProviderLabel(provider) {
  switch (provider) {
    case 'openrouter':
      return 'OpenRouter'
    case 'nvidia-build':
      return 'NVIDIA Build'
    case 'gemini':
      return 'Gemini Developer API'
    default:
      return provider
  }
}

export function normalizeProviderId(value) {
  if (typeof value !== 'string') {
    throw new Error('지원하지 않는 공급자입니다.')
  }

  const normalized = value.trim().toLowerCase()
  if (!AI_PROVIDER_IDS.includes(normalized)) {
    throw new Error(`지원하지 않는 공급자입니다: ${value}`)
  }

  return normalized
}

export function normalizeRoutingMode(value) {
  if (typeof value !== 'string') {
    return 'auto-best-free'
  }

  const normalized = value.trim().toLowerCase()
  return ROUTING_MODES.includes(normalized) ? normalized : 'auto-best-free'
}

export function loadFreeModelRegistry(projectRoot) {
  if (!cachedRegistry) {
    const registryPath = path.join(projectRoot, 'config', 'free_model_registry.json')
    cachedRegistry = JSON.parse(readFileSync(registryPath, 'utf8'))
  }

  return clone(cachedRegistry)
}

export function getProviderRegistry(projectRoot, provider) {
  const normalizedProvider = normalizeProviderId(provider)
  const registry = loadFreeModelRegistry(projectRoot)
  return registry.providers[normalizedProvider] ?? {
    display_name: getProviderLabel(normalizedProvider),
    default_candidates: [],
  }
}

export function getRoutingWeights(projectRoot, mode) {
  const registry = loadFreeModelRegistry(projectRoot)
  const normalizedMode = normalizeRoutingMode(mode)
  return clone(registry.weights[normalizedMode] ?? registry.weights['auto-best-free'])
}

export function parseCandidateListInput(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}
