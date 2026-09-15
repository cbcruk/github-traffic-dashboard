import { SCHEMA_STATEMENTS, migrateSchema } from '../src/lib/schema'
import { withLocalDb } from './local-db'

async function main(): Promise<void> {
  console.log('Initializing the local D1 database...')

  await withLocalDb(migrateSchema)

  console.log(`✓ Applied ${SCHEMA_STATEMENTS.length} schema statements`)
  console.log('Database initialization completed!')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
