import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function buildArticleDocument(html: string, title: string) {
  if (typeof window === 'undefined') {
    return html
  }

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  if (!doc.head.querySelector('base')) {
    const base = doc.createElement('base')
    base.setAttribute('target', '_blank')
    doc.head.prepend(base)
  }

  if (!doc.title) {
    const titleElement = doc.createElement('title')
    titleElement.textContent = title
    doc.head.prepend(titleElement)
  }

  return `<!doctype html>\n${doc.documentElement.outerHTML}`
}

function measureFrameHeight(frame: HTMLIFrameElement | null) {
  const doc = frame?.contentDocument
  if (!doc) {
    return null
  }

  const body = doc.body
  const root = doc.documentElement

  return Math.max(
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    root?.scrollHeight ?? 0,
    root?.offsetHeight ?? 0,
    640,
  )
}

export function AutoPostArticle({
  html,
  title,
}: {
  html: string
  title: string
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [frameHeight, setFrameHeight] = useState(880)
  const articleDocument = useMemo(() => buildArticleDocument(html, title), [html, title])

  const syncFrameHeight = useCallback(() => {
    const nextHeight = measureFrameHeight(frameRef.current)
    if (!nextHeight) {
      return
    }

    setFrameHeight((current) => (Math.abs(current - nextHeight) > 2 ? nextHeight : current))
  }, [])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) {
      return undefined
    }

    let resizeObserver: ResizeObserver | null = null
    let intervalId: number | null = null
    let timeoutIds: number[] = []
    let imageListeners: Array<() => void> = []

    const attachWatchers = () => {
      syncFrameHeight()

      const doc = frame.contentDocument
      if (!doc) {
        return
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => syncFrameHeight())
        resizeObserver.observe(doc.documentElement)
        if (doc.body) {
          resizeObserver.observe(doc.body)
        }
      }

      imageListeners = Array.from(doc.images).map((image) => {
        const listener = () => syncFrameHeight()
        image.addEventListener('load', listener, { once: true })
        return () => image.removeEventListener('load', listener)
      })

      timeoutIds = [80, 240, 700, 1400].map((delay) =>
        window.setTimeout(() => syncFrameHeight(), delay),
      )

      intervalId = window.setInterval(() => syncFrameHeight(), 2500)
    }

    const handleLoad = () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      if (intervalId) {
        window.clearInterval(intervalId)
      }
      timeoutIds.forEach((id) => window.clearTimeout(id))
      timeoutIds = []
      imageListeners.forEach((dispose) => dispose())
      imageListeners = []
      attachWatchers()
    }

    frame.addEventListener('load', handleLoad)
    handleLoad()

    return () => {
      frame.removeEventListener('load', handleLoad)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (intervalId) {
        window.clearInterval(intervalId)
      }
      timeoutIds.forEach((id) => window.clearTimeout(id))
      imageListeners.forEach((dispose) => dispose())
    }
  }, [articleDocument, syncFrameHeight])

  return (
    <div className="auto-post-inline-article" aria-label={title}>
      <iframe
        className="auto-post-inline-article__frame"
        ref={frameRef}
        srcDoc={articleDocument}
        style={{ height: `${frameHeight}px` }}
        title={title}
      />
    </div>
  )
}
