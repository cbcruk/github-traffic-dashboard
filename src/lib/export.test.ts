import { describe, expect, it } from 'vitest'
import {
  ZERO_NOTE,
  dashboardExport,
  fileSlug,
  historyExport,
  toCsv,
  toJson,
} from './export'
import type { RepoTraffic } from './github.types'

describe('toCsv', () => {
  it('writes a header and quotes fields that need it', () => {
    const csv = toCsv({
      columns: ['name', 'count', 'note'],
      rows: [
        { name: 'plain', count: 3, note: null },
        { name: 'a,b', count: 0, note: 'say "hi"\nthere' },
      ],
      meta: {},
    })

    expect(csv).toBe(
      'name,count,note\r\nplain,3,\r\n"a,b",0,"say ""hi""\nthere"\r\n',
    )
  })
})

describe('toJson', () => {
  it('wraps rows with the export time, context and what a 0 may mean', () => {
    const parsed = JSON.parse(
      toJson(
        { columns: ['n'], rows: [{ n: 1 }], meta: { period: { days: 14 } } },
        new Date('2026-10-28T01:02:03Z'),
      ),
    )

    expect(parsed).toEqual({
      exportedAt: '2026-10-28T01:02:03.000Z',
      period: { days: 14 },
      note: ZERO_NOTE,
      rows: [{ n: 1 }],
    })
  })
})

describe('dashboardExport', () => {
  const traffic: RepoTraffic = {
    repo: 'me/app',
    views: { count: 40, uniques: 7, views: [] },
    clones: { count: 5, uniques: 2, clones: [] },
    referrers: [],
    paths: [],
  }

  it("exports each repository's window totals with the filters applied", () => {
    const table = dashboardExport(
      [traffic],
      { search: 'app', sort: 'views', showEmpty: false },
      '2026-10-28',
    )

    expect(table.rows).toEqual([
      {
        repo: 'me/app',
        views: 40,
        unique_visitors: 7,
        clones: 5,
        unique_cloners: 2,
      },
    ])
    expect(table.meta.period).toEqual({
      from: '2026-10-15',
      to: '2026-10-28',
      days: 14,
    })
  })
})

describe('historyExport', () => {
  it('orders daily rows by date, then repository', () => {
    const day = (repo: string, date: string) => ({
      repo,
      date,
      views: 1,
      visitors: 1,
      clones: 0,
      cloneUniques: 0,
    })

    const table = historyExport(
      [
        day('me/b', '2026-10-02'),
        day('me/a', '2026-10-02'),
        day('me/b', '2026-10-01'),
      ],
      { repo: null, days: 7 },
      '2026-10-07',
    )

    expect(table.rows.map((r) => `${r.date} ${r.repo}`)).toEqual([
      '2026-10-01 me/b',
      '2026-10-02 me/a',
      '2026-10-02 me/b',
    ])
    expect(table.meta).toEqual({
      period: { from: '2026-10-01', to: '2026-10-07', days: 7 },
      filters: { repo: 'all' },
    })
  })
})

describe('fileSlug', () => {
  it('keeps file names to safe characters', () => {
    expect(fileSlug('me/app.v2')).toBe('me-app.v2')
  })
})
