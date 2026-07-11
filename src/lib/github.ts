import { createServerFn } from '@tanstack/react-start'
import { getDbClient } from './db'
import type { RepoTraffic, DailyTraffic } from './github.types'

export const getAllReposTraffic = createServerFn().handler(
  async (): Promise<RepoTraffic[]> => {
    try {
      const client = getDbClient()
      const result = await client.execute(`
        SELECT
          repo,
          date,
          views,
          visitors,
          clones,
          clone_uniques
        FROM daily_traffic
        WHERE date >= date('now', '-14 days')
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
          })
        }

        const traffic = repoMap.get(repo)!
        const views = row.views as number
        const visitors = row.visitors as number
        const clones = row.clones as number
        const cloneUniques = row.clone_uniques as number

        traffic.views.count += views
        traffic.views.uniques += visitors
        traffic.views.views.push({
          timestamp: `${date}T00:00:00Z`,
          count: views,
          uniques: visitors,
        })

        traffic.clones.count += clones
        traffic.clones.uniques += cloneUniques
        traffic.clones.clones.push({
          timestamp: `${date}T00:00:00Z`,
          count: clones,
          uniques: cloneUniques,
        })
      }

      // Fetch referrers.
      // GitHub's referrers endpoint already returns a rolling 14-day snapshot,
      // so each collected row is a full aggregate — summing multiple days would
      // multiply the counts. Use only the most recent snapshot per repo.
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
        const repo = row.repo as string
        const traffic = repoMap.get(repo)
        if (traffic) {
          traffic.referrers.push({
            referrer: row.referrer as string,
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
