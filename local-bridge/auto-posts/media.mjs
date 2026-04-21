import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildMediaCacheFileName,
  canonicalizeUrl,
  extractYouTubeVideoId,
  hashText,
  hostnameFromUrl,
  sanitizeFileSegment,
} from './normalize.mjs'

const META_TAG_PATTERN =
  /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi
const LINK_TAG_PATTERN = /<link[^>]+rel=["']([^"']+)["'][^>]+href=["']([^"']+)["'][^>]*>/gi
const TITLE_PATTERN = /<title[^>]*>([^<]+)<\/title>/i

function stripHtml(value = '') {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripNonReadableBlocks(html = '') {
  return String(html ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
}

function looksReadableSentence(sentence = '') {
  const normalized = String(sentence ?? '').trim()
  if (!normalized || normalized.length < 28) {
    return false
  }

  if (
    /@context|schema\.org|application\/ld\+json|\"@type\"|\"@id\"|window\.|document\.|function\(|xmlns|viewbox|fill-rule|stroke-width/i.test(
      normalized,
    )
  ) {
    return false
  }

  const symbolCount = (normalized.match(/[{}[\]<>=$]/g) ?? []).length
  if (symbolCount >= 6) {
    return false
  }

  return true
}

function extractReadableSnippet(html = '') {
  const plain = stripHtml(stripNonReadableBlocks(html))
  if (!plain) {
    return ''
  }

  const sentences = plain
    .split(/(?<=[.!?。다])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(looksReadableSentence)

  return sentences.join(' ').slice(0, 1200).trim()
}

function extractMeta(html = '') {
  const meta = new Map()
  let match
  while ((match = META_TAG_PATTERN.exec(html)) !== null) {
    meta.set(match[1].toLowerCase(), stripHtml(match[2]))
  }

  const links = new Map()
  while ((match = LINK_TAG_PATTERN.exec(html)) !== null) {
    links.set(match[1].toLowerCase(), match[2])
  }

  return { meta, links }
}

function absolutizeUrl(candidateUrl, maybeRelativeUrl) {
  if (!maybeRelativeUrl) {
    return ''
  }

  try {
    return new URL(maybeRelativeUrl, candidateUrl).toString()
  } catch {
    return String(maybeRelativeUrl ?? '').trim()
  }
}

function guessProvider(url = '') {
  const hostname = hostnameFromUrl(url)
  if (!hostname) {
    return ''
  }

  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    return 'youtube'
  }
  if (hostname.includes('github.com')) {
    return 'github'
  }
  if (hostname.includes('arxiv.org')) {
    return 'arxiv'
  }
  return hostname
}

export async function fetchPageMetadata(url, { fetchWithTimeout, timeoutMs = 15_000 } = {}) {
  if (!url) {
    return null
  }

  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Artemis Auto Posts',
        },
      },
      timeoutMs,
    )

    if (!response.ok) {
      throw new Error(`메타데이터 요청에 실패했습니다. (${response.status})`)
    }

    const html = await response.text()
    const { meta, links } = extractMeta(html)
    const pageTitle = stripHtml(html.match(TITLE_PATTERN)?.[1] ?? '')

    return {
      url,
      canonicalUrl: canonicalizeUrl(
        absolutizeUrl(url, links.get('canonical') || meta.get('og:url') || url),
      ),
      title: meta.get('og:title') || meta.get('twitter:title') || pageTitle,
      description:
        meta.get('og:description') ||
        meta.get('twitter:description') ||
        meta.get('description') ||
        '',
      imageUrl: absolutizeUrl(url, meta.get('og:image') || meta.get('twitter:image') || ''),
      videoUrl: absolutizeUrl(url, meta.get('og:video') || meta.get('og:video:url') || ''),
      thumbnailUrl: absolutizeUrl(url, meta.get('og:image') || meta.get('twitter:image') || ''),
      embedHtml: meta.get('twitter:player') || '',
      siteName: meta.get('og:site_name') || '',
      author: meta.get('author') || '',
      htmlSnippet: extractReadableSnippet(html),
    }
  } catch (error) {
    return {
      url,
      canonicalUrl: canonicalizeUrl(url),
      title: '',
      description: '',
      imageUrl: '',
      videoUrl: '',
      thumbnailUrl: '',
      embedHtml: '',
      siteName: '',
      author: '',
      htmlSnippet: '',
      error: error instanceof Error ? error.message : '메타데이터를 읽지 못했습니다.',
    }
  }
}

