import 'dotenv/config'
import { getDbClient } from '../src/lib/db'

const GITHUB_API_BASE = 'https://api.github.com'

interface Repository {
  full_name: string
  fork: boolean
}

interface ViewData {
  timestamp: string
  count: number
  uniques: number
}

interface CloneData {
  timestamp: string
  count: number
  uniques: number
}

interface Referrer {
  referrer: string
  count: number
  uniques: number
}

interface ViewsResponse {
  count: number
  uniques: number
  views: ViewData[]
}

interface ClonesResponse {
  count: number
  uniques: number
  clones: CloneData[]
}

function getHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is not set')
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  }
}

async function getMyRepos(): Promise<Repository[]> {
  const headers = getHeaders()
  const res = await fetch(
    `${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner`,
    { headers },
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch repos: ${res.status} ${res.statusText}`)
  }

  const repos: Repository[] = await res.json()
  return repos.filter((repo) => !repo.fork)
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

async function main(): Promise<void> {
  console.log('Starting traffic data collection...')

  const client = getDbClient()

  const repos = await getMyRepos()
  console.log(`Found ${repos.length} repositories`)

  const today = new Date().toISOString().split('T')[0]

  for (const repo of repos) {
    try {
      console.log(`Fetching traffic for ${repo.full_name}...`)
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

      console.log(`✓ ${repo.full_name}`)
    } catch (error) {
      console.error(`✗ ${repo.full_name}:`, error)
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 100))
  }

  console.log('Traffic data collection completed!')
}

main().catch(console.error)
