/**
 * A stand-in for the GitHub API that serves made-up traffic, so the dashboard
 * can run without a token or real data: for local development, screenshots,
 * and a public demo deployment (`DEMO_MODE=true`).
 *
 * It plugs into `collectTraffic` as its `fetch`, so demo data goes through the
 * same collection, storage and queries as real data, and every page that reads
 * D1 works on it unchanged.
 *
 * Values are derived from the repository and date alone, so collecting again
 * on a later day rewrites the overlapping dates with the same numbers. Unlike
 * GitHub, the views and clones windows reach back `DEMO_HISTORY_DAYS`, so the
 * history page has something to show from the first run.
 */

export const DEMO_OWNER = 'demo'

/** Days of daily traffic each demo collection returns, today included. */
export const DEMO_HISTORY_DAYS = 90

/**
 * Repositories per cron invocation in demo mode.
 *
 * A 90-day window writes about 9 D1 statements per repository instead of the
 * real 14-day window's 4, so fewer fit in the free plan's 50 queries. The fake
 * API spends no subrequests.
 */
export const DEMO_BATCH_SIZE = 3

interface DemoRepo {
  name: string
  /** Typical daily views. */
  popularity: number
  /** Clones per view. */
  cloneRate: number
}

const DEMO_REPOS: DemoRepo[] = [
  { name: 'awesome-cli', popularity: 140, cloneRate: 0.12 },
  { name: 'react-hooks-kit', popularity: 95, cloneRate: 0.08 },
  { name: 'dotfiles', popularity: 12, cloneRate: 0.3 },
  { name: 'tiny-router', popularity: 48, cloneRate: 0.1 },
  { name: 'markdown-preview', popularity: 30, cloneRate: 0.06 },
  { name: 'weather-bot', popularity: 8, cloneRate: 0.2 },
  { name: 'design-tokens', popularity: 22, cloneRate: 0.05 },
  { name: 'old-experiments', popularity: 0, cloneRate: 0 },
]

const REFERRERS = [
  'github.com',
  'Google',
  'news.ycombinator.com',
  'reddit.com',
  'dev.to',
  'twitter.com',
]

/** FNV-1a, enough to turn a key into a well-spread seed. */
function hash(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A number in [0, 1) fixed by `key`. */
function noise(key: string): number {
  // One round of mulberry32 on the hashed key.
  let t = (hash(key) + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function dayViews(repo: DemoRepo, date: string): number {
  if (repo.popularity === 0) return 0
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  const weekly = weekday === 0 || weekday === 6 ? 0.6 : 1.1
  // An occasional spike, as when a post links to the repository.
  const spike = noise(`${repo.name}|${date}|spike`) > 0.97 ? 6 : 1
  const jitter = 0.5 + noise(`${repo.name}|${date}`)
  return Math.round(repo.popularity * weekly * spike * jitter)
}

function daysEndingOn(today: string, count: number): string[] {
  const end = new Date(`${today}T00:00:00Z`).getTime()
  return Array.from({ length: count }, (_, i) =>
    new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  )
}

function history(repo: DemoRepo, today: string) {
  return daysEndingOn(today, DEMO_HISTORY_DAYS).map((date) => {
    const views = dayViews(repo, date)
    const clones = Math.round(views * repo.cloneRate)
    return {
      timestamp: `${date}T00:00:00Z`,
      views,
      visitors: Math.round(views * 0.35),
      clones,
      cloneUniques: Math.round(clones * 0.6),
    }
  })
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/** Window totals over the last 14 days, as GitHub reports them. */
function recent<T>(days: T[]): T[] {
  return days.slice(-14)
}

/**
 * A `fetch` that answers the GitHub endpoints the collector calls, as of
 * `now`. Anything else is a 404.
 */
export function createDemoGitHub(now: () => Date = () => new Date()) {
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url)
    const today = now().toISOString().slice(0, 10)

    if (pathname === '/user/repos') {
      return Response.json(
        DEMO_REPOS.map((repo) => ({
          full_name: `${DEMO_OWNER}/${repo.name}`,
          fork: false,
          archived: false,
          private: false,
          permissions: { admin: true, push: true },
        })),
      )
    }

    const match = pathname.match(
      /^\/repos\/([^/]+)\/([^/]+)\/traffic\/(views|clones|popular\/referrers|popular\/paths)$/,
    )
    const repo =
      match?.[1] === DEMO_OWNER &&
      DEMO_REPOS.find((candidate) => candidate.name === match[2])
    if (!match || !repo) {
      return new Response('Not Found', { status: 404 })
    }

    const days = history(repo, today)
    const last14 = recent(days)

    switch (match[3]) {
      case 'views':
        return Response.json({
          count: sum(last14.map((d) => d.views)),
          // Deduplicated across the window, so less than the daily sum.
          uniques: Math.round(sum(last14.map((d) => d.visitors)) * 0.7),
          views: days.map((d) => ({
            timestamp: d.timestamp,
            count: d.views,
            uniques: d.visitors,
          })),
        })
      case 'clones':
        return Response.json({
          count: sum(last14.map((d) => d.clones)),
          uniques: Math.round(sum(last14.map((d) => d.cloneUniques)) * 0.7),
          clones: days.map((d) => ({
            timestamp: d.timestamp,
            count: d.clones,
            uniques: d.cloneUniques,
          })),
        })
      case 'popular/referrers': {
        const total = sum(last14.map((d) => d.views))
        let remaining = Math.round(total * 0.6)
        const referrers = []
        for (const referrer of REFERRERS) {
          const share = noise(`${repo.name}|${today}|${referrer}`)
          const count = Math.round(remaining * share * 0.7)
          if (count === 0) continue
          remaining -= count
          referrers.push({
            referrer,
            count,
            uniques: Math.max(1, Math.round(count * 0.4)),
          })
        }
        return Response.json(referrers.sort((a, b) => b.count - a.count))
      }
      default: {
        const total = sum(last14.map((d) => d.views))
        const base = `/${DEMO_OWNER}/${repo.name}`
        const paths = [
          { path: base, title: `${DEMO_OWNER}/${repo.name}`, share: 0.55 },
          { path: `${base}/issues`, title: 'Issues', share: 0.15 },
          {
            path: `${base}/blob/main/README.md`,
            title: 'README.md',
            share: 0.1,
          },
        ]
        return Response.json(
          paths
            .map(({ path, title, share }) => {
              const count = Math.round(total * share)
              return {
                path,
                title,
                count,
                uniques: Math.round(count * 0.4),
              }
            })
            .filter((path) => path.count > 0),
        )
      }
    }
  }
}