async function fetchOEmbed(url, { fetchWithTimeout, timeoutMs = 12_000 } = {}) {
  const videoId = extractYouTubeVideoId(url)
  const targetEndpoints = []

  if (videoId) {
    targetEndpoints.push(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
  } else if (/vimeo\.com/i.test(url)) {
    targetEndpoints.push(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`)
  }

  for (const endpoint of targetEndpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, undefined, timeoutMs)
      if (!response.ok) {
        continue
      }

      const payload = await response.json()
      return {
        provider: payload.provider_name || guessProvider(url),
        title: payload.title || '',
        description: payload.author_name || '',
        thumbnailUrl: payload.thumbnail_url || '',
        width: Number(payload.width || 0),
        height: Number(payload.height || 0),
        embedHtml:
          typeof payload.html === 'string' && payload.html.trim()
            ? payload.html
            : videoId
              ? `<iframe src="https://www.youtube.com/embed/${videoId}" title="${payload.title || 'video'}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
              : '',
      }
    } catch {
      // oEmbed is optional.
    }
  }

  return null
}

async function cacheRemoteAsset(url, cacheDir, { fetchWithTimeout, fallbackBase = 'asset' } = {}) {
  if (!url) {
    return null
  }

  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'image/*,video/*,*/*;q=0.8',
        'User-Agent': 'Artemis Auto Posts',
      },
    },
    20_000,
  )

  if (!response.ok) {
    throw new Error(`원격 자산 다운로드에 실패했습니다. (${response.status})`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const mimeType = response.headers.get('content-type') || ''
  const fileName = buildMediaCacheFileName({
    url,
    mimeType,
    fallbackBase,
  })
  const targetPath = path.join(cacheDir, fileName)

  await mkdir(cacheDir, { recursive: true })
  await writeFile(targetPath, buffer)

  return {
    localPath: targetPath,
    mimeType,
    width: null,
    height: null,
  }
}

async function capturePageScreenshot(url, targetPath) {
  let browser = null

  try {
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18_000 })
    await page.screenshot({ path: targetPath, fullPage: false })
    return targetPath
  } finally {
    await browser?.close().catch(() => {})
  }
}

async function createScreenshotAttachment(candidate, cacheDir) {
  const fileName = `${sanitizeFileSegment(candidate.slug || candidate.id || 'page', 'page')}-${hashText(candidate.url).slice(0, 12)}.png`
  const targetPath = path.join(cacheDir, fileName)

  try {
    await mkdir(cacheDir, { recursive: true })
    await capturePageScreenshot(candidate.url, targetPath)
    await stat(targetPath)

    return {
      id: `media-${hashText(`${candidate.id}:screenshot`).slice(0, 12)}`,
      kind: 'screenshot',
      url: candidate.url,
      embedHtml: '',
      thumbnailUrl: '',
      width: null,
      height: null,
      provider: guessProvider(candidate.url),
      title: `${candidate.title} 스크린샷`,
      description: '대표 이미지를 확보하지 못해 페이지 화면을 스크린샷으로 저장했습니다.',
      localPath: targetPath,
      mimeType: 'image/png',
      priority: 1,
    }
  } catch {
    return null
  }
}

function buildAttachmentBase(kind, candidate, payload = {}, priority = 1) {
  return {
    id: `media-${hashText(`${candidate.id}:${kind}:${payload.url || payload.thumbnailUrl || payload.localPath || priority}`).slice(0, 12)}`,
    kind,
    url: payload.url || '',
    embedHtml: payload.embedHtml || '',
    thumbnailUrl: payload.thumbnailUrl || '',
    width: Number(payload.width || 0) || null,
    height: Number(payload.height || 0) || null,
    provider: payload.provider || guessProvider(payload.url || candidate.url),
    title: payload.title || candidate.title,
    description: payload.description || '',
    localPath: payload.localPath || '',
    mimeType: payload.mimeType || '',
    priority,
  }
}

