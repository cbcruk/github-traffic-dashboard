import { createServerFn } from '@tanstack/react-start'
import { allOrEmpty } from './db'
import {
  assessCollection,
  loadRecentRuns,
  type CollectionStatus,
} from './collection-health'
import { getDb } from './env'
import type {
  DailyTraffic,
  PopularPath,
  Referrer,
  RepoTraffic,
} from './github.types'
import { findUncovered, type RepoDetail } from './repo-detail'
import { DEMO_HISTORY_DAYS } from './demo-github'
import { dateRangeOptions } from './history-search'
import {
  GITHUB_WINDOW_DAYS,
  addDays,
  buildPreviousPeriods,
  type DailyRow,
  type PreviousPeriods,
} from './period-comparison'

export interface PublicCollectionStatus {
  status: CollectionStatus
  lastStartedAt: string | null
}

/**
 * Repos the dashboard may show: owned as of the newest collection that listed
 * any, and public unless the deployment sets `SHOW_PRIVATE_REPOS=true`.
 *
 * Traffic rows outlive the repository they describe, so a renamed or deleted
 * repo keeps showing up in historical queries. Anchoring on `MAX(last_seen)`
 * rather than a fixed cutoff means a stalled collector narrows nothing.
 *
 * This fails closed: `private = 0` excludes repos whose visibility has not
 * been recorded yet, and a schema that could not be migrated makes the query
 * error, so the page renders empty instead of exposing private repos.
 */
function visibleReposQuery(): string {
  const showPrivate = process.env.SHOW_PRIVATE_REPOS === 'true'

  return `
    SELECT repo FROM repositories
    WHERE last_seen = (SELECT MAX(last_seen) FROM repositories)
      ${showPrivate ? '' : 'AND private = 0'}
  `
}

export const getAllReposTraffic = createServerFn().handler(
  async (): Promise<RepoTraffic[]> => {
    try {
      const db = await getDb()

      // GitHub's window is 14 days including today, so it reaches back 13.
      const { results: dailyRows } = await db
        .prepare(
          `
        SELECT
          repo,
          date,
          views,
          visitors,
          clones,
          clone_uniques
        FROM daily_traffic
        WHERE date >= date('now', '-13 days')
          AND repo IN (${visibleReposQuery()})
        ORDER BY repo, date
      `,
        )
        .all()

      const repoMap = new Map<string, RepoTraffic>()

      for (const row of dailyRows) {
        const repo = row.repo as string
        const date = row.date as string

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
        const views = row.views as number
        const visitors = row.visitors as number
        const clones = row.clones as number
        const cloneUniques = row.clone_uniques as number

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
      const totalsRows = await allOrEmpty(
        db,
        `
        SELECT t.repo, t.view_uniques, t.clone_uniques
        FROM traffic_totals t
        INNER JOIN (
          SELECT repo, MAX(date) AS max_date
          FROM traffic_totals
          GROUP BY repo
        ) latest ON t.repo = latest.repo AND t.date = latest.max_date
      `,
      )

      for (const row of totalsRows) {
        const traffic = repoMap.get(row.repo as string)
        if (traffic) {
          traffic.views.uniques = row.view_uniques as number
          traffic.clones.uniques = row.clone_uniques as number
        }
      }

      // GitHub's referrers and paths endpoints already return a rolling 14-day
      // aggregate, so each collected row is a full snapshot — summing multiple
      // days would multiply the counts. Use only the most recent per repo.
      const referrerRows = await allOrEmpty(
        db,
        `
        SELECT r.repo, r.referrer, r.count, r.uniques
        FROM referrers r
        INNER JOIN (
          SELECT repo, MAX(date) AS max_date
          FROM referrers
          GROUP BY repo
        ) latest ON r.repo = latest.repo AND r.date = latest.max_date
        ORDER BY r.count DESC
      `,
      )

      for (const row of referrerRows) {
        const traffic = repoMap.get(row.repo as string)
        if (traffic) {
          traffic.referrers.push({
            referrer: row.referrer as string,
            count: row.count as number,
            uniques: row.uniques as number,
          })
        }
      }

      const pathRows = await allOrEmpty(
        db,
        `
        SELECT p.repo, p.path, p.title, p.count, p.uniques
        FROM popular_paths p
        INNER JOIN (
          SELECT repo, MAX(date) AS max_date
          FROM popular_paths
          GROUP BY repo
        ) latest ON p.repo = latest.repo AND p.date = latest.max_date
        ORDER BY p.count DESC
      `,
      )

      for (const row of pathRows) {
        const traffic = repoMap.get(row.repo as string)
        if (traffic) {
          traffic.paths.push({
            path: row.path as string,
            title: row.title as string,
            count: row.count as number,
            uniques: row.uniques as number,
          })
        }
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

      const { results } = await db
        .prepare(
          `
        SELECT repo, date, views, visitors, clones, clone_uniques as cloneUniques
        FROM daily_traffic
        WHERE date >= date('now', '-90 days')
          AND repo IN (${visibleReposQuery()})
        ORDER BY date DESC
      `,
        )
        .all()

      return results.map((row) => ({
        repo: row.repo as string,
        date: row.date as string,
        views: row.views as number,
        visitors: row.visitors as number,
        clones: row.clones as number,
        cloneUniques: row.cloneUniques as number,
      }))
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
  const { results } = await db
    .prepare(
      `
      SELECT date FROM traffic_totals WHERE date >= ?1
      UNION SELECT date FROM referrers WHERE date >= ?1
      UNION SELECT date FROM popular_paths WHERE date >= ?1
    `,
    )
    .bind(from)
    .all<{ date: string }>()
  return results.map((row) => row.date)
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

      const { results: rows } = await db
        .prepare(
          `
        SELECT repo, date, views, visitors, clones
        FROM daily_traffic
        WHERE date BETWEEN ?1 AND ?2
          AND repo IN (${visibleReposQuery()})
      `,
        )
        .bind(from, to)
        .all<DailyRow>()

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

    const seen = await db
      .prepare(
        `
        SELECT first_seen AS firstSeen, last_seen AS lastSeen
        FROM repositories
        WHERE repo = ?1 AND repo IN (${visibleReposQuery()})
      `,
      )
      .bind(repo)
      .first<{ firstSeen: string; lastSeen: string }>()
    if (!seen) return null

    const [{ results: daily }, referrers, paths] = await Promise.all([
      db
        .prepare(
          `
          SELECT repo, date, views, visitors, clones,
                 clone_uniques AS cloneUniques
          FROM daily_traffic WHERE repo = ?1 ORDER BY date
        `,
        )
        .bind(repo)
        .all<DailyTraffic>(),
      // The newest snapshot only: each is already a 14-day aggregate.
      db
        .prepare(
          `
          SELECT referrer, count, uniques FROM referrers
          WHERE repo = ?1
            AND date = (SELECT MAX(date) FROM referrers WHERE repo = ?1)
          ORDER BY count DESC
        `,
        )
        .bind(repo)
        .all<Referrer>()
        .then((r) => r.results),
      db
        .prepare(
          `
          SELECT path, title, count, uniques FROM popular_paths
          WHERE repo = ?1
            AND date = (SELECT MAX(date) FROM popular_paths WHERE repo = ?1)
          ORDER BY count DESC
        `,
        )
        .bind(repo)
        .all<PopularPath>()
        .then((r) => r.results),
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
