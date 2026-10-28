import { createServerFn } from '@tanstack/react-start'
import { orEmpty } from './db'
import {
  assessCollection,
  loadRecentRuns,
  type CollectionStatus,
} from './collection-health'
import { getDb } from './env'
import collectionDatesQuery from '../queries/collection_dates.sql'
import dashboardDailyQuery from '../queries/dashboard_daily.sql'
import historyDailyQuery from '../queries/history_daily.sql'
import lastFinishedCollectionQuery from '../queries/last_finished_collection.sql'
import latestPathsQuery from '../queries/latest_paths.sql'
import latestReferrersQuery from '../queries/latest_referrers.sql'
import latestTotalsQuery from '../queries/latest_totals.sql'
import periodDailyQuery from '../queries/period_daily.sql'
import referrerSnapshotsQuery from '../queries/referrer_snapshots.sql'
import referrerTrendQuery from '../queries/referrer_trend.sql'
import repoDailyQuery from '../queries/repo_daily.sql'
import repoPathsQuery from '../queries/repo_paths.sql'
import repoReferrersQuery from '../queries/repo_referrers.sql'
import repoSeenQuery from '../queries/repo_seen.sql'
import type { DailyTraffic, RepoTraffic } from './github.types'
import { findUncovered, type RepoDetail } from './repo-detail'
import {
  buildReferrerAnalysis,
  windowEnds,
  type ReferrerAnalysis,
} from './referrers'
import { DEMO_HISTORY_DAYS } from './demo-github'
import { dateRangeOptions } from './history-search'
import {
  GITHUB_WINDOW_DAYS,
  addDays,
  buildPreviousPeriods,
  type PreviousPeriods,
} from './period-comparison'

export interface PublicCollectionStatus {
  status: CollectionStatus
  lastStartedAt: string | null
}

/**
 * The `:show_private` parameter of the queries that pick the repos the
 * dashboard may show: owned as of the newest collection that listed any (the
 * `current_repositories` view), and public unless the deployment sets
 * `SHOW_PRIVATE_REPOS=true`.
 *
 * Traffic rows outlive the repository they describe, so a renamed or deleted
 * repo keeps showing up in historical queries. Anchoring on `MAX(last_seen)`
 * rather than a fixed cutoff means a stalled collector narrows nothing.
 *
 * This fails closed: `private = 0` excludes repos whose visibility has not
 * been recorded yet, and a schema that could not be migrated makes the query
 * error, so the page renders empty instead of exposing private repos.
 */
function showPrivate(): 0 | 1 {
  return process.env.SHOW_PRIVATE_REPOS === 'true' ? 1 : 0
}

export const getAllReposTraffic = createServerFn().handler(
  async (): Promise<RepoTraffic[]> => {
    try {
      const db = await getDb()

      const dailyRows = await dashboardDailyQuery.run(db, {
        show_private: showPrivate(),
      })

      const repoMap = new Map<string, RepoTraffic>()

      for (const {
        repo,
        date,
        views,
        visitors,
        clones,
        cloneUniques,
      } of dailyRows) {
        if (!repoMap.has(repo)) {
          repoMap.set(repo, {
            repo,
            views: { count: 0, uniques: 0, views: [] },
            clones: { count: 0, uniques: 0, clones: [] },
            referrers: [],
            paths: [],
          })
        }

        const traffic = repoMap.get(repo)!
        traffic.views.count += views
        traffic.views.views.push({
          timestamp: `${date}T00:00:00Z`,
          count: views,
          uniques: visitors,
        })

        traffic.clones.count += clones
        traffic.clones.clones.push({
          timestamp: `${date}T00:00:00Z`,
          count: clones,
          uniques: cloneUniques,
        })

        // Fallback only. Daily uniques are deduplicated per day, so summing
        // them overstates the window figure; `traffic_totals` overrides this
        // below wherever the collector has recorded a snapshot.
        traffic.views.uniques += visitors
        traffic.clones.uniques += cloneUniques
      }

      // Window-level aggregates as GitHub reported them. Counts stay as the
      // daily sums above so the numbers match the chart beside them; only the
      // uniques, which are not additive, come from the snapshot.
      const totalsRows = await orEmpty(latestTotalsQuery.run(db))

      for (const row of totalsRows) {
        const traffic = repoMap.get(row.repo)
        if (traffic) {
          traffic.views.uniques = row.viewUniques
          traffic.clones.uniques = row.cloneUniques
        }
      }

      // GitHub's referrers and paths endpoints already return a rolling 14-day
      // aggregate, so each collected row is a full snapshot — summing multiple
      // days would multiply the counts. Use only the most recent per repo.
      const referrerRows = await orEmpty(latestReferrersQuery.run(db))

      for (const { repo, ...referrer } of referrerRows) {
        repoMap.get(repo)?.referrers.push(referrer)
      }

      const pathRows = await orEmpty(latestPathsQuery.run(db))

      for (const { repo, ...path } of pathRows) {
        repoMap.get(repo)?.paths.push(path)
      }

      return Array.from(repoMap.values())
    } catch (error) {
      console.error('Failed to fetch traffic from database:', error)
      return []
    }
  },
)

export const getHistoricalTraffic = createServerFn().handler(
  async (): Promise<DailyTraffic[]> => {
    try {
      const db = await getDb()

      return await historyDailyQuery.run(db, { show_private: showPrivate() })
    } catch (error) {
      console.error('Failed to fetch historical traffic:', error)
      return []
    }
  },
)