export async function buildMediaAttachments(
  candidate,
  {
    fetchWithTimeout,
    cacheDir,
    screenshotFallback = true,
  } = {},
) {
  const attachments = []
  const pageMeta = candidate.rawMeta?.pageMeta ?? null
  const oEmbed = await fetchOEmbed(candidate.url, { fetchWithTimeout }).catch(() => null)

  if (oEmbed?.embedHtml) {
    attachments.push(
      buildAttachmentBase(
        'embed',
        candidate,
        {
          url: candidate.url,
          embedHtml: oEmbed.embedHtml,
          thumbnailUrl: oEmbed.thumbnailUrl,
          provider: oEmbed.provider,
          title: oEmbed.title,
          description: oEmbed.description,
          width: oEmbed.width,
          height: oEmbed.height,
        },
        4,
      ),
    )
  }

  const videoUrl = pageMeta?.videoUrl || ''
  if (videoUrl) {
    attachments.push(
      buildAttachmentBase(
        'video',
        candidate,
        {
          url: videoUrl,
          thumbnailUrl: pageMeta?.thumbnailUrl || '',
          provider: guessProvider(videoUrl),
          title: pageMeta?.title || candidate.title,
          description: pageMeta?.description || '',
        },
        5,
      ),
    )
  }

  const imageCandidates = [pageMeta?.imageUrl, oEmbed?.thumbnailUrl, pageMeta?.thumbnailUrl].filter(Boolean)
  const seenImageUrls = new Set()

  for (const imageUrl of imageCandidates) {
    const normalized = canonicalizeUrl(imageUrl)
    if (!normalized || seenImageUrls.has(normalized)) {
      continue
    }
    seenImageUrls.add(normalized)

    let cachedAsset = null
    try {
      cachedAsset = await cacheRemoteAsset(normalized, cacheDir, {
        fetchWithTimeout,
        fallbackBase: sanitizeFileSegment(candidate.slug || candidate.title || candidate.id, 'media'),
      })
    } catch {
      cachedAsset = null
    }

    attachments.push(
      buildAttachmentBase(
        imageCandidates[0] === imageUrl ? 'image' : 'thumbnail',
        candidate,
        {
          url: normalized,
          thumbnailUrl: normalized,
          provider: guessProvider(normalized),
          title: candidate.title,
          description: pageMeta?.description || '',
          localPath: cachedAsset?.localPath || '',
          mimeType: cachedAsset?.mimeType || '',
        },
        imageCandidates[0] === imageUrl ? 3 : 2,
      ),
    )
  }

  if (attachments.length === 0 && screenshotFallback) {
    const screenshotAttachment = await createScreenshotAttachment(candidate, cacheDir)
    if (screenshotAttachment) {
      attachments.push(screenshotAttachment)
    }
  }

  return attachments
}

export function pickHeroMedia(attachments = []) {
  return [...attachments]
    .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0))[0] ?? null
}

export function pickSecondaryMedia(attachments = [], limit = 3) {
  const hero = pickHeroMedia(attachments)
  return attachments
    .filter((item) => item.id !== hero?.id)
    .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0))
    .slice(0, limit)
}

export function createAssetPreviewPath(localPath = '', workspaceRoot = '') {
  if (!localPath) {
    return ''
  }

  const relativePath = path.relative(workspaceRoot, localPath).split(path.sep).join('/')
  return `/api/auto-posts/assets?path=${encodeURIComponent(relativePath)}`
}

export function renderMediaHtml(item, { previewUrl } = {}) {
  const sourceUrl = previewUrl || item.url || item.thumbnailUrl || ''

  if (item.kind === 'video' || item.kind === 'embed') {
    if (item.embedHtml) {
      return `<div class="auto-post-media auto-post-media--embed">${item.embedHtml}</div>`
    }

    if (sourceUrl) {
      return `<video class="auto-post-media auto-post-media--video" controls preload="metadata" src="${sourceUrl}"></video>`
    }
  }

  if (!sourceUrl) {
    return ''
  }

  return `<img class="auto-post-media auto-post-media--image" src="${sourceUrl}" alt="${item.title || ''}" loading="lazy" />`
}
