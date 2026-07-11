import type { RepoTraffic } from './github.types'

export const sortOptions = ['views', 'visitors', 'clones', 'name'] as const
export type SortOption = (typeof sortOptions)[number]

export interface FilterSortOptions {
  search?: string
  sortBy?: SortOption
  showEmpty?: boolean
}

/**
 * Filter and sort repository traffic for the dashboard.
 *
 * - `search` matches (case-insensitively) against the full repo name.
 * - When `showEmpty` is false, repos with no unique visitors are hidden.
 * - `sortBy` orders by the given metric (descending) or by name (ascending).
 *
 * Returns a new array; the input is never mutated.
 */
export function filterAndSortRepos(
  trafficData: RepoTraffic[],
  { search = '', sortBy = 'views', showEmpty = false }: FilterSortOptions = {},
): RepoTraffic[] {
  let data = [...trafficData]

  if (search) {
    const query = search.toLowerCase()
    data = data.filter((t) => t.repo.toLowerCase().includes(query))
  }

  if (!showEmpty) {
    data = data.filter((t) => t.views.uniques > 0)
  }

  data.sort((a, b) => {
    switch (sortBy) {
      case 'views':
        return b.views.count - a.views.count
      case 'visitors':
        return b.views.uniques - a.views.uniques
      case 'clones':
        return b.clones.count - a.clones.count
      case 'name':
        return a.repo.localeCompare(b.repo)
      default:
        return 0
    }
  })

  return data
}
