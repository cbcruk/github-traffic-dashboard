import 'dotenv/config'
import { getDbClient } from '../src/lib/db'
import { SCHEMA_STATEMENTS } from '../src/lib/schema'

async function main(): Promise<void> {
  console.log('Initializing Turso database...')

  const client = getDbClient()
  await client.migrate(SCHEMA_STATEMENTS)

  console.log(`✓ Applied ${SCHEMA_STATEMENTS.length} schema statements`)
  console.log('Database initialization completed!')
}

main().catch(console.error)
