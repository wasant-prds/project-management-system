export const ISSUE_SYNC_STREAM_TYPE = 'application/x-ndjson'
export type IssueSyncPhase = 'connecting' | 'syncing' | 'checking' | 'finalizing' | 'complete'
export type IssueSyncProgress = {
  phase: IssueSyncPhase
  processed: number
  counts: { created: number; updated: number; skipped: number; failed: number; pending: number }
}
export type IssueSyncEvent<T> =
  | { type: 'progress'; progress: IssueSyncProgress }
  | { type: 'result'; run: T }
  | { type: 'error'; error: { code: string; message: string } }

export async function streamIssueSync<T>(
  url: string,
  approveFirstSync: boolean,
  onProgress: (progress: IssueSyncProgress) => void,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: ISSUE_SYNC_STREAM_TYPE },
    body: JSON.stringify({ approveFirstSync }),
  })
  if (!response.ok) {
    const payload = await response.json()
    throw new Error(payload.error?.message || 'Sync ไม่สำเร็จ')
  }
  // Retain compatibility with deployments/proxies returning the existing JSON response.
  if (response.headers?.get('content-type')?.split(';')[0] !== ISSUE_SYNC_STREAM_TYPE)
    return (await response.json()).run as T
  if (!response.body) throw new Error('ไม่พบข้อมูลความคืบหน้าของ Sync')
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let pending = '',
    result: T | undefined
  function consume(line: string) {
    if (!line.trim()) return
    let event: IssueSyncEvent<T>
    try {
      event = JSON.parse(line) as IssueSyncEvent<T>
    } catch {
      throw new Error('รูปแบบข้อมูลความคืบหน้าไม่ถูกต้อง')
    }
    if (event.type === 'progress') onProgress(event.progress)
    else if (event.type === 'result') result = event.run
    else if (event.type === 'error') throw new Error(event.error.message)
    else throw new Error('รูปแบบข้อมูลความคืบหน้าไม่ถูกต้อง')
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      pending += decoder.decode(value, { stream: !done })
      let newline: number
      while ((newline = pending.indexOf('\n')) !== -1) {
        consume(pending.slice(0, newline))
        pending = pending.slice(newline + 1)
      }
      if (done) break
    }
    consume(pending)
    if (result === undefined) throw new Error('การเชื่อมต่อ Sync สิ้นสุดก่อนส่งผลสรุป กรุณาตรวจประวัติ Sync')
    return result
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
