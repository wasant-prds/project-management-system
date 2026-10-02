const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_DECIMAL_SCALE = 1000
const MAX_DECIMAL_INPUT_LENGTH = 128
const MAX_DECIMAL_INTEGER_DIGITS = 35
const MAX_DECIMAL_FRACTION_DIGITS = 30

type DecimalParts = { units: bigint; scale: number }

function powerOfTen(exponent: number): bigint {
  let value = BigInt(1)
  for (let index = 0; index < exponent; index += 1) value *= BigInt(10)
  return value
}

function parseDecimal(value: string): DecimalParts | null {
  const match = DECIMAL_PATTERN.exec(value)
  if (!match) return null

  const sign = match[1] === '-' ? BigInt(-1) : BigInt(1)
  const whole = match[2] ?? '0'
  const fraction = match[3] ?? match[4] ?? ''
  const exponent = Number(match[5] ?? '0')
  if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_DECIMAL_SCALE) return null

  let scale = fraction.length - exponent
  if (Math.abs(scale) > MAX_DECIMAL_SCALE) return null
  let units = BigInt(`${whole}${fraction}`) * sign
  if (scale < 0) {
    units *= powerOfTen(-scale)
    scale = 0
  }
  return { units, scale }
}

function formatDecimal({ units, scale }: DecimalParts): string {
  if (units === BigInt(0)) return '0'

  const negative = units < BigInt(0)
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0')
  if (scale === 0) return `${negative ? '-' : ''}${digits}`

  const whole = digits.slice(0, -scale)
  const fraction = digits.slice(-scale).replace(/0+$/, '')
  const decimalSeparator = fraction ? `.${fraction}` : ''
  return `${negative ? '-' : ''}${whole}${decimalSeparator}`
}

function fitsTimeEntryDecimal(value: string): boolean {
  const [integer, fraction = ''] = value.split('.')
  const integerDigits = integer.replace(/^0+/, '').length
  return integerDigits <= MAX_DECIMAL_INTEGER_DIGITS && fraction.length <= MAX_DECIMAL_FRACTION_DIGITS
}

export function parsePositiveDecimalHours(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) return null

  const text = typeof value === 'string' ? value.trim() : String(value)
  if (text.length > MAX_DECIMAL_INPUT_LENGTH) return null
  const parsed = parseDecimal(text)
  if (!parsed || parsed.units <= BigInt(0)) return null
  const normalized = formatDecimal(parsed)
  return fitsTimeEntryDecimal(normalized) ? normalized : null
}

export function sumDecimalHours(values: readonly string[]): string {
  const parsed = values.map(parseDecimal)
  if (parsed.some((value) => value === null)) throw new TypeError('Hours must be valid decimal strings')

  const decimals = parsed as DecimalParts[]
  const scale = decimals.reduce((maximum, value) => Math.max(maximum, value.scale), 0)
  const units = decimals.reduce(
    (total, value) => total + value.units * powerOfTen(scale - value.scale),
    BigInt(0),
  )
  return formatDecimal({ units, scale })
}
