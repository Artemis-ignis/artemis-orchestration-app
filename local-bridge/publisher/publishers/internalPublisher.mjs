import { nowIso, slugify } from '../../auto-posts/normalize.mjs'

function buildExcerpt(text = '') {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }

  return normalized.length > 180 ? `${normalized.slice(0, 179).trim()}…` : normalized
}

export function createInternalPublisher({ store }) {
  async function getStatus(settings) {
    if (!settings.publishInternalEnabled) {
      return {
        target: 'internal',
        enabled: false,
        configured: true,
        ready: false,
        detail: '내부 게시기가 비활성화되어 있습니다.',
      }
    }

    return {
      target: 'internal',
      enabled: true,
      configured: true,
      ready: true,
      detail: '내부 게시 큐와 피드 저장이 활성화되어 있습니다.',
    }
  }

  async function publish({ workspaceRoot, settings, draft, dryRun = false }) {
    const startedAt = nowIso()
    const status = await getStatus(settings)

    if (!status.enabled) {
      return {
        ok: false,
        simulated: true,
        disabled: true,
        internalPostId: null,
        publishedAt: null,
        detail: status.detail,
      }
    }

    if (dryRun || settings.mode === 'dry-run') {
      return {
        ok: true,
        simulated: true,
        internalPostId: `dryrun-${Date.now().toString(36)}`,
        publishedAt: startedAt,
        detail: 'dry-run 모드로 내부 게시를 시뮬레이션했습니다.',
      }
    }

    const postId = `post-${slugify(draft.sourceTitle || draft.title || draft.id, 'post')}-${draft.topicHash.slice(0, 8)}`
    const postEntry = {
      id: postId,
      draftId: draft.id,
      title: draft.sourceTitle,
      excerpt: buildExcerpt(draft.generatedText),
      body: draft.generatedText,
      summaryType: draft.summaryType,
      provider: draft.provider,
      sourceLabel: draft.sourceLabel,
      sourceType: draft.sourceType,
      category: draft.category,
      sourceUrl: draft.sourceUrl,
      canonicalUrl: draft.canonicalUrl,
      authors: Array.isArray(draft.authors) ? draft.authors : [],
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      publishedAt: startedAt,
      createdAt: draft.createdAt,
      sourceMeta: draft.sourceMeta ?? null,
      publishResult: null,
    }

    await store.appendPublished(workspaceRoot, postEntry, settings)

    return {
      ok: true,
      simulated: false,
      internalPostId: postId,
      publishedAt: startedAt,
      detail: '내부 웹사이트 피드에 게시했습니다.',
      post: postEntry,
    }
  }

  return {
    getStatus,
    publish,
  }
}
