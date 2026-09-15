import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { migrateSchema } from './schema'

async function columnsOf(
  client: ReturnType<typeof createClient>,
  table: string,
) {
  const { rows } = await client.execute(`PRAGMA table_info(${table})`)
  return rows.map((row) => row.name)
}

describe('migrateSchema', () => {
  it('adds `private` to a repositories table created before it existed', async () => {
    const client = createClient({ url: ':memory:' })
    await client.execute(`
      CREATE TABLE repositories (
        repo TEXT PRIMARY KEY,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL
      )
    `)
    await client.execute(
      `INSERT INTO repositories VALUES ('me/secret', '2026-09-01', '2026-09-01')`,
    )

    await migrateSchema(client)

    expect(await columnsOf(client, 'repositories')).toContain('private')
    const { rows } = await client.execute(`SELECT private FROM repositories`)
    // Unknown visibility stays NULL, which readers treat as private.
    expect(rows[0].private).toBeNull()
  })

  it('is safe to run repeatedly', async () => {
    const client = createClient({ url: ':memory:' })

    await migrateSchema(client)
    await migrateSchema(client)

    const columns = await columnsOf(client, 'repositories')
    expect(columns.filter((name) => name === 'private')).toHaveLength(1)
  })
})
