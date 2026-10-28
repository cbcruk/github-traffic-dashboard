import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getPlatformProxy } from 'wrangler'
import { migrateSchema } from '../src/lib/schema'

/**
 * Write the empty, fully migrated schema to `db/schema.sqlite` (`pnpm db:schema`).
 *
 * Reylo types the `.sql` queries in src/queries by preparing them against a
 * real database, at type check and at build time. Workers Builds has no
 * database, so the schema is committed as this file. It holds no data.
 *
 * The migrations run through wrangler's D1 emulation, as they do in the Worker,
 * so the file matches what a deployment ends up with. Run this after adding a
 * migration; a test fails while the file is stale.
 */

export const SCHEMA_DB_PATH = 'db/schema.sqlite'

/** The D1 database file; miniflare keeps a `metadata.sqlite` beside it. */
async function findDatabaseFile(persist: string): Promise<string> {
  const files = await readdir(persist, { recursive: true })
  const file = files.find(
    (path) =>
      path.includes('miniflare-D1DatabaseObject') &&
      path.endsWith('.sqlite') &&
      !path.endsWith('metadata.sqlite'),
  )
  if (!file) throw new Error(`No D1 database file under ${persist}`)
  return join(persist, file)
}

async function main(): Promise<void> {
  const persist = await mkdtemp(join(tmpdir(), 'schema-db-'))
  try {
    const proxy = await getPlatformProxy<{ DB: D1Database }>({
      persist: { path: persist },
    })
    try {
      await migrateSchema(proxy.env.DB)
    } finally {
      await proxy.dispose()
    }

    // Miniflare leaves recent writes in the WAL file beside the database.
    // Opening it reads them, and VACUUM INTO writes one self-contained file
    // without free pages, which only changes when the schema does.
    await rm(SCHEMA_DB_PATH, { force: true })
    const db = new DatabaseSync(await findDatabaseFile(persist))
    db.prepare('VACUUM INTO ?').run(SCHEMA_DB_PATH)
    db.close()
    // Applied-at times would change the file on every run.
    const out = new DatabaseSync(SCHEMA_DB_PATH)
    out.exec(`UPDATE schema_migrations SET applied_at = ''; VACUUM;`)
    out.close()
  } finally {
    await rm(persist, { recursive: true, force: true })
  }
  console.log(`Wrote the schema to ${SCHEMA_DB_PATH}.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
