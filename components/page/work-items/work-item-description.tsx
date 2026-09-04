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
  | { type: 'table'; headers: string[]; rows: string[][]; aligns: Array<'left' | 'center' | 'right'> }

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

function splitTableCells(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|').map((cell) => cell.trim())
}

function isSeparatorCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim())
}

function isSeparatorLine(line: string): boolean {
  const cells = splitTableCells(line)
  return cells.length > 0 && cells.every(isSeparatorCell)
}

function isTableRowLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return false
  if (isAtHeading(trimmed, 0)) return false
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return false
  return !isAtNumbered(trimmed, 0)
}

function parseAlign(cell: string | undefined): 'left' | 'center' | 'right' {
  const trimmed = cell?.trim() ?? ''
  const left = trimmed.startsWith(':')
  const right = trimmed.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  return 'left'
}

function consumeTable(
  lines: string[],
  start: number,
): { block: Extract<Block, { type: 'table' }>; end: number } | null {
  const headerLine = lines[start]
  const separatorLine = lines[start + 1]
  if (!headerLine || !separatorLine) return null
  if (!isTableRowLine(headerLine) || !isSeparatorLine(separatorLine)) return null

  const headers = splitTableCells(headerLine)
  if (headers.length === 0) return null

  const separatorCells = splitTableCells(separatorLine)
  const aligns = headers.map((_, index) => parseAlign(separatorCells[index]))
  const rows: string[][] = []
  let cursor = start + 2

  while (cursor < lines.length && isTableRowLine(lines[cursor]) && !isSeparatorLine(lines[cursor])) {
    const cells = splitTableCells(lines[cursor])
    rows.push(headers.map((_, index) => cells[index] ?? ''))
    cursor += 1
  }

  return { block: { type: 'table', headers, rows, aligns }, end: cursor }
}

function parseBlocks(markdown: string): Block[] {
  const lines = normalizeMarkdown(markdown).split('\n')
  const blocks: Block[] = []
  const paragraph: string[] = []
  const lists: { ul: string[] | null; ol: string[] | null } = { ul: null, ol: null }

  const flush = () => {
    pushParagraph(blocks, paragraph)
    pushList(blocks, 'ul', lists.ul)
    pushList(blocks, 'ol', lists.ol)
    lists.ul = null
    lists.ol = null
  }

  let index = 0
  while (index < lines.length) {
    const table = consumeTable(lines, index)
    if (table) {
      flush()
      blocks.push(table.block)
      index = table.end
      continue
    }

    const line = classifyLine(lines[index])
    index += 1

    if (line.kind === 'empty' || line.kind === 'heading') {
      flush()
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

  flush()
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

const TABLE_ALIGN = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

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

        if (block.type === 'table') {
          return (
            <div key={key} className="max-w-full overflow-x-auto">
              <table className="w-max min-w-full border-collapse text-sm text-foreground">
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th
                        key={`${key}-h${headerIndex}`}
                        className={cn(
                          'border border-border bg-muted px-2.5 py-1.5 font-semibold',
                          TABLE_ALIGN[block.aligns[headerIndex] ?? 'left'],
                        )}
                      >
                        {renderInline(header, `${key}-h${headerIndex}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${key}-r${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${key}-r${rowIndex}-c${cellIndex}`}
                          className={cn(
                            'border border-border px-2.5 py-1.5 align-top',
                            TABLE_ALIGN[block.aligns[cellIndex] ?? 'left'],
                          )}
                        >
                          {renderInline(cell, `${key}-r${rowIndex}-c${cellIndex}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        return <p key={key}>{renderInline(block.text, key)}</p>
      })}
    </div>
  )
}
