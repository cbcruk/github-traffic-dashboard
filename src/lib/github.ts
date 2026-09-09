import { createServerFn } from '@tanstack/react-start'
import { getDbClient } from './db'
import type { RepoTraffic, DailyTraffic } from './github.types'

/**
 * Repos owned as of the newest collection that listed any.
 *
 * Traffic rows outlive the repository they describe, so a renamed or deleted
 * repo keeps showing up in historical queries. Anchoring on `MAX(last_seen)`
 * rather than a fixed cutoff means a stalled collector narrows nothing.
 */
const CURRENT_REPOS = `
  SELECT repo FROM repositories
  WHERE last_seen = (SELECT MAX(last_seen) FROM repositories)
`

/** True before the first run of the collector has populated `repositories`. */
const NO_REPOS_RECORDED = `NOT EXISTS (SELECT 1 FROM repositories)`

export const getAllReposTraffic = createServerFn().handler(
  async (): Promise<RepoTraffic[]> => {
    try {
      const client = getDbClient()

      // GitHub's window is 14 days including today, so it reaches back 13.
      const result = await client.execute(`
        SELECT
          repo,
          date,
          views,
          visitors,
          clones,
          clone_uniques
        FROM daily_traffic
        WHERE date >= date('now', '-13 days')
        ORDER BY repo, date
      `)

      const repoMap = new Map<string, RepoTraffic>()

      for (const row of result.rows) {
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
      const totalsResult = await client.execute(`
        SELECT t.repo, t.view_uniques, t.clone_uniques
        FROM traffic_totals t
        INNER JOIN (
          SELECT repo, MAX(date) AS max_date
          FROM traffic_totals
          GROUP BY repo
        ) latest ON t.repo = latest.repo AND t.date = latest.max_date
      `)

      for (const row of totalsResult.rows) {
        const traffic = repoMap.get(row.repo as string)
        if (traffic) {
          traffic.views.uniques = row.view_uniques as number
          traffic.clones.uniques = row.clone_uniques as number
        }
      }

      // GitHub's referrers and paths endpoints already return a rolling 14-day
      // aggregate, so each collected row is a full snapshot — summing multiple
      // days would multiply the counts. Use only the most recent per repo.
      const referrersResult = await client.execute(`
        SELECT r.repo, r.referrer, r.count, r.uniques
        FROM referrers r
        INNER JOIN (
          SELECT repo, MAX(date) AS max_date
          FROM referrers
          GROUP BY repo
        ) latest ON r.repo = latest.repo AND r.date = latest.max_date
        ORDER BY r.count DESC
      `)

      for (const row of referrersResult.rows) {
        const traffic = repoMap.get(row.repo as string)
        if (traffic) {
          traffic.referrers.push({
            referrer: row.referrer as string,
            count: row.count as number,
            uniques: row.uniques as number,
          })
        }
      }

      const pathsResult = await client.execute(`
        SELECT p.repo, p.path, p.title, p.count, p.uniques
        FROM popular_paths p
        INNER JOIN (
          SELECT repo, MAX(date) AS max_date
          FROM popular_paths
          GROUP BY repo
        ) latest ON p.repo = latest.repo AND p.date = latest.max_date
        ORDER BY p.count DESC
      `)

      for (const row of pathsResult.rows) {
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
      const client = getDbClient()
      const result = await client.execute(`
        SELECT repo, date, views, visitors, clones, clone_uniques as cloneUniques
        FROM daily_traffic
        WHERE date >= date('now', '-90 days')
          AND (${NO_REPOS_RECORDED} OR repo IN (${CURRENT_REPOS}))
        ORDER BY date DESC
      `)

      return result.rows.map((row) => ({
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
