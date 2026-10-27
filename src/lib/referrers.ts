import { addDays } from './period-comparison'

/**
 * Referrer totals across repositories, from GitHub's referrer snapshots.
 *
 * Each `referrers` row is not a daily figure: it is a repository's top 10
 * referrers over the 14 days up to the collection date. So:
 *
 * - A period total adds snapshots 14 days apart, whose windows do not overlap
 *   (`windowEnds`). Periods are therefore whole multiples of 14 days, and a
 *   window whose snapshot date was not collected leaves the total incomplete.
 * - Uniques are deduplicated within one window and cannot be added across
 *   windows, so they are only reported for a 14-day period.
 * - The trend is the 14-day rolling figure itself, one point per collection.
 * - Referrers below a repository's top 10 are never reported, so every total
 *   is a lower bound.
 */

export const REFERRER_WINDOW_DAYS = 14

export const referrerPeriodOptions = [
  { value: '14', label: 'Last 14 days' },
  { value: '28', label: 'Last 28 days' },
  { value: '84', label: 'Last 84 days' },
]

export const DEFAULT_REFERRER_PERIOD = 14
export const TREND_SIZE = 5

export interface ReferrersSearch {
  /** Days, a multiple of 14. Absent means `DEFAULT_REFERRER_PERIOD`. */
  period?: number
  /** The referrer whose repositories are broken down. */
  referrer?: string
}

/** As on `/history`: defaults stay out of the URL, unknown values fall back. */
export function validateReferrersSearch(
  search: Record<string, unknown>,
): ReferrersSearch {
  const period = Number(search.period)
  return {
    period:
      period !== DEFAULT_REFERRER_PERIOD &&
      referrerPeriodOptions.some((option) => Number(option.value) === period)
        ? period
        : undefined,
    referrer:
      typeof search.referrer === 'string' && search.referrer !== ''
        ? search.referrer
        : undefined,
  }
}

/** Snapshot dates whose windows tile the `days` days ending at `anchor`. */
export function windowEnds(anchor: string, days: number): string[] {
  const count = Math.max(1, Math.round(days / REFERRER_WINDOW_DAYS))
  return Array.from({ length: count }, (_, i) =>
    addDays(anchor, -i * REFERRER_WINDOW_DAYS),
  )
}

export interface SnapshotRow {
  repo: string
  date: string
  referrer: string
  count: number
  uniques: number
}

export interface TrendRow {
  date: string
  referrer: string
  /** Summed across repositories. */
  count: number
}

export interface ReferrerTotal {
  referrer: string
  count: number
  /** Only for a single-window period; see the module comment. */
  uniques: number | null
  repos: { repo: string; count: number }[]
}

export interface TrendPoint {
  date: string
  /** Rolling 14-day count per referrer, null on an uncollected day. */
  [referrer: string]: string | number | null
}

export interface ReferrerAnalysis {
  /** The newest finished collection; periods end here. */
  anchor: string | null
  days: number
  /** Some window's snapshot date was not collected. */
  isIncomplete: boolean
  totals: ReferrerTotal[]
  /** The referrers the trend follows, most referred first. */
  trendReferrers: string[]
  trend: TrendPoint[]
}

export function buildReferrerAnalysis({
  anchor,
  days,
  snapshots,
  trendRows,
  collectionDates,
}: {
  anchor: string | null
  days: number
  /** Rows dated on `windowEnds(anchor, days)`. */
  snapshots: SnapshotRow[]
  /** Per-date sums over the period. */
  trendRows: TrendRow[]
  collectionDates: string[]
}): ReferrerAnalysis {
  if (!anchor) {
    return {
      anchor,
      days,
      isIncomplete: false,
      totals: [],
      trendReferrers: [],
      trend: [],
    }
  }

  const collected = new Set(collectionDates)
  const ends = windowEnds(anchor, days)
  const singleWindow = ends.length === 1

  const byReferrer = new Map<
    string,
    { count: number; uniques: number; repos: Map<string, number> }
  >()
  for (const row of snapshots) {
    if (!ends.includes(row.date)) continue
    const entry = byReferrer.get(row.referrer) ?? {
      count: 0,
      uniques: 0,
      repos: new Map<string, number>(),
    }
    entry.count += row.count
    entry.uniques += row.uniques
    entry.repos.set(row.repo, (entry.repos.get(row.repo) ?? 0) + row.count)
    byReferrer.set(row.referrer, entry)
  }

  const totals: ReferrerTotal[] = [...byReferrer]
    .map(([referrer, entry]) => ({
      referrer,
      count: entry.count,
      uniques: singleWindow ? entry.uniques : null,
      repos: [...entry.repos]
        .map(([repo, count]) => ({ repo, count }))
        .sort((a, b) => b.count - a.count || a.repo.localeCompare(b.repo)),
    }))
    .sort((a, b) => b.count - a.count || a.referrer.localeCompare(b.referrer))

  const trendReferrers = totals.slice(0, TREND_SIZE).map((t) => t.referrer)
  const counts = new Map(
    trendRows.map((row) => [`${row.date}|${row.referrer}`, row.count]),
  )
  const trend: TrendPoint[] = []
  for (let date = addDays(anchor, 1 - days); date <= anchor; ) {
    const point: TrendPoint = { date }
    for (const referrer of trendReferrers) {
      // A collected day without a row means the referrer fell out of every
      // repository's top 10, as good as 0 here.
      point[referrer] = collected.has(date)
        ? (counts.get(`${date}|${referrer}`) ?? 0)
        : null
    }
    trend.push(point)
    date = addDays(date, 1)
  }

  return {
    anchor,
    days,
    isIncomplete: ends.some((end) => !collected.has(end)),
    totals,
    trendReferrers,
    trend,
  }
}
