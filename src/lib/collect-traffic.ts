import { getDbClient, type DbConfig } from './db'
import { SCHEMA_STATEMENTS } from './schema'
import type { Client, InStatement } from '@libsql/client/web'

const GITHUB_API_BASE = 'https://api.github.com'

/**
 * Repositories processed at once.
 *
 * Each repository costs 4 GitHub GETs, so ~110 repos spend ~440 points against
 * GitHub's 900-points-per-minute secondary rate limit — under the budget, and
 * far below its 100-concurrent-request ceiling.
 */
const DEFAULT_CONCURRENCY = 6

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

interface PopularPath {
  path: string
  title: string
  count: number
  uniques: number
}

interface RepoTrafficSnapshot {
  views: ViewsResponse
  clones: ClonesResponse
  referrers: Referrer[]
  paths: PopularPath[]
}

export interface CollectResult {
  repos: number
  succeeded: number
  failed: string[]
  durationMs: number
}

export interface CollectOptions {
  /** Called with human-readable progress lines. Defaults to a no-op. */
  log?: (message: string) => void
  /** Repositories fetched in parallel. Defaults to 6. */
  concurrency?: number
  /** GitHub token. Falls back to process.env.GITHUB_TOKEN. */
  githubToken?: string
  /** Turso connection. Falls back to process.env.TURSO_*. */
  turso?: DbConfig
}

function buildHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    // GitHub requires a User-Agent on every request; some edge runtimes
    // (e.g. Cloudflare Workers) don't send a default one, causing 403s.
    'User-Agent': 'github-traffic-dashboard',
  }
}

/**
 * GET a GitHub endpoint, backing off once on a secondary rate limit.
 *
 * Running repos in parallel makes bursts likelier than the old serial loop did,
 * and GitHub signals those with `Retry-After` on a 403 or 429.
 */
async function githubJson<T>(url: string, headers: HeadersInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers })
    if (res.ok) return (await res.json()) as T

    const retryAfter = res.headers.get('retry-after')
    const throttled =
      res.status === 429 || (res.status === 403 && retryAfter !== null)

    if (throttled && attempt < 2) {
      const seconds = retryAfter ? Number(retryAfter) : 2 * (attempt + 1)
      const waitMs = Math.min(Number.isFinite(seconds) ? seconds : 2, 10) * 1000
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }

    throw new Error(`${res.status} ${res.statusText} for ${url}`)
  }
}

/** Run `task` over `items`, keeping at most `limit` in flight. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0

  async function worker(): Promise<void> {
    for (let i = next++; i < items.length; i = next++) {
      await task(items[i])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
}

async function getMyRepos(headers: HeadersInit): Promise<Repository[]> {
  const perPage = 100
  const allRepos: Repository[] = []

  for (let page = 1; ; page++) {
    // `full_name` is a stable sort key. `updated` reorders between page
    // requests, which can duplicate or skip repos mid-pagination.
    const repos = await githubJson<Repository[]>(
      `${GITHUB_API_BASE}/user/repos?per_page=${perPage}&page=${page}&sort=full_name&direction=asc&affiliation=owner`,
      headers,
    )
    allRepos.push(...repos)

    // Last page reached when fewer than a full page is returned.
    if (repos.length < perPage) break
  }

  return allRepos.filter((repo) => !repo.fork)
}

async function fetchRepoTraffic(
  repo: string,
  headers: HeadersInit,
): Promise<RepoTrafficSnapshot> {
  const base = `${GITHUB_API_BASE}/repos/${repo}/traffic`

  const [views, clones, referrers, paths] = await Promise.all([
    githubJson<ViewsResponse>(`${base}/views`, headers),
    githubJson<ClonesResponse>(`${base}/clones`, headers),
    githubJson<Referrer[]>(`${base}/popular/referrers`, headers),
    githubJson<PopularPath[]>(`${base}/popular/paths`, headers),
  ])

  return { views, clones, referrers, paths }
}

/**
 * Turn one repository's traffic into the statements that persist it.
 *
 * Views and clones share GitHub's 14-day window and are merged by date, so a
 * date reported by only one of the two endpoints still lands in one row.
 * Timestamps are UTC-midnight aligned, so slicing off the date is safe.
 */
