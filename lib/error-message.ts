export function errorMessage(error: unknown, fallback: string) {
  if (typeof error !== 'object' || error === null || !('message' in error)) return fallback
  return typeof error.message === 'string' ? error.message : fallback
}
