import { createClient } from '@libsql/client/web'

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