export function buildRepoStatements(
  repo: string,
  collectedOn: string,
  { views, clones, referrers, paths }: RepoTrafficSnapshot,
): InStatement[] {
  interface DailyRow {
    views: number
    visitors: number
    clones: number
    cloneUniques: number
  }

  const daily = new Map<string, DailyRow>()

  function rowFor(timestamp: string): DailyRow {
    const date = timestamp.split('T')[0]
    let row = daily.get(date)
    if (!row) {
      row = { views: 0, visitors: 0, clones: 0, cloneUniques: 0 }
      daily.set(date, row)
    }
    return row
  }

  for (const view of views.views) {
    const row = rowFor(view.timestamp)
    row.views = view.count
    row.visitors = view.uniques
  }

  for (const clone of clones.clones) {
    const row = rowFor(clone.timestamp)
    row.clones = clone.count
    row.cloneUniques = clone.uniques
  }

  const statements: InStatement[] = []

  // Window-level aggregates straight from GitHub. `uniques` is deduplicated
  // across the whole 14-day window, so summing the daily rows would overstate
  // it; this snapshot is the only place the real figure exists.
  statements.push({
    sql: `
      INSERT INTO traffic_totals (repo, date, views, view_uniques, clones, clone_uniques)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo, date) DO UPDATE SET
        views = excluded.views,
        view_uniques = excluded.view_uniques,
        clones = excluded.clones,
        clone_uniques = excluded.clone_uniques
    `,
    args: [
      repo,
      collectedOn,
      views.count,
      views.uniques,
      clones.count,
      clones.uniques,
    ],
  })

  for (const [date, row] of daily) {
    statements.push({
      sql: `
        INSERT INTO daily_traffic (repo, date, views, visitors, clones, clone_uniques)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo, date) DO UPDATE SET
          views = excluded.views,
          visitors = excluded.visitors,
          clones = excluded.clones,
          clone_uniques = excluded.clone_uniques
      `,
      args: [repo, date, row.views, row.visitors, row.clones, row.cloneUniques],
    })
  }

  // Referrers and paths are 14-day rolling aggregates rather than daily
  // figures, so each row is a snapshot stamped with the collection date.
  for (const ref of referrers) {
    statements.push({
      sql: `
        INSERT INTO referrers (repo, date, referrer, count, uniques)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(repo, date, referrer) DO UPDATE SET
          count = excluded.count,
          uniques = excluded.uniques
      `,
      args: [repo, collectedOn, ref.referrer, ref.count, ref.uniques],
    })
  }

  for (const path of paths) {
    statements.push({
      sql: `
        INSERT INTO popular_paths (repo, date, path, title, count, uniques)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo, date, path) DO UPDATE SET
          title = excluded.title,
          count = excluded.count,
          uniques = excluded.uniques
      `,
      args: [
        repo,
        collectedOn,
        path.path,
        path.title,
        path.count,
        path.uniques,
      ],
    })
  }

  return statements
}

/**
 * Record the repositories the account owns right now.
 *
 * Written from the repo listing rather than from traffic results, so a repo
 * whose traffic fetch failed still counts as owned. Readers use the newest
 * `last_seen` to tell current repos from renamed or deleted ones.
 */
function buildRepositoryStatements(
  repos: Repository[],
  collectedOn: string,
): InStatement[] {
  return repos.map((repo) => ({
    sql: `
      INSERT INTO repositories (repo, first_seen, last_seen)
      VALUES (?, ?, ?)
      ON CONFLICT(repo) DO UPDATE SET last_seen = excluded.last_seen
    `,
    args: [repo.full_name, collectedOn, collectedOn],
  }))
}

async function startRun(client: Client, startedAt: string) {
  const result = await client.execute({
    sql: `INSERT INTO collection_runs (started_at) VALUES (?)`,
    args: [startedAt],
  })
  return result.lastInsertRowid
}

async function finishRun(
  client: Client,
  runId: bigint | undefined,
  fields: {
    durationMs: number
    repos: number
    succeeded: number
    failed: string[]
    error?: string
  },
): Promise<void> {
  if (runId === undefined) return

  await client.execute({
    sql: `
      UPDATE collection_runs
      SET finished_at = ?, duration_ms = ?, repos = ?, succeeded = ?,
          failed = ?, failed_repos = ?, error = ?
      WHERE id = ?
    `,
    args: [
      new Date().toISOString(),
      fields.durationMs,
      fields.repos,
      fields.succeeded,
      fields.failed.length,
      fields.failed.join(',') || null,
      fields.error ?? null,
      runId,
    ],
  })
}

/**
 * Fetch traffic for every owned (non-fork) repository and upsert it into Turso.
 *
 * Shared by the CLI collector (`scripts/collect-traffic.ts`) and the Nitro
 * scheduled plugin (`src/nitro/scheduled.ts`) driven by Cloudflare cron.
 *
 * Each repository costs 4 GitHub GETs and a single batched write, and repos run
 * concurrently, so a full pass fits inside a Worker's cron invocation. Every
 * run is recorded in `collection_runs`; a run that dies mid-pass leaves its
 * `finished_at` NULL rather than failing silently.
 *
 * Credentials come from `options`, falling back to `process.env` — the
 * Cloudflare hook passes them explicitly so no `process.env` is required there.
 */
export async function collectTraffic(
  options: CollectOptions = {},
): Promise<CollectResult> {
  const log = options.log ?? (() => {})
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY

  const token = options.githubToken ?? process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set')
  }
  const headers = buildHeaders(token)

  const client = getDbClient(options.turso)
  await client.migrate(SCHEMA_STATEMENTS)

  const startedAtMs = Date.now()
  const collectedOn = new Date(startedAtMs).toISOString().split('T')[0]
  const runId = await startRun(client, new Date(startedAtMs).toISOString())

  const failed: string[] = []
  let repos: Repository[] = []
  let succeeded = 0

  try {
    repos = await getMyRepos(headers)
    log(`Found ${repos.length} repositories`)

    if (repos.length > 0) {
      await client.batch(buildRepositoryStatements(repos, collectedOn), 'write')
    }

    await mapWithConcurrency(repos, concurrency, async (repo) => {
      try {
        const snapshot = await fetchRepoTraffic(repo.full_name, headers)
        const statements = buildRepoStatements(
          repo.full_name,
          collectedOn,
          snapshot,
        )
        if (statements.length > 0) {
          await client.batch(statements, 'write')
        }
        succeeded++
        log(`✓ ${repo.full_name} (${statements.length} rows)`)
      } catch (error) {
        failed.push(repo.full_name)
        log(`✗ ${repo.full_name}: ${String(error)}`)
      }
    })
  } catch (error) {
    await finishRun(client, runId, {
      durationMs: Date.now() - startedAtMs,
      repos: repos.length,
      succeeded,
      failed,
      error: String(error),
    })
    throw error
  }

  const durationMs = Date.now() - startedAtMs
  await finishRun(client, runId, {
    durationMs,
    repos: repos.length,
    succeeded,
    failed,
  })

  return { repos: repos.length, succeeded, failed, durationMs }
}
