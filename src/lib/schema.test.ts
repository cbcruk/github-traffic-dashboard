import { afterEach, describe, expect, it } from 'vitest'
import { migrateSchema } from './schema'
import { createTestDb } from './test-d1'

async function columnsOf(db: D1Database, table: string) {
  const { results } = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all<{ name: string }>()
  return results.map((row) => row.name)
}

describe('migrateSchema', () => {
  let dispose: (() => Promise<void>) | undefined

  afterEach(async () => {
    await dispose?.()
  })

  it('adds `private` to a repositories table created before it existed', async () => {
    const test = await createTestDb()
    dispose = test.dispose
    const { db } = test

    await db.batch([
      db.prepare(`
        CREATE TABLE repositories (
          repo TEXT PRIMARY KEY,
          first_seen TEXT NOT NULL,
          last_seen TEXT NOT NULL
        )
      `),
      db.prepare(
        `INSERT INTO repositories VALUES ('me/secret', '2026-09-01', '2026-09-01')`,
      ),
    ])

    await migrateSchema(db)

    expect(await columnsOf(db, 'repositories')).toContain('private')
    // Unknown visibility stays NULL, which readers treat as private.
    expect(
      await db.prepare(`SELECT private FROM repositories`).first('private'),
    ).toBeNull()
  })

  it('is safe to run repeatedly', async () => {
    const test = await createTestDb()
    dispose = test.dispose

    await migrateSchema(test.db)
    await migrateSchema(test.db)

    const columns = await columnsOf(test.db, 'repositories')
    expect(columns.filter((name) => name === 'private')).toHaveLength(1)
  })
})
