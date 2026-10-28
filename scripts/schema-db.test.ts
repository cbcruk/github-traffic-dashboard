import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrateSchema } from '../src/lib/schema'
import { createTestDb } from '../src/lib/test-d1'

const SCHEMA_SQL = `SELECT type, name, sql FROM sqlite_master
  WHERE name NOT LIKE 'sqlite_%' AND name != '_cf_METADATA'
  ORDER BY type, name`

describe('db/schema.sqlite', () => {
  it('matches the migrations; run `pnpm db:schema` if not', async () => {
    const { db, dispose } = await createTestDb()
    try {
      await migrateSchema(db)
      const { results: migrated } = await db.prepare(SCHEMA_SQL).all()

      const file = new DatabaseSync('db/schema.sqlite', { readOnly: true })
      const committed = file.prepare(SCHEMA_SQL).all()
      file.close()

      expect(committed.map((row) => ({ ...row }))).toEqual(migrated)
    } finally {
      await dispose()
    }
  })
})
