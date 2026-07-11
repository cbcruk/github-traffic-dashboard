import { describe, expect, it } from 'vitest'
import { filterAndSortRepos } from './traffic-utils'
import type { RepoTraffic } from './github.types'

function makeRepo(
  repo: string,
  views: number,
  visitors: number,
  clones: number,
): RepoTraffic {
  return {
    repo,
    views: { count: views, uniques: visitors, views: [] },
    clones: { count: clones, uniques: 0, clones: [] },
    referrers: [],
  }
}

const repos: RepoTraffic[] = [
  makeRepo('user/alpha', 100, 40, 5),
  makeRepo('user/beta', 300, 10, 50),
  makeRepo('user/gamma', 0, 0, 0),
  makeRepo('user/delta', 50, 25, 2),
]

describe('filterAndSortRepos', () => {
  it('hides repos with no unique visitors by default', () => {
    const result = filterAndSortRepos(repos)
    expect(result.map((r) => r.repo)).not.toContain('user/gamma')
  })

  it('includes empty repos when showEmpty is true', () => {
    const result = filterAndSortRepos(repos, { showEmpty: true })
    expect(result.map((r) => r.repo)).toContain('user/gamma')
  })

  it('sorts by views (descending) by default', () => {
    const result = filterAndSortRepos(repos)
    expect(result.map((r) => r.repo)).toEqual([
      'user/beta',
      'user/alpha',
      'user/delta',
    ])
  })

  it('sorts by visitors (descending)', () => {
    const result = filterAndSortRepos(repos, { sortBy: 'visitors' })
    expect(result.map((r) => r.repo)).toEqual([
      'user/alpha',
      'user/delta',
      'user/beta',
    ])
  })

  it('sorts by clones (descending)', () => {
    const result = filterAndSortRepos(repos, { sortBy: 'clones' })
    expect(result[0].repo).toBe('user/beta')
  })

  it('sorts by name (ascending)', () => {
    const result = filterAndSortRepos(repos, { sortBy: 'name' })
    expect(result.map((r) => r.repo)).toEqual([
      'user/alpha',
      'user/beta',
      'user/delta',
    ])
  })

  it('filters by case-insensitive search', () => {
    const result = filterAndSortRepos(repos, {
      search: 'BETA',
      showEmpty: true,
    })
    expect(result.map((r) => r.repo)).toEqual(['user/beta'])
  })

  it('does not mutate the input array', () => {
    const input = [...repos]
    filterAndSortRepos(input, { sortBy: 'name' })
    expect(input).toEqual(repos)
  })
})
