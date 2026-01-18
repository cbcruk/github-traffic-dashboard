import { createClient } from '@libsql/client'

export function getDbClient() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is not set')
  }

  return createClient({
    url,
    authToken,
  })
}
