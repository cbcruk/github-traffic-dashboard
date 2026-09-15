import { migrateSchema } from '../src/lib/schema'
import { withLocalDb } from './local-db'

async function main(): Promise<void> {
  console.log('Initializing the local D1 database...')

  const applied = await withLocalDb((db) => migrateSchema(db))

  for (const { version, name } of applied) {
    console.log(`✓ Applied migration ${version} (${name})`)
  }
  if (applied.length === 0) console.log('✓ Schema is already up to date')
  console.log('Database initialization completed!')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
