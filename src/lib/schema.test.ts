import { afterEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, migrateSchema, type Migration } from './schema'
import { createTestDb } from './test-d1'

async function columnsOf(db: D1Database, table: string) {
  const { results } = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all<{ name: string }>()
  return results.map((row) => row.name)
}

async function tablesOf(db: D1Database) {
  const { results } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all<{ name: string }>()
  return results.map((row) => row.name)
}

async function recordedVersions(db: D1Database) {
  const { results } = await db
    .prepare(`SELECT version FROM schema_migrations ORDER BY version`)
    .all<{ version: number }>()
  return results.map((row) => row.version)
}

const latest = MIGRATIONS.map((m) => m.version)

describe('MIGRATIONS', () => {
  it('numbers versions consecutively from 1', () => {
    expect(latest).toEqual(MIGRATIONS.map((_, i) => i + 1))
  })
})

describe('migrateSchema', () => {
  let dispose: (() => Promise<void>) | undefined

  afterEach(async () => {
    await dispose?.()
    dispose = undefined
  })

  async function freshDb() {
    const test = await createTestDb()
    dispose = test.dispose
    return test.db
  }

  it('creates the whole schema in an empty database and records every version', async () => {
    const db = await freshDb()

    const applied = await migrateSchema(db)

    expect(applied.map((m) => m.version)).toEqual(latest)
    expect(await recordedVersions(db)).toEqual(latest)
    expect(await tablesOf(db)).toEqual(
      expect.arrayContaining([
        'daily_traffic',
        'referrers',
        'popular_paths',
        'traffic_totals',
        'repositories',
        'collection_runs',
      ]),
    )
    expect(await columnsOf(db, 'repositories')).toContain('private')
  })

  it('does nothing once the schema is current', async () => {
    const db = await freshDb()

    await migrateSchema(db)
    const applied = await migrateSchema(db)

    expect(applied).toEqual([])
    expect(await recordedVersions(db)).toEqual(latest)
  })

  it('adds `private` to a repositories table created before it existed', async () => {
    const db = await freshDb()
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

  it('adopts a current schema created before versioning without touching its rows', async () => {
    const db = await freshDb()
    // A database imported from Turso: every table exists, nothing is recorded.
    for (const sql of await MIGRATIONS[0].up(db)) {
      await db.prepare(sql).run()
    }
    await db
      .prepare(
        `INSERT INTO repositories VALUES ('me/app', '2026-01-01', '2026-09-15', 0)`,
      )
      .run()

    await migrateSchema(db)

    expect(await recordedVersions(db)).toEqual(latest)
    expect(
      await db.prepare(`SELECT COUNT(*) AS n FROM repositories`).first('n'),
    ).toBe(1)
  })

  it('lets concurrent runs finish without applying a version twice', async () => {
    const db = await freshDb()

    await Promise.all([migrateSchema(db), migrateSchema(db), migrateSchema(db)])

    expect(await recordedVersions(db)).toEqual(latest)
  })

  it('rolls back a failing migration and leaves it pending', async () => {
    const db = await freshDb()
    const broken: Migration[] = [
      ...MIGRATIONS,
      {
        version: MIGRATIONS.length + 1,
        name: 'broken',
        up: () => [
          `CREATE TABLE half_done (id INTEGER)`,
          `ALTER TABLE missing_table ADD COLUMN x INTEGER`,
        ],
      },
    ]

    await expect(migrateSchema(db, broken)).rejects.toThrow(
      /Migration \d+ \(broken\) failed/,
    )

    expect(await tablesOf(db)).not.toContain('half_done')
    expect(await recordedVersions(db)).toEqual(latest)
  })
})
