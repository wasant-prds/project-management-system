// Share only pending reads. Mutation callers request a fresh chain; no results are retained.
const pendingCollections = new Map<string, Promise<unknown[]>>()

export function fetchCollection<T>(path: string, key: string, options: { fresh?: boolean } = {}): Promise<T[]> {
  const url = new URL(path, window.location.origin)
  if (url.origin !== window.location.origin) return Promise.reject(new Error('Invalid collection origin'))
  url.searchParams.set('limit', '200')
  url.searchParams.sort()
  const identity = `${key}:${url.href}`
  const pending = pendingCollections.get(identity)
  if (pending && !options.fresh) return pending as Promise<T[]>
  // A mutation starts a new read. An older completion must not evict that read.
  const request = readCollection<T>(url.href, key).finally(() => {
    if (pendingCollections.get(identity) === request) pendingCollections.delete(identity)
  })
  pendingCollections.set(identity, request)
  return request
}

async function readCollection<T>(path: string, key: string): Promise<T[]> {
  const items: T[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  do {
    const url = new URL(path, window.location.origin)
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)
    const response = await fetch(url, { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? 'โหลดข้อมูลไม่สำเร็จ')
    if (!Array.isArray(result[key]) || !result.page || (result.page.nextCursor !== null && typeof result.page.nextCursor !== 'string')) {
      throw new Error('ข้อมูลจาก server ไม่ถูกต้อง กรุณาลองใหม่')
    }
    items.push(...result[key])
    cursor = result.page.nextCursor
    if (cursor) {
      if (seen.has(cursor)) throw new Error('ไม่สามารถอ่านหน้าข้อมูลถัดไปได้ กรุณาลองใหม่')
      seen.add(cursor)
    }
  } while (cursor)
  return items
}
