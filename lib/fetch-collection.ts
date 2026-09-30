export async function fetchCollection<T>(path: string, key: string): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  do {
    const url = new URL(path, window.location.origin)
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)
    const response = await fetch(url)
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? 'โหลดข้อมูลไม่สำเร็จ')
    items.push(...result[key])
    cursor = result.page.nextCursor
  } while (cursor)
  return items
}
