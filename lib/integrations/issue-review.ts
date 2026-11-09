import { issueTitleParts } from './issue-content'

export type IssueReviewCandidate = {
  id: string
  title: string
  description: string | null
  similarity: number
}
export type IssueReviewDecision = { issueId: string; workItemId: string | null }
export type IssueReviewGroup = {
  configId: string
  sourceProject: string
  runId: string
  issues: Array<{ issueId: string; title: string; sourceUrl: string; candidates: IssueReviewCandidate[] }>
}

// Multiset Dice similarity over Unicode character bigrams works without language-specific word splitting.
export function issueTitleSimilarity(left: string, right: string): number {
  const characters = (title: string) =>
    Array.from(
      issueTitleParts(title)
        .stem.normalize('NFC')
        .toLowerCase()
        .replace(/[\p{P}\p{Z}\s]+/gu, ' ')
        .trim(),
    )
  const a = characters(left),
    b = characters(right)
  if (!a.length || !b.length) return 0
  if (a.join('') === b.join('')) return 1
  if (a.length < 2 || b.length < 2) return 0
  const pairs = new Map<string, number>()
  for (let index = 1; index < a.length; index++) {
    const pair = a[index - 1] + a[index]
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
  }
  let overlap = 0
  for (let index = 1; index < b.length; index++) {
    const pair = b[index - 1] + b[index],
      count = pairs.get(pair) ?? 0
    if (count) {
      overlap++
      pairs.set(pair, count - 1)
    }
  }
  return (2 * overlap) / (a.length + b.length - 2)
}
