/**
 * D1 helpers shared by the collector (Worker cron and local scripts) and the
 * dashboard's server functions. Nothing here touches the runtime environment,
 * so it runs under tests as-is.
 */

export type SqlValue = string | number | null

export interface Statement {
  sql: string
  args: SqlValue[]
}

/** D1 rejects a statement with more bound parameters than this. */
const MAX_BOUND_PARAMETERS = 100

interface UpsertSpec {
  table: string
  columns: string[]
  /** Columns of the unique constraint that identifies an existing row. */
  conflict: string[]
  /** Columns overwritten when the row exists. Defaults to every other column. */
  update?: string[]
  rows: SqlValue[][]
}

/**
 * Multi-row upsert, split so no statement exceeds D1's bound parameter limit.
 *
 * D1 counts every statement, batched or not, against a per-invocation query
 * limit (1000 on Workers Paid). Writing a repo's rows one statement each would
 * spend thousands on a single collection run; one statement per table keeps a
 * run in the hundreds.
 */
export function buildUpsert({
  table,
  columns,
  conflict,
  update = columns.filter((column) => !conflict.includes(column)),
  rows,
}: UpsertSpec): Statement[] {
  const rowsPerStatement = Math.floor(MAX_BOUND_PARAMETERS / columns.length)
  const placeholders = `(${columns.map(() => '?').join(', ')})`
  const assignments = update
    .map((column) => `${column} = excluded.${column}`)
    .join(', ')

  const statements: Statement[] = []
  for (let i = 0; i < rows.length; i += rowsPerStatement) {
    const chunk = rows.slice(i, i + rowsPerStatement)
    statements.push({
      sql:
        `INSERT INTO ${table} (${columns.join(', ')}) ` +
        `VALUES ${chunk.map(() => placeholders).join(', ')} ` +
        `ON CONFLICT(${conflict.join(', ')}) DO UPDATE SET ${assignments}`,
      args: chunk.flat(),
    })
  }
  return statements
}

/** Run statements as one D1 batch, which is atomic. */
export async function runBatch(
  db: D1Database,
  statements: Statement[],
): Promise<void> {
  if (statements.length === 0) return
  await db.batch(
    statements.map(({ sql, args }) => db.prepare(sql).bind(...args)),
  )
}

/**
 * Runs a query whose result the caller can live without, returning no rows on failure.
 *
 * Tables added by a schema change only exist once the collector has run
 * `migrateSchema()` against the database, so a freshly deployed Worker can
 * read before they are created. Supplementary queries go through here so that
 * one missing table degrades a section of the page instead of emptying all of
 * it.
 */
export async function allOrEmpty<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
): Promise<T[]> {
  try {
    return (await db.prepare(sql).all<T>()).results
  } catch (error) {
    console.error('Supplementary query failed:', error)
    return []
  }
}
