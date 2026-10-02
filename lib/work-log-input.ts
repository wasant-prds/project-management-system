import { parsePositiveDecimalHours } from '@/lib/decimal-hours'
import { parseBangkokCalendarDate, parseBangkokDateTime, serializeBangkokCalendarDate } from '@/lib/bangkok-datetime'

export { parsePositiveDecimalHours }

type OptionalText = string | null | undefined

export type WorkLogInputError = { message: string; field?: string }
export type WorkLogInputResult<T> = { ok: true; value: T } | { ok: false; error: WorkLogInputError }

export type CreateWorkLogInput = {
  description: OptionalText
  remarks: OptionalText
  status: OptionalText
  projectId?: string
  workItemId: string
  hours: string
  date: Date
}

export type PatchWorkLogInput = {
  description?: OptionalText
  remarks?: OptionalText
  status?: OptionalText
  projectId?: string
  workItemId?: string
  hours?: string
  date?: Date
}

function invalid<T>(message: string, field?: string): WorkLogInputResult<T> {
  return { ok: false, error: { message, ...(field ? { field } : {}) } }
}

function valid<T>(value: T): WorkLogInputResult<T> {
  return { ok: true, value }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function validateOptionalTexts(body: Record<string, unknown>, fields: string[]): WorkLogInputError | null {
  for (const field of fields) {
    const value = body[field]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return { message: `${field} must be text or null`, field }
    }
  }
  return null
}

export async function parseWorkLogRequestBody(
  request: Pick<Request, 'json'>,
): Promise<WorkLogInputResult<unknown>> {
  try {
    return valid(await request.json())
  } catch {
    return invalid('Request body must be valid JSON')
  }
}

export function parseWorkLogDate(value: unknown): Date | null {
  const parsed = parseBangkokDateTime(value)
  if (!parsed) return null
  return parseBangkokCalendarDate(serializeBangkokCalendarDate(parsed))
}

export function parseCreateWorkLogInput(body: unknown, ownerId: string): WorkLogInputResult<CreateWorkLogInput> {
  if (!isRecord(body)) return invalid('Request body must be an object')

  const { description, remarks, status, projectId, workItemId, hours, date, userId } = body
  if (userId !== undefined && userId !== ownerId) return invalid('userId ต้องเป็นเจ้าของระบบ', 'userId')

  const textError = validateOptionalTexts(body, ['description', 'remarks', 'status'])
  if (textError) return { ok: false, error: textError }
  if (projectId !== undefined && !isNonEmptyString(projectId)) {
    return invalid('projectId must be a non-empty string', 'projectId')
  }
  if (!isNonEmptyString(workItemId)) return invalid('workItemId is required', 'workItemId')

  const normalizedHours = parsePositiveDecimalHours(hours)
  if (normalizedHours === null) return invalid('hours must be a positive finite decimal', 'hours')

  const workLogDate = parseWorkLogDate(date)
  if (!workLogDate) return invalid('date must be a valid Bangkok date or +07:00 timestamp', 'date')

  return valid({
    description: description as OptionalText,
    remarks: remarks as OptionalText,
    status: status as OptionalText,
    ...(typeof projectId === 'string' ? { projectId: projectId.trim() } : {}),
    workItemId: workItemId.trim(),
    hours: normalizedHours,
    date: workLogDate,
  })
}

export function parsePatchWorkLogInput(body: unknown, ownerId: string): WorkLogInputResult<PatchWorkLogInput> {
  if (!isRecord(body)) return invalid('Request body must be an object')

  const mutableFields = ['description', 'remarks', 'hours', 'date', 'projectId', 'workItemId', 'status']
  if (!Object.keys(body).some((field) => mutableFields.includes(field))) {
    return invalid('At least one Daily Work field must be provided')
  }

  const { description, remarks, status, projectId, workItemId, hours, date, userId } = body
  if (userId !== undefined && userId !== ownerId) return invalid('userId ต้องเป็นเจ้าของระบบ', 'userId')

  const textError = validateOptionalTexts(body, ['description', 'remarks', 'status'])
  if (textError) return { ok: false, error: textError }
  if (projectId !== undefined && !isNonEmptyString(projectId)) {
    return invalid('projectId must be a non-empty string', 'projectId')
  }
  if (workItemId !== undefined && !isNonEmptyString(workItemId)) {
    return invalid('workItemId must be a non-empty string', 'workItemId')
  }

  let normalizedHours: string | undefined
  if (hours !== undefined) {
    normalizedHours = parsePositiveDecimalHours(hours) ?? undefined
    if (normalizedHours === undefined) return invalid('hours must be a positive finite decimal', 'hours')
  }

  let workLogDate: Date | undefined
  if (date !== undefined) {
    workLogDate = parseWorkLogDate(date) ?? undefined
    if (!workLogDate) return invalid('date must be a valid Bangkok date or +07:00 timestamp', 'date')
  }

  return valid({
    ...(description !== undefined ? { description: description as OptionalText } : {}),
    ...(remarks !== undefined ? { remarks: remarks as OptionalText } : {}),
    ...(status !== undefined ? { status: status as OptionalText } : {}),
    ...(typeof projectId === 'string' ? { projectId: projectId.trim() } : {}),
    ...(typeof workItemId === 'string' ? { workItemId: workItemId.trim() } : {}),
    ...(normalizedHours !== undefined ? { hours: normalizedHours } : {}),
    ...(workLogDate !== undefined ? { date: workLogDate } : {}),
  })
}
