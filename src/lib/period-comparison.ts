/**
 * Comparing a period of traffic with the one just before it.
 *
 * A period is the last `days` days ending today, today included, matching how
 * `/` (14 days) and `/history` (the selected range) count. The previous period
 * is the `days` days before that.
 *
 * GitHub reports a day without traffic as 0, so a day the collector missed
 * looks exactly like a quiet one (as 2026-07-15 to about 08-25 does). A
 * comparison that touches such a day is marked incomplete instead of showing
 * a drop that never happened.
 */

const DAY_MS = 86_400_000

export interface TrafficSums {
  views: number
  visitors: number
  clones: number
}

export interface PreviousPeriod {
  /** Sums per repository over the previous period. */
  byRepo: Record<string, TrafficSums>
  /** Whether either period includes a day no collection reported. */
  incomplete: boolean
}

/** Previous periods keyed by their length in days. */
export type PreviousPeriods = Record<number, PreviousPeriod>

export const EMPTY_SUMS: TrafficSums = { views: 0, visitors: 0, clones: 0 }

export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

export interface Period {
  from: string
  to: string
}

/** The `days`-day period ending `today`, and the one before it. */
export function periods(
  today: string,
  days: number,
): { current: Period; previous: Period } {
  return {
    current: { from: addDays(today, 1 - days), to: today },
    previous: { from: addDays(today, 1 - 2 * days), to: addDays(today, -days) },
  }
}

/** Days of daily traffic one GitHub collection reports, today included. */
export const GITHUB_WINDOW_DAYS = 14

/**
 * Days in `period` that no collection reported.
 *
 * Each collection reports a `windowDays` window (GitHub's 14 days), so a day is
 * covered when any collection ran on it or within the following window. Days
 * after the newest collection are not counted: they have not been collected
 * *yet*, which says nothing about a gap.
 */
export function uncoveredDays(
  collectionDates: string[],
  period: Period,
  windowDays = GITHUB_WINDOW_DAYS,
): string[] {
  const dates = [...new Set(collectionDates)].sort()
  const newest = dates.at(-1)
  if (!newest) return []

  const uncovered: string[] = []
  for (let day = period.from; day <= period.to && day <= newest; ) {
    const windowEnd = addDays(day, windowDays - 1)
    if (!dates.some((date) => date >= day && date <= windowEnd)) {
      uncovered.push(day)
    }
    day = addDays(day, 1)
  }
  return uncovered
}

/**
 * Change from `previous` to `current` as a whole percentage, or null when
 * there is nothing to compare against.
 */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export function sumTraffic(rows: TrafficSums[]): TrafficSums {
  return rows.reduce(
    (total, row) => ({
      views: total.views + row.views,
      visitors: total.visitors + row.visitors,
      clones: total.clones + row.clones,
    }),
    EMPTY_SUMS,
  )
}

/** Sums of the previous period for every repository, or for one. */
export function previousSums(
  period: PreviousPeriod | undefined,
  repo?: string,
): TrafficSums | null {
  if (!period) return null
  if (repo) return period.byRepo[repo] ?? EMPTY_SUMS
  return sumTraffic(Object.values(period.byRepo))
}

export interface DailyRow extends TrafficSums {
  repo: string
  date: string
}

/**
 * Previous-period sums for each length in `ranges`, from daily rows that reach
 * back at least `2 * max(ranges) - 1` days before `today`.
 */
export function buildPreviousPeriods(
  rows: DailyRow[],
  collectionDates: string[],
  today: string,
  ranges: number[],
  windowDays = GITHUB_WINDOW_DAYS,
): PreviousPeriods {
  const result: PreviousPeriods = {}

  for (const days of ranges) {
    const { current, previous } = periods(today, days)
    const byRepo: Record<string, TrafficSums> = {}

    for (const row of rows) {
      if (row.date < previous.from || row.date > previous.to) continue
      const sums = byRepo[row.repo] ?? EMPTY_SUMS
      byRepo[row.repo] = sumTraffic([sums, row])
    }

    result[days] = {
      byRepo,
      incomplete:
        uncoveredDays(
          collectionDates,
          { from: previous.from, to: current.to },
          windowDays,
        ).length > 0,
    }
  }

  return result
}
