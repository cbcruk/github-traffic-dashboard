import { describe, expect, it } from 'vitest'
import {
  buildDailySeries,
  findUncovered,
  repoPath,
  validateRepoDetailSearch,
} from './repo-detail'
import type { DailyTraffic } from './github.types'

function day(date: string, views: number): DailyTraffic {
  return {
    repo: 'me/app',
    date,
    views,
    visitors: 1,
    clones: 0,
    cloneUniques: 0,
  }
}

describe('buildDailySeries', () => {
  it('leaves days collection missed empty instead of zero', () => {
    const series = buildDailySeries(
      [day('2026-10-01', 5), day('2026-10-03', 7)],
      ['2026-10-02'],
      '2026-10-01',
      '2026-10-03',
    )

    expect(series.map((p) => p.views)).toEqual([5, null, 7])
  })

  it('reads a covered day without a row as no traffic', () => {
    const series = buildDailySeries(
      [day('2026-10-02', 3)],
      [],
      '2026-10-01',
      '2026-10-02',
    )

    expect(series.map((p) => p.views)).toEqual([0, 3])
  })
})

describe('findUncovered', () => {
  it('checks from the first daily row to today', () => {
    const uncovered = findUncovered(
      [day('2026-09-01', 1)],
      ['2026-09-14', '2026-10-14'],
      '2026-10-14',
      14,
    )

    expect(uncovered[0]).toBe('2026-09-15')
    expect(uncovered.at(-1)).toBe('2026-09-30')
  })

  it('has nothing to check without traffic', () => {
    expect(findUncovered([], ['2026-10-14'], '2026-10-14', 14)).toEqual([])
  })
})

describe('repoPath', () => {
  it('builds the detail path with each part encoded', () => {
    expect(repoPath('me/app')).toBe('/repos/me/app')
    expect(repoPath('me/a b')).toBe('/repos/me/a%20b')
  })
})

describe('validateRepoDetailSearch', () => {
  it('reads a listed range and treats anything else as all time', () => {
    expect(validateRepoDetailSearch({ range: '90' })).toEqual({ range: 90 })
    expect(validateRepoDetailSearch({ range: 'all' })).toEqual({
      range: undefined,
    })
    expect(validateRepoDetailSearch({ range: 45 })).toEqual({
      range: undefined,
    })
  })
})
