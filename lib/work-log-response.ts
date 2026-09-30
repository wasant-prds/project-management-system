type WorkLogsResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

type ApiError = { code?: unknown; message?: unknown }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorDetails(status: number, payload: unknown) {
  const error = record(payload) && record(payload.error) ? payload.error as ApiError : {}
  if (status === 401 || error.code === 'OWNER_UNAUTHENTICATED') {
    return { title: 'Authentication required', message: 'Owner access is required. Please authenticate and try again.' }
  }
  if (status === 403 || error.code === 'ACCESS_DENIED') {
    return { title: 'Access denied', message: 'You do not have access to these work logs.' }
  }
  return { title: 'Error', message: 'Failed to fetch work logs. Please try again.' }
}

export async function readWorkLogsResponse<T>(response: WorkLogsResponse): Promise<{
  workLogs: T[]
  error: { title: string; message: string } | null
}> {
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Use a safe, stable message when the server response is not JSON.
  }

  if (!response.ok) {
    return { workLogs: [] as T[], error: errorDetails(response.status, payload) }
  }

  const workLogs = record(payload) && Array.isArray(payload.workLogs)
    ? payload.workLogs as T[]
    : [] as T[]
  return { workLogs, error: null }
}
