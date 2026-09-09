import { describe, expect, it } from 'vitest'
import { buildRepoStatements } from './collect-traffic'

const empty = {
  views: { count: 0, uniques: 0, views: [] },
  clones: { count: 0, uniques: 0, clones: [] },
  referrers: [],
  paths: [],
}

/** Args of every statement targeting `table`, in the order they were built. */
function argsFor(
  statements: ReturnType<typeof buildRepoStatements>,
  table: string,
) {
  return statements
    .filter((s) => typeof s !== 'string' && s.sql.includes(table))
    .map((s) => (typeof s === 'string' ? [] : s.args))
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

    expect(argsFor(statements, 'daily_traffic')).toEqual([
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

    expect(argsFor(statements, 'daily_traffic')).toEqual([
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

    expect(argsFor(statements, 'referrers')).toEqual([
      ['me/repo', '2026-09-09', 'github.com', 20, 3],
    ])
    expect(argsFor(statements, 'popular_paths')).toEqual([
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

    expect(argsFor(statements, 'traffic_totals')).toEqual([
      ['me/repo', '2026-09-09', 4, 1, 0, 0],
    ])
  })
})
