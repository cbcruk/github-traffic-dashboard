import type { DailyTraffic, PopularPath, Referrer } from './github.types'
import { addDays, uncoveredDays } from './period-comparison'

/** Everything `/repos/$owner/$name` shows for one repository. */
export interface RepoDetail {
  repo: string
  /** First and newest collection that listed the repository. */
  firstSeen: string
  lastSeen: string
  daily: DailyTraffic[]
  /** Days with daily traffic that no collection reported. */
  uncovered: string[]
  /** GitHub's latest 14-day snapshots. */
  referrers: Referrer[]
  paths: PopularPath[]
}

/** The detail page of `owner/name`. */
export function repoPath(repo: string): string {
  const [owner, name] = repo.split('/')
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
}

export const repoRangeOptions = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 365 days' },
  { value: 'all', label: 'All time' },
]

export interface RepoDetailSearch {
  /** Days back from today. Absent means all time. */
  range?: number
}

/** As on `/history`: the default stays out of the URL, unknown values fall back. */
export function validateRepoDetailSearch(
  search: Record<string, unknown>,
): RepoDetailSearch {
  const range = Number(search.range)
  return {
    range: repoRangeOptions.some((option) => Number(option.value) === range)
      ? range
      : undefined,
  }
}

export interface SeriesPoint {
  date: string
  /** Null on a day no collection reported, so the chart leaves a gap. */
  views: number | null
  visitors: number | null
  clones: number | null
}

/**
 * One point per day from `from` to `to`.
 *
 * GitHub reports a day without traffic as 0, but a day the collector missed
 * is unknown, not 0: those are null so the chart breaks instead of dipping.
 * A covered day without a row (the repository did not exist yet, say) is 0.
 */
export function buildDailySeries(
  daily: DailyTraffic[],
  uncovered: string[],
  from: string,
  to: string,
): SeriesPoint[] {
  const byDate = new Map(daily.map((row) => [row.date, row]))
  const missing = new Set(uncovered)
  const points: SeriesPoint[] = []

  for (let date = from; date <= to; date = addDays(date, 1)) {
    const row = byDate.get(date)
    if (missing.has(date) && !row) {
      points.push({ date, views: null, visitors: null, clones: null })
    } else {
      points.push({
        date,
        views: row?.views ?? 0,
        visitors: row?.visitors ?? 0,
        clones: row?.clones ?? 0,
      })
    }
  }
  return points
}

/** Days from the first daily row to `today` that no collection reported. */
export function findUncovered(
  daily: DailyTraffic[],
  collectionDates: string[],
  today: string,
  windowDays: number,
): string[] {
  const first = daily.reduce<string | null>(
    (min, row) => (min === null || row.date < min ? row.date : min),
    null,
  )
  if (!first) return []
  return uncoveredDays(collectionDates, { from: first, to: today }, windowDays)
}
