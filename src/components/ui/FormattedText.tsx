import type { ReactNode } from 'react'

function compactSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function parseInline(text: string, keyPrefix: string) {
  const parts: ReactNode[] = []
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[2]) {
      parts.push(
        <strong key={`${keyPrefix}-strong-${match.index}`}>
          {match[2]}
        </strong>,
      )
    } else if (match[3]) {
      parts.push(
        <code key={`${keyPrefix}-code-${match.index}`}>
          {match[3]}
        </code>,
      )
    } else if (match[4] && match[5]) {
      parts.push(
        <a
          key={`${keyPrefix}-link-${match.index}`}
          href={match[5]}
          rel="noreferrer"
          target="_blank"
        >
          {match[4]}
        </a>,
      )
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'unordered'; items: string[] }
  | { type: 'ordered'; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'pre'; text: string }

function parseBlocks(input: string): Block[] {
  const text = String(input ?? '').replace(/\r/g, '').trim()
  if (!text) {
    return []
  }

  const lines = text.split('\n')
  const blocks: Block[] = []
  const paragraph: string[] = []
  let unordered: string[] = []
  let ordered: string[] = []
  let pre: string[] = []
  let inCode = false
  let codeBuffer: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    const textValue = compactSpaces(paragraph.join(' '))
    if (textValue) {
      blocks.push({ type: 'paragraph', text: textValue })
    }
    paragraph.length = 0
  }

  const flushLists = () => {
    if (unordered.length) {
      blocks.push({ type: 'unordered', items: unordered })
      unordered = []
    }
    if (ordered.length) {
      blocks.push({ type: 'ordered', items: ordered })
      ordered = []
    }
  }

  const flushPre = () => {
    if (pre.length) {
      blocks.push({ type: 'pre', text: pre.join('\n') })
      pre = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushParagraph()
      flushLists()
      flushPre()
      if (inCode) {
        blocks.push({ type: 'code', text: codeBuffer.join('\n') })
        codeBuffer = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }

    if (inCode) {
      codeBuffer.push(line)
      continue
    }

    if (!trimmed) {
      flushParagraph()
      flushLists()
      flushPre()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      flushLists()
      flushPre()
      blocks.push({
        type: 'heading',
        level: Math.min(headingMatch[1].length, 3) as 1 | 2 | 3,
        text: compactSpaces(headingMatch[2]),
      })
      continue
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/)
    if (unorderedMatch) {
      flushParagraph()
      flushPre()
      if (ordered.length) {
        flushLists()
      }
      unordered.push(compactSpaces(unorderedMatch[1]))
      continue
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/)
    if (orderedMatch) {
      flushParagraph()
      flushPre()
      if (unordered.length) {
        flushLists()
      }
      ordered.push(compactSpaces(orderedMatch[1]))
      continue
    }

    if ((trimmed.match(/\|/g) ?? []).length >= 2) {
      flushParagraph()
      flushLists()
      pre.push(trimmed)
      continue
    }

    paragraph.push(trimmed)
  }

  if (inCode && codeBuffer.length) {
    blocks.push({ type: 'code', text: codeBuffer.join('\n') })
  }

  flushParagraph()
  flushLists()
  flushPre()
  return blocks
}

export function FormattedText({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const blocks = parseBlocks(text)

  if (!blocks.length) {
    return null
  }

  return (
    <div className={`ui-formatted ${className}`.trim()}>
      {blocks.map((block, index) => {
        const key = `block-${index}`

        switch (block.type) {
          case 'heading': {
            const HeadingTag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5'
            return <HeadingTag key={key}>{parseInline(block.text, key)}</HeadingTag>
          }
          case 'unordered':
            return (
              <ul key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{parseInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ul>
            )
          case 'ordered':
            return (
              <ol key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{parseInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ol>
            )
          case 'code':
            return <pre key={key}>{block.text}</pre>
          case 'pre':
            return <pre key={key}>{block.text}</pre>
          case 'paragraph':
          default:
            return <p key={key}>{parseInline(block.text, key)}</p>
        }
      })}
    </div>
  )
}
