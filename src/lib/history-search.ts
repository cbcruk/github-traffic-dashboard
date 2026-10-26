export const dateRangeOptions = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
]

export const DEFAULT_RANGE = 30

export interface HistorySearch {
  /** Full name, e.g. `owner/name`. Absent means all repositories. */
  repo?: string
  /** Days back from today. Absent means `DEFAULT_RANGE`. */
  range?: number
}

/**
 * Filters live in the URL so a reload or a shared link keeps them. Defaults
 * are left out, as on `/`, and unknown values fall back to them.
 */
export function validateHistorySearch(
  search: Record<string, unknown>,
): HistorySearch {
  const range = Number(search.range)
  return {
    repo:
      typeof search.repo === 'string' && search.repo !== 'all'
        ? search.repo
        : undefined,
    range:
      range !== DEFAULT_RANGE &&
      dateRangeOptions.some((option) => Number(option.value) === range)
        ? range
        : undefined,
  }
}
