import 'dotenv/config'
import { getDbClient } from '../src/lib/db'
import { SCHEMA_STATEMENTS, migrateSchema } from '../src/lib/schema'

async function main(): Promise<void> {
  console.log('Initializing Turso database...')

  const client = getDbClient()
  await migrateSchema(client)

  console.log(`✓ Applied ${SCHEMA_STATEMENTS.length} schema statements`)
  console.log('Database initialization completed!')
}

main().catch(console.error)
