import { describe, expect, it } from 'vitest'
import { currentSums, rankRepos, validateRankingSearch } from './ranking'
import type { TrafficSums } from './period-comparison'

const sums = (views: number, visitors = 0, clones = 0): TrafficSums => ({
  views,
  visitors,
  clones,
})

describe('rankRepos', () => {
  it('orders by the metric, ties by name, and leaves out repos without traffic', () => {
    const ranked = rankRepos(
      { 'me/b': sums(5), 'me/a': sums(5), 'me/c': sums(9), 'me/zero': sums(0) },
      {},
      'views',
    )

    expect(ranked.map((r) => [r.rank, r.repo, r.value])).toEqual([
      [1, 'me/c', 9],
      [2, 'me/a', 5],
      [3, 'me/b', 5],
    ])
  })

  it('keeps only the top entries', () => {
    const current = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`me/r${i}`, sums(100 - i)]),
    )

    expect(rankRepos(current, {}, 'views', 10)).toHaveLength(10)
  })

  it('ranks by the chosen metric', () => {
    const ranked = rankRepos(
      { 'me/a': sums(10, 1, 9), 'me/b': sums(20, 2, 3) },
      {},
      'clones',
    )

    expect(ranked.map((r) => r.repo)).toEqual(['me/a', 'me/b'])
  })

  it('counts previous places among every repository', () => {
    const previous = Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => [`me/r${i}`, sums(100 - i)]),
    )

    const [first, second] = rankRepos(
      { 'me/r13': sums(500), 'me/r0': sums(400) },
      { ...previous, 'me/r13': sums(1) },
      'views',
    )

    expect(first).toMatchObject({ repo: 'me/r13', rank: 1, previousRank: 14 })
    expect(second).toMatchObject({ repo: 'me/r0', rank: 2, previousRank: 1 })
  })

  it('has no previous place for a repo without traffic back then', () => {
    const [entry] = rankRepos(
      { 'me/new': sums(3) },
      { 'me/new': sums(0) },
      'views',
    )

    expect(entry.previousRank).toBeNull()
  })
})

describe('currentSums', () => {
  it('sums each repo over the period ending today', () => {
    const daily = [
      {
        repo: 'me/a',
        date: '2026-10-14',
        views: 2,
        visitors: 1,
        clones: 0,
        cloneUniques: 0,
      },
      {
        repo: 'me/a',
        date: '2026-10-01',
        views: 3,
        visitors: 1,
        clones: 1,
        cloneUniques: 1,
      },
      {
        repo: 'me/a',
        date: '2026-09-30',
        views: 50,
        visitors: 9,
        clones: 9,
        cloneUniques: 9,
      },
    ]

    expect(currentSums(daily, '2026-10-14', 14)).toEqual({
      'me/a': { views: 5, visitors: 2, clones: 1 },
    })
  })
})

describe('validateRankingSearch', () => {
  it('reads a listed period and metric, leaving defaults out', () => {
    expect(validateRankingSearch({ period: '90', metric: 'clones' })).toEqual({
      period: 90,
      metric: 'clones',
    })
    expect(validateRankingSearch({ period: 14, metric: 'views' })).toEqual({
      period: undefined,
      metric: undefined,
    })
    expect(validateRankingSearch({ period: 7, metric: 'stars' })).toEqual({
      period: undefined,
      metric: undefined,
    })
  })
})
