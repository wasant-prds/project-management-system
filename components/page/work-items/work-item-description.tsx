import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type WorkItemDescriptionProps = {
  text: string
  className?: string
}

type Block =
  | { type: 'heading'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'paragraph'; text: string }

type LineKind =
  | { kind: 'empty' }
  | { kind: 'heading'; text: string }
  | { kind: 'ul'; text: string }
  | { kind: 'ol'; text: string }
  | { kind: 'text'; text: string }

function isSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t'
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9'
}

function isAtHeading(source: string, index: number): boolean {
  let count = 0
  while (index + count < source.length && count < 6 && source[index + count] === '#') {
    count += 1
  }
  return count > 0 && isSpace(source[index + count])
}

function isAtNumbered(source: string, index: number): boolean {
  if (!isDigit(source[index])) return false
  let cursor = index
  while (isDigit(source[cursor])) cursor += 1
  return source[cursor] === '.' && isSpace(source[cursor + 1])
}

function normalizeMarkdown(text: string): string {
  const source = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  let output = ''

  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index]
    if (ch === '\n') {
      output += '\n'
      continue
    }

    const canBreak = isSpace(ch) && output.length > 0 && !output.endsWith('\n')
    if (canBreak && isAtHeading(source, index + 1)) {
      output += '\n\n'
      continue
    }
    if (canBreak && isAtNumbered(source, index + 1)) {
      output += '\n'
      continue
    }

    output += ch
  }

  return output.trim()
}

function classifyLine(line: string): LineKind {
  const trimmed = line.trim()
  if (!trimmed) return { kind: 'empty' }

  if (isAtHeading(trimmed, 0)) {
    let hashes = 0
    while (trimmed[hashes] === '#') hashes += 1
    return { kind: 'heading', text: trimmed.slice(hashes).trim() }
  }

  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    return { kind: 'ul', text: trimmed.slice(2).trim() }
  }

  if (isAtNumbered(trimmed, 0)) {
    const dot = trimmed.indexOf('.')
    return { kind: 'ol', text: trimmed.slice(dot + 1).trim() }
  }

  return { kind: 'text', text: trimmed }
}

function pushParagraph(blocks: Block[], paragraph: string[]) {
  const text = paragraph.join(' ').trim()
  if (text) blocks.push({ type: 'paragraph', text })
  paragraph.length = 0
}

function pushList(blocks: Block[], type: 'ul' | 'ol', items: string[] | null) {
  if (items?.length) blocks.push({ type, items })
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  const paragraph: string[] = []
  const lists: { ul: string[] | null; ol: string[] | null } = { ul: null, ol: null }

  for (const raw of normalizeMarkdown(markdown).split('\n')) {
    const line = classifyLine(raw)

    if (line.kind === 'empty' || line.kind === 'heading') {
      pushParagraph(blocks, paragraph)
      pushList(blocks, 'ul', lists.ul)
      pushList(blocks, 'ol', lists.ol)
      lists.ul = null
      lists.ol = null
      if (line.kind === 'heading') blocks.push({ type: 'heading', text: line.text })
      continue
    }

    if (line.kind === 'ul') {
      pushParagraph(blocks, paragraph)
      pushList(blocks, 'ol', lists.ol)
      lists.ol = null
      lists.ul = lists.ul ?? []
      lists.ul.push(line.text)
      continue
    }

    if (line.kind === 'ol') {
      pushParagraph(blocks, paragraph)
      pushList(blocks, 'ul', lists.ul)
      lists.ul = null
      lists.ol = lists.ol ?? []
      lists.ol.push(line.text)
      continue
    }

    const currentList = lists.ul ?? lists.ol
    if (currentList) {
      currentList[currentList.length - 1] += ` ${line.text}`
      continue
    }

    paragraph.push(line.text)
  }

  pushParagraph(blocks, paragraph)
  pushList(blocks, 'ul', lists.ul)
  pushList(blocks, 'ol', lists.ol)
  return blocks
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let lastIndex = 0
  let match = pattern.exec(text)
  let index = 0

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b${index}`} className="font-semibold text-foreground">
          {renderInline(match[1], `${keyPrefix}-b${index}`)}
        </strong>,
      )
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c${index}`}
          className="rounded bg-background/80 px-1 py-0.5 font-mono text-[0.8125em] text-foreground"
        >
          {match[2]}
        </code>,
      )
    }

    index += 1
    lastIndex = match.index + match[0].length
    match = pattern.exec(text)
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

export function WorkItemDescription({ text, className }: Readonly<WorkItemDescriptionProps>) {
  const blocks = parseBlocks(text)
  if (blocks.length === 0) return null

  return (
    <div
      className={cn(
        'space-y-2 break-words rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground',
        className,
      )}
    >
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`

        if (block.type === 'heading') {
          return (
            <h4 key={key} className="pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
              {renderInline(block.text, key)}
            </h4>
          )
        }

        if (block.type === 'ul') {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ul>
          )
        }

        if (block.type === 'ol') {
          return (
            <ol key={key} className="list-decimal space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ol>
          )
        }

        return <p key={key}>{renderInline(block.text, key)}</p>
      })}
    </div>
  )
}
