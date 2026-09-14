import {
  createClient,
  type Client,
  type InStatement,
  type Row,
} from '@libsql/client/web'

export interface DbConfig {
  url?: string
  authToken?: string
}

export function getDbClient(config: DbConfig = {}) {
  const url = config.url ?? process.env.TURSO_DATABASE_URL
  const authToken = config.authToken ?? process.env.TURSO_AUTH_TOKEN

  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is not set')
  }

  return createClient({
    url,
    authToken,
  })
}

/**
 * Runs a query whose result the caller can live without, returning no rows on failure.
 *
 * Tables added by a schema change only exist once the collector has run
 * `migrate()` against the database, so a freshly deployed Worker can read
 * before they are created. Supplementary queries go through here so that one
 * missing table degrades a section of the page instead of emptying all of it.
 */
export async function executeOrEmpty(
  client: Client,
  statement: InStatement,
): Promise<Row[]> {
  try {
    return (await client.execute(statement)).rows
  } catch (error) {
    console.error('Supplementary query failed:', error)
    return []
  }
}
