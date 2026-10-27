import type { DailyTraffic } from './github.types'
import { periods, type TrafficSums } from './period-comparison'

/**
 * The repositories with the most traffic over a period, and how their places
 * moved since the period before it (see period-comparison.ts).
 */

export const rankingPeriodOptions = [
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

export const rankingMetricOptions = [
  { value: 'views', label: 'Views' },
  { value: 'visitors', label: 'Unique visitors' },
  { value: 'clones', label: 'Clones' },
]

export type RankingMetric = keyof TrafficSums

export const DEFAULT_RANKING_PERIOD = 14
export const DEFAULT_RANKING_METRIC: RankingMetric = 'views'
export const RANKING_SIZE = 10

export interface RankingSearch {
  /** Days back from today. Absent means `DEFAULT_RANKING_PERIOD`. */
  period?: number
  /** Absent means `DEFAULT_RANKING_METRIC`. */
  metric?: RankingMetric
}

/** As on `/history`: defaults stay out of the URL, unknown values fall back. */
export function validateRankingSearch(
  search: Record<string, unknown>,
): RankingSearch {
  const period = Number(search.period)
  const metric = search.metric
  return {
    period:
      period !== DEFAULT_RANKING_PERIOD &&
      rankingPeriodOptions.some((option) => Number(option.value) === period)
        ? period
        : undefined,
    metric:
      metric !== DEFAULT_RANKING_METRIC &&
      rankingMetricOptions.some((option) => option.value === metric)
        ? (metric as RankingMetric)
        : undefined,
  }
}

/**
 * Per-repository sums of the `days`-day period ending `today`. Unique
 * visitors are summed per day, as GitHub has no deduplicated figure for
 * windows longer than its own 14 days.
 */
export function currentSums(
  daily: DailyTraffic[],
  today: string,
  days: number,
): Record<string, TrafficSums> {
  const { current } = periods(today, days)
  const byRepo: Record<string, TrafficSums> = {}

  for (const row of daily) {
    if (row.date < current.from || row.date > current.to) continue
    const sums = byRepo[row.repo] ?? { views: 0, visitors: 0, clones: 0 }
    byRepo[row.repo] = {
      views: sums.views + row.views,
      visitors: sums.visitors + row.visitors,
      clones: sums.clones + row.clones,
    }
  }
  return byRepo
}

export interface RankedRepo {
  repo: string
  value: number
  rank: number
  /** Place in the previous period, or null if it had no traffic then. */
  previousRank: number | null
}

/** Repositories with traffic, best first, ties broken by name. */
function order(
  sums: Record<string, TrafficSums>,
  metric: RankingMetric,
): { repo: string; value: number }[] {
  return Object.entries(sums)
    .map(([repo, s]) => ({ repo, value: s[metric] }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.repo.localeCompare(b.repo))
}

/**
 * The top `size` repositories by `metric`. Previous places are counted among
 * every repository, not just the previous top `size`, so a climb from 14th
 * shows as one.
 */
export function rankRepos(
  current: Record<string, TrafficSums>,
  previous: Record<string, TrafficSums>,
  metric: RankingMetric,
  size = RANKING_SIZE,
): RankedRepo[] {
  const previousRanks = new Map(
    order(previous, metric).map((entry, i) => [entry.repo, i + 1]),
  )

  return order(current, metric)
    .slice(0, size)
    .map((entry, i) => ({
      ...entry,
      rank: i + 1,
      previousRank: previousRanks.get(entry.repo) ?? null,
    }))
}
