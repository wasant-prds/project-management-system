const SQL_FRAGMENT = Symbol('sql-fragment')
export type Sql = {
  readonly text: string
  readonly values: readonly unknown[]
  readonly [SQL_FRAGMENT]: true
}
const statement = (text: string, values: readonly unknown[]): Sql =>
  Object.freeze({ text, values: Object.freeze([...values]), [SQL_FRAGMENT]: true as const })
function fragment(value: unknown): value is Sql {
  return typeof value === 'object' && value !== null && SQL_FRAGMENT in value && value[SQL_FRAGMENT] === true
}

/** Interpolations are parameters; nested fragments retain parameter numbering. */
export function sql(parts: TemplateStringsArray, ...values: unknown[]): Sql {
  let text = parts[0]
  const parameters: unknown[] = []
  values.forEach((value, index) => {
    if (fragment(value)) {
      const offset = parameters.length
      text += value.text.replace(/\$(\d+)/g, (_, number: string) => `$${Number(number) + offset}`)
      parameters.push(...value.values)
    } else {
      parameters.push(value)
      text += `$${parameters.length}`
    }
    text += parts[index + 1]
  })
  return statement(text, parameters)
}

/** Only compile-time SQL syntax belongs here. Bind all external values with sql. */
export const syntax = (text: string): Sql => statement(text, [])
export function joinSql(parts: readonly Sql[], separator = ', '): Sql {
  return parts.reduce(
    (result, part, index) => sql`${result}${index ? syntax(separator) : syntax('')}${part}`,
    syntax(''),
  )
}
export const and = (...parts: Array<Sql | null | undefined | false>): Sql => {
  const clauses = parts.filter((part): part is Sql => Boolean(part))
  return clauses.length ? sql`(${joinSql(clauses, ') AND (')})` : syntax('TRUE')
}
export const or = (...parts: Array<Sql | null | undefined | false>): Sql => {
  const clauses = parts.filter((part): part is Sql => Boolean(part))
  return clauses.length ? sql`(${joinSql(clauses, ') OR (')})` : syntax('FALSE')
}
export function identifier(name: string): Sql {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid SQL identifier')
  return syntax(`"${name}"`)
}
export function literalContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}
