import { createClient } from '@libsql/client'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'data', 'traffic.db')

async function main(): Promise<void> {
  console.log(`Initializing database at ${DB_PATH}...`)

  const client = createClient({
    url: `file:${DB_PATH}`,
  })

  await client.execute(`
    CREATE TABLE IF NOT EXISTS daily_traffic (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo TEXT NOT NULL,
      date TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      visitors INTEGER NOT NULL DEFAULT 0,
      clones INTEGER NOT NULL DEFAULT 0,
      clone_uniques INTEGER NOT NULL DEFAULT 0,
      UNIQUE(repo, date)
    )
  `)
  console.log('✓ Created daily_traffic table')

  await client.execute(`
    CREATE TABLE IF NOT EXISTS referrers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo TEXT NOT NULL,
      date TEXT NOT NULL,
      referrer TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      uniques INTEGER NOT NULL DEFAULT 0,
      UNIQUE(repo, date, referrer)
    )
  `)
  console.log('✓ Created referrers table')

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_daily_traffic_repo_date
    ON daily_traffic(repo, date)
  `)
  console.log('✓ Created index on daily_traffic')

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_referrers_repo_date
    ON referrers(repo, date)
  `)
  console.log('✓ Created index on referrers')

  console.log('Database initialization completed!')
}

main().catch(console.error)
