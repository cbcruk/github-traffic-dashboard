import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { createClient, type Value } from '@libsql/client'
import { SCHEMA_STATEMENTS } from '../src/lib/schema'

/**
 * One-time export of a Turso database into a SQL file D1 can import.
 *
 * Only for deployments that collected into Turso before the move to D1. GitHub
 * keeps traffic for 14 days, so history older than that exists nowhere else.
 *
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... pnpm db:export-turso
 *   npx wrangler d1 execute github-traffic-dashboard --remote --file=turso-export.sql
 *
 * The file starts with the current schema, so it can be imported into an empty
 * database, and rows keep their original ids.
 */

const TABLES = [
  'repositories',
  'daily_traffic',
  'traffic_totals',
  'referrers',
  'popular_paths',
  'collection_runs',
]

/** Stay well under D1's 100 KB statement limit. */
const MAX_STATEMENT_BYTES = 50_000

function literal(value: Value): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`
  throw new Error(`Unsupported column value: ${typeof value}`)
}

async function main(): Promise<void> {
  const url = process.env.TURSO_DATABASE_URL
  if (!url) throw new Error('TURSO_DATABASE_URL is not set')

  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  const output = process.argv[2] ?? 'turso-export.sql'
  const lines = SCHEMA_STATEMENTS.map((sql) => `${sql};`)

  for (const table of TABLES) {
    let result
    try {
      result = await client.execute(`SELECT * FROM ${table}`)
    } catch {
      console.log(`- ${table}: not found, skipped`)
      continue
    }

    const prefix = `INSERT INTO ${table} (${result.columns.join(', ')}) VALUES `
    let values: string[] = []
    let bytes = Buffer.byteLength(prefix)

    const flush = () => {
      if (values.length === 0) return
      lines.push(`${prefix}${values.join(', ')};`)
      values = []
      bytes = Buffer.byteLength(prefix)
    }

    for (const row of result.rows) {
      const tuple = `(${result.columns.map((_, i) => literal(row[i])).join(', ')})`
      const tupleBytes = Buffer.byteLength(tuple) + 2
      if (bytes + tupleBytes > MAX_STATEMENT_BYTES) flush()
      values.push(tuple)
      bytes += tupleBytes
    }
    flush()

    console.log(`✓ ${table}: ${result.rows.length} rows`)
  }

  client.close()
  await writeFile(output, lines.join('\n') + '\n')
  console.log(`Wrote ${output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
