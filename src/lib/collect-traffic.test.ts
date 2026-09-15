import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  buildRepoStatements,
  buildRepositoryStatements,
} from './collect-traffic'
import { runBatch, type Statement } from './db'
import { migrateSchema } from './schema'
import { createTestDb } from './test-d1'

const empty = {
  views: { count: 0, uniques: 0, views: [] },
  clones: { count: 0, uniques: 0, clones: [] },
  referrers: [],
  paths: [],
}

/** Rows written to `table`, each as its bound values in column order. */
function rowsFor(statements: Statement[], table: string) {
  return statements
    .filter((s) => s.sql.startsWith(`INSERT INTO ${table} `))
    .flatMap((s) => {
      const width = s.sql.match(/VALUES \(([^)]*)\)/)![1].split(',').length
      const rows = []
      for (let i = 0; i < s.args.length; i += width) {
        rows.push(s.args.slice(i, i + width))
      }
      return rows
    })
}

describe('buildRepoStatements', () => {
  it('merges a date reported by both views and clones into one row', () => {
    const statements = buildRepoStatements('me/repo', '2026-09-09', {
      ...empty,
      views: {
        count: 3,
        uniques: 1,
        views: [{ timestamp: '2026-09-08T00:00:00Z', count: 3, uniques: 1 }],
      },
      clones: {
        count: 5,
        uniques: 2,
        clones: [{ timestamp: '2026-09-08T00:00:00Z', count: 5, uniques: 2 }],
      },
    })

    expect(rowsFor(statements, 'daily_traffic')).toEqual([
      ['me/repo', '2026-09-08', 3, 1, 5, 2],
    ])
  })

  it('keeps a date that only the clones endpoint reports', () => {
    const statements = buildRepoStatements('me/repo', '2026-09-09', {
      ...empty,
      clones: {
        count: 5,
        uniques: 2,
        clones: [{ timestamp: '2026-09-08T00:00:00Z', count: 5, uniques: 2 }],
      },
    })

    expect(rowsFor(statements, 'daily_traffic')).toEqual([
      ['me/repo', '2026-09-08', 0, 0, 5, 2],
    ])
  })

  it('stamps referrers and paths with the collection date, not a traffic date', () => {
    const statements = buildRepoStatements('me/repo', '2026-09-09', {
      ...empty,
      referrers: [{ referrer: 'github.com', count: 20, uniques: 3 }],
      paths: [
        { path: '/me/repo', title: 'me/repo: a repo', count: 12, uniques: 4 },
      ],
    })

    expect(rowsFor(statements, 'referrers')).toEqual([
      ['me/repo', '2026-09-09', 'github.com', 20, 3],
    ])
    expect(rowsFor(statements, 'popular_paths')).toEqual([
      ['me/repo', '2026-09-09', '/me/repo', 'me/repo: a repo', 12, 4],
    ])
  })

  it("snapshots GitHub's window totals instead of summing daily uniques", () => {
    const statements = buildRepoStatements('me/repo', '2026-09-09', {
      ...empty,
      views: {
        // Two visitors across two days, but only one distinct visitor overall.
        count: 4,
        uniques: 1,
        views: [
          { timestamp: '2026-09-07T00:00:00Z', count: 1, uniques: 1 },
          { timestamp: '2026-09-08T00:00:00Z', count: 3, uniques: 1 },
        ],
      },
    })

    expect(rowsFor(statements, 'traffic_totals')).toEqual([
      ['me/repo', '2026-09-09', 4, 1, 0, 0],
    ])
  })

  it('spends one statement per table on a full 14-day window', () => {
    const days = Array.from({ length: 14 }, (_, i) => ({
      timestamp: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      count: 1,
      uniques: 1,
    }))
    const statements = buildRepoStatements('me/repo', '2026-09-15', {
      views: { count: 14, uniques: 3, views: days },
      clones: { count: 14, uniques: 3, clones: days },
      referrers: Array.from({ length: 10 }, (_, i) => ({
        referrer: `site${i}.com`,
        count: 1,
        uniques: 1,
      })),
      paths: Array.from({ length: 10 }, (_, i) => ({
        path: `/me/repo/${i}`,
        title: `page ${i}`,
        count: 1,
        uniques: 1,
      })),
    })

    // D1 counts each statement against its per-invocation query limit.
    expect(statements).toHaveLength(4)
    expect(rowsFor(statements, 'daily_traffic')).toHaveLength(14)
  })
})

describe('buildRepositoryStatements', () => {
  it('records visibility so the dashboard can hide private repos', () => {
    const statements = buildRepositoryStatements(
      [
        { full_name: 'me/public', private: false },
        { full_name: 'me/secret', private: true },
      ],
      '2026-09-15',
    )

    expect(rowsFor(statements, 'repositories')).toEqual([
      ['me/public', '2026-09-15', '2026-09-15', 0],
      ['me/secret', '2026-09-15', '2026-09-15', 1],
    ])
  })

  it("splits large accounts to stay under D1's 100 bound parameters", () => {
    const repos = Array.from({ length: 60 }, (_, i) => ({
      full_name: `me/repo${i}`,
      private: false,
    }))
    const statements = buildRepositoryStatements(repos, '2026-09-15')

    expect(statements.every((s) => s.args.length <= 100)).toBe(true)
    expect(rowsFor(statements, 'repositories')).toHaveLength(60)
  })
})

describe('writing to D1', () => {
  let db: D1Database
  let dispose: () => Promise<void>

  beforeAll(async () => {
    ;({ db, dispose } = await createTestDb())
    await migrateSchema(db)
  })

  afterAll(async () => {
    await dispose()
  })

  it('upserts, so a later run updates rows instead of duplicating them', async () => {
    const snapshot = (views: number, title: string) => ({
      ...empty,
      views: {
        count: views,
        uniques: 1,
        views: [
          { timestamp: '2026-09-14T00:00:00Z', count: views, uniques: 1 },
        ],
      },
      referrers: [{ referrer: "o'reilly.com", count: views, uniques: 1 }],
      paths: [{ path: '/me/repo', title, count: views, uniques: 1 }],
    })

    await runBatch(
      db,
      buildRepoStatements('me/repo', '2026-09-15', snapshot(3, '첫 제목')),
    )
    await runBatch(
      db,
      buildRepoStatements('me/repo', '2026-09-15', snapshot(7, '새 제목')),
    )

    expect(
      (await db.prepare(`SELECT repo, date, views FROM daily_traffic`).all())
        .results,
    ).toEqual([{ repo: 'me/repo', date: '2026-09-14', views: 7 }])
    expect(
      (await db.prepare(`SELECT referrer, count FROM referrers`).all()).results,
    ).toEqual([{ referrer: "o'reilly.com", count: 7 }])
    expect(
      (await db.prepare(`SELECT title, count FROM popular_paths`).all())
        .results,
    ).toEqual([{ title: '새 제목', count: 7 }])
    expect(
      await db.prepare(`SELECT views FROM traffic_totals`).first('views'),
    ).toBe(7)
  })

  it('keeps first_seen when a repository is seen again', async () => {
    await runBatch(
      db,
      buildRepositoryStatements(
        [{ full_name: 'me/old', private: true }],
        '2026-09-01',
      ),
    )
    await runBatch(
      db,
      buildRepositoryStatements(
        [{ full_name: 'me/old', private: false }],
        '2026-09-15',
      ),
    )

    expect(
      await db
        .prepare(`SELECT first_seen, last_seen, private FROM repositories`)
        .first(),
    ).toEqual({ first_seen: '2026-09-01', last_seen: '2026-09-15', private: 0 })
  })
})
