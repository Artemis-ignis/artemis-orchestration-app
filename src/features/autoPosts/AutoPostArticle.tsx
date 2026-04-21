import { useMemo } from 'react'

function extractBody(html: string) {
  if (typeof window === 'undefined') {
    return { styles: '', body: html }
  }

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const styles = Array.from(doc.querySelectorAll('style'))
    .map((node) => node.textContent || '')
    .join('\n')

  const body = doc.body?.innerHTML?.trim() || html

  return { styles, body }
}

export function AutoPostArticle({
  html,
  title,
}: {
  html: string
  title: string
}) {
  const article = useMemo(() => extractBody(html), [html])

  return (
    <div className="auto-post-inline-article" aria-label={title}>
      {article.styles ? <style>{article.styles}</style> : null}
      <div dangerouslySetInnerHTML={{ __html: article.body }} />
    </div>
  )
}
