import { getDbClient } from './db'

const GITHUB_API_BASE = 'https://api.github.com'

interface Repository {
  full_name: string
  fork: boolean
}

interface TrafficPoint {
  timestamp: string
  count: number
  uniques: number
}

interface ViewsResponse {
  count: number
  uniques: number
  views: TrafficPoint[]
}

interface ClonesResponse {
  count: number
  uniques: number
  clones: TrafficPoint[]
}

interface Referrer {
  referrer: string
  count: number
  uniques: number
}

export interface CollectResult {
  repos: number
  succeeded: number
  failed: string[]
}

export interface CollectOptions {
  /** Called with human-readable progress lines. Defaults to a no-op. */
  log?: (message: string) => void
  /** Delay between repos in ms to ease GitHub rate limits. Defaults to 100. */
  delayMs?: number
}

function getHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is not set')
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    // GitHub requires a User-Agent on every request; some edge runtimes
    // (e.g. Cloudflare Workers) don't send a default one, causing 403s.
    'User-Agent': 'github-traffic-dashboard',
  }
}

async function getMyRepos(): Promise<Repository[]> {
  const headers = getHeaders()
  const perPage = 100
  const allRepos: Repository[] = []

  for (let page = 1; ; page++) {
    const res = await fetch(
      `${GITHUB_API_BASE}/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner`,
      { headers },
    )

    if (!res.ok) {
      throw new Error(`Failed to fetch repos: ${res.status} ${res.statusText}`)
    }

    const repos: Repository[] = await res.json()
    allRepos.push(...repos)

    // Last page reached when fewer than a full page is returned.
    if (repos.length < perPage) break
  }

  return allRepos.filter((repo) => !repo.fork)
}

async function fetchRepoTraffic(repo: string): Promise<{
  views: ViewsResponse
  clones: ClonesResponse
  referrers: Referrer[]
}> {
  const headers = getHeaders()

  const [viewsRes, clonesRes, referrersRes] = await Promise.all([
    fetch(`${GITHUB_API_BASE}/repos/${repo}/traffic/views`, { headers }),
    fetch(`${GITHUB_API_BASE}/repos/${repo}/traffic/clones`, { headers }),
    fetch(`${GITHUB_API_BASE}/repos/${repo}/traffic/popular/referrers`, {
      headers,
    }),
  ])

  if (!viewsRes.ok || !clonesRes.ok || !referrersRes.ok) {
    throw new Error(`Failed to fetch traffic for ${repo}`)
  }

  const [views, clones, referrers] = await Promise.all([
    viewsRes.json() as Promise<ViewsResponse>,
    clonesRes.json() as Promise<ClonesResponse>,
    referrersRes.json() as Promise<Referrer[]>,
  ])

  return { views, clones, referrers }
}

/**
 * Fetch traffic for every owned (non-fork) repository and upsert it into Turso.
 *
 * Shared by the CLI collector (`scripts/collect-traffic.ts`) and the
 * `/api/collect` server route driven by Vercel Cron.
 */
export async function collectTraffic(
  options: CollectOptions = {},
): Promise<CollectResult> {
  const log = options.log ?? (() => {})
  const delayMs = options.delayMs ?? 100

  const client = getDbClient()

  const repos = await getMyRepos()
  log(`Found ${repos.length} repositories`)

  const today = new Date().toISOString().split('T')[0]
  const failed: string[] = []
  let succeeded = 0

  for (const repo of repos) {
    try {
      log(`Fetching traffic for ${repo.full_name}...`)
      const { views, clones, referrers } = await fetchRepoTraffic(
        repo.full_name,
      )

      // Store daily view/clone data
      for (const view of views.views) {
        const date = view.timestamp.split('T')[0]
        const clone = clones.clones.find(
          (c) => c.timestamp.split('T')[0] === date,
        )

        await client.execute({
          sql: `
            INSERT INTO daily_traffic (repo, date, views, visitors, clones, clone_uniques)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(repo, date) DO UPDATE SET
              views = excluded.views,
              visitors = excluded.visitors,
              clones = excluded.clones,
              clone_uniques = excluded.clone_uniques
          `,
          args: [
            repo.full_name,
            date,
            view.count,
            view.uniques,
            clone?.count ?? 0,
            clone?.uniques ?? 0,
          ],
        })
      }

      // Store clones data that might not have corresponding views
      for (const clone of clones.clones) {
        const date = clone.timestamp.split('T')[0]
        const hasView = views.views.some(
          (v) => v.timestamp.split('T')[0] === date,
        )
        if (!hasView) {
          await client.execute({
            sql: `
              INSERT INTO daily_traffic (repo, date, views, visitors, clones, clone_uniques)
              VALUES (?, ?, 0, 0, ?, ?)
              ON CONFLICT(repo, date) DO UPDATE SET
                clones = excluded.clones,
                clone_uniques = excluded.clone_uniques
            `,
            args: [repo.full_name, date, clone.count, clone.uniques],
          })
        }
      }

      // Store referrer data for today
      for (const ref of referrers) {
        await client.execute({
          sql: `
            INSERT INTO referrers (repo, date, referrer, count, uniques)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(repo, date, referrer) DO UPDATE SET
              count = excluded.count,
              uniques = excluded.uniques
          `,
          args: [repo.full_name, today, ref.referrer, ref.count, ref.uniques],
        })
      }

      succeeded++
      log(`✓ ${repo.full_name}`)
    } catch (error) {
      failed.push(repo.full_name)
      log(`✗ ${repo.full_name}: ${String(error)}`)
    }

    // Small delay to avoid rate limiting
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  return { repos: repos.length, succeeded, failed }
}