/**
 * Collection status for the public page: the verdict and when the last run
 * started, nothing more. Problem details can name private repositories and
 * run counts would reveal how many exist, so those only go to the webhook.
 */
/**
 * Dates collections ran on, from `from` onward, for telling collection gaps
 * from quiet days (see `uncoveredDays`).
 *
 * Every collection stamps its snapshots with the collection date. Any of the
 * three tables will do, and together they reach back past traffic_totals,
 * which only exists since 2026-09-09.
 */
async function loadCollectionDates(
  db: D1Database,
  from: string,
): Promise<string[]> {
  const rows = await collectionDatesQuery.run(db, { from })
  return rows.map((row) => row.date)
}

/** Days one collection reports: GitHub's 14, or 90 for demo collections. */
function coverageWindowDays(): number {
  return process.env.DEMO_MODE === 'true'
    ? DEMO_HISTORY_DAYS
    : GITHUB_WINDOW_DAYS
}

/** Period lengths in days that the pages compare: `/`'s 14 and each range. */
const COMPARED_RANGES = dateRangeOptions.map((option) => Number(option.value))

/**
 * Traffic of the period before each compared range, per visible repository,
 * and whether collection gaps make the comparison unreliable.
 *
 * The pages already hold the current periods' figures, so only the previous
 * ones are fetched, summed here rather than shipped as daily rows: the longest
 * range reaches 180 days back.
 */
export const getPreviousPeriods = createServerFn().handler(
  async (): Promise<PreviousPeriods> => {
    try {
      const db = await getDb()
      const today = new Date().toISOString().slice(0, 10)
      const from = addDays(today, 1 - 2 * Math.max(...COMPARED_RANGES))
      const to = addDays(today, -Math.min(...COMPARED_RANGES))

      const rows = await periodDailyQuery.run(db, {
        from,
        to,
        show_private: showPrivate(),
      })

      return buildPreviousPeriods(
        rows,
        await loadCollectionDates(db, from),
        today,
        COMPARED_RANGES,
        coverageWindowDays(),
      )
    } catch (error) {
      console.error('Failed to fetch previous periods:', error)
      return {}
    }
  },
)

/**
 * One visible repository's full history, latest referrer and path snapshots,
 * and the days collection missed, or null if the repository is unknown or
 * hidden from this dashboard.
 */
export const getRepoDetail = createServerFn()
  .inputValidator((data: { repo: string }) => ({ repo: String(data.repo) }))
  .handler(async ({ data }): Promise<RepoDetail | null> => {
    const db = await getDb()
    const { repo } = data

    const seen = await repoSeenQuery.run(db, {
      repo,
      show_private: showPrivate(),
    })
    if (!seen) return null

    const [daily, referrers, paths] = await Promise.all([
      repoDailyQuery.run(db, { repo }),
      repoReferrersQuery.run(db, { repo }),
      repoPathsQuery.run(db, { repo }),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const collections = daily.length
      ? await loadCollectionDates(db, daily[0].date)
      : []

    return {
      repo,
      ...seen,
      daily,
      uncovered: findUncovered(daily, collections, today, coverageWindowDays()),
      referrers,
      paths,
    }
  })

/**
 * Referrer totals, per-repository breakdown and 14-day trend over the `days`
 * days ending at the newest finished collection (see referrers.ts).
 *
 * Periods end there rather than today because a day's collection runs in
 * batches: until it finishes, today's snapshots cover only some repositories.
 */
export const getReferrerAnalysis = createServerFn()
  .inputValidator((data: { days: number }) => ({ days: Number(data.days) }))
  .handler(async ({ data }): Promise<ReferrerAnalysis> => {
    const db = await getDb()
    const { days } = data

    const finished = (await lastFinishedCollectionQuery.run(db)).date
    const lookback = addDays(new Date().toISOString().slice(0, 10), -2 * days)
    const collectionDates = await loadCollectionDates(db, lookback)
    const anchor = finished ?? collectionDates.sort().at(-1) ?? null

    if (!anchor) {
      return buildReferrerAnalysis({
        anchor,
        days,
        snapshots: [],
        trendRows: [],
        collectionDates,
      })
    }

    const ends = windowEnds(anchor, days)
    const [snapshots, trendRows] = await Promise.all([
      referrerSnapshotsQuery.run(db, {
        dates: ends,
        show_private: showPrivate(),
      }),
      referrerTrendQuery.run(db, {
        from: addDays(anchor, 1 - days),
        to: anchor,
        show_private: showPrivate(),
      }),
    ])

    return buildReferrerAnalysis({
      anchor,
      days,
      snapshots,
      trendRows,
      collectionDates,
    })
  })

/**
 * Whether this deployment serves demo data (`DEMO_MODE=true`), so the page can
 * say so instead of passing made-up numbers off as real traffic.
 */
export const getDemoMode = createServerFn().handler(
  async (): Promise<boolean> => process.env.DEMO_MODE === 'true',
)

export const getCollectionStatus = createServerFn().handler(
  async (): Promise<PublicCollectionStatus | null> => {
    try {
      const db = await getDb()
      const { status, lastRun } = assessCollection(
        await loadRecentRuns(db),
        new Date(),
      )
      return { status, lastStartedAt: lastRun?.startedAt ?? null }
    } catch (error) {
      console.error('Failed to fetch collection status:', error)
      return null
    }
  },
)
