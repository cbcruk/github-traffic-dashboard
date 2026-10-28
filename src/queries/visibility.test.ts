import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateSchema } from '../lib/schema'
import { createTestDb } from '../lib/test-d1'
import periodDaily from './period_daily.sql'
import referrerSnapshots from './referrer_snapshots.sql'
import repoSeen from './repo_seen.sql'

// The dashboard's queries keep repositories the newest collection listed
// (current_repositories) and, unless :show_private is 1, only public ones.
// NULL visibility counts as private.
describe('visible repositories', () => {
  let db: D1Database
  let dispose: () => Promise<void>

  beforeEach(async () => {
    ;({ db, dispose } = await createTestDb())
    await migrateSchema(db)
    await db.batch(
      [
        `INSERT INTO repositories (repo, first_seen, last_seen, private) VALUES
           ('me/public', '2026-10-01', '2026-10-27', 0),
           ('me/private', '2026-10-01', '2026-10-27', 1),
           ('me/unknown', '2026-10-01', '2026-10-27', NULL),
           ('me/deleted', '2026-10-01', '2026-10-20', 0)`,
        `INSERT INTO daily_traffic (repo, date, views, visitors, clones, clone_uniques)
         SELECT repo, '2026-10-27', 1, 1, 0, 0 FROM repositories`,
        `INSERT INTO referrers (repo, date, referrer, count, uniques)
         SELECT repo, '2026-10-27', 'github.com', 1, 1 FROM repositories`,
      ].map((sql) => db.prepare(sql)),
    )
  })

  afterEach(() => dispose())

  const period = { from: '2026-10-27', to: '2026-10-27' }

  it('shows public repositories the newest collection listed', async () => {
    const rows = await periodDaily.run(db, { ...period, show_private: 0 })
    expect(rows.map((row) => row.repo)).toEqual(['me/public'])

    const snapshots = await referrerSnapshots.run(db, {
      dates: ['2026-10-27'],
      show_private: 0,
    })
    expect(snapshots.map((row) => row.repo)).toEqual(['me/public'])
  })

  it('adds private and unknown ones with show_private', async () => {
    const rows = await periodDaily.run(db, { ...period, show_private: 1 })
    expect(rows.map((row) => row.repo).sort()).toEqual([
      'me/private',
      'me/public',
      'me/unknown',
    ])
  })

  it('finds no hidden repository by name', async () => {
    for (const repo of ['me/private', 'me/unknown', 'me/deleted']) {
      expect(await repoSeen.run(db, { repo, show_private: 0 })).toBeNull()
    }
    expect(
      await repoSeen.run(db, { repo: 'me/public', show_private: 0 }),
    ).toEqual({ firstSeen: '2026-10-01', lastSeen: '2026-10-27' })
  })
})
