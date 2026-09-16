import { buildUpsert, runBatch, type Statement } from './db'
import { migrateSchema } from './schema'

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
  private: boolean
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
  /** Repositories owned on the collection date. */
  repos: number
  /** Repositories this invocation collected. */
  succeeded: number
  /** Repositories this invocation tried and failed. */
  failed: string[]
  /** Repositories still waiting for a later invocation. */
  pending: number
  durationMs: number
}

export interface CollectOptions {
  /** Called with human-readable progress lines. Defaults to a no-op. */
  log?: (message: string) => void
  /** Repositories fetched in parallel. Defaults to 6. */
  concurrency?: number
  /** GitHub token. Falls back to process.env.GITHUB_TOKEN. */
  githubToken?: string
  /** The D1 database to write to. */
  db: D1Database
  /**
   * Repositories to collect in this invocation. Omit to collect every
   * repository still pending for the day.
   */
  batchSize?: number
  /** Collect every repository again, even ones already attempted today. */
  force?: boolean
  /** Overridable for tests. */
  now?: Date
  /** Overridable for tests. Defaults to global fetch. */
  fetch?: Fetch
}

/**
 * Repositories per cron invocation.
 *
 * Cloudflare's free plan allows 50 subrequests and 50 D1 queries per
 * invocation. A batch spends 4 GitHub GETs and at most 4 D1 statements per
 * repository, plus 2 GETs for the repository listing on the day's first batch,
 * which leaves room at 7. Collection therefore spreads over the day's
 * invocations instead of stopping partway, as it did on 2026-09-15 and 16.
 */
export const CRON_BATCH_SIZE = 7

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
type Fetch = (request: Request) => Promise<Response>

async function githubJson<T>(
  url: string,
  headers: HeadersInit,
  send: Fetch,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await send(new Request(url, { headers }))
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

async function getMyRepos(
  headers: HeadersInit,
  send: Fetch,
): Promise<Repository[]> {
  const perPage = 100
  const allRepos: Repository[] = []

  for (let page = 1; ; page++) {
    // `full_name` is a stable sort key. `updated` reorders between page
    // requests, which can duplicate or skip repos mid-pagination.
    const repos = await githubJson<Repository[]>(
      `${GITHUB_API_BASE}/user/repos?per_page=${perPage}&page=${page}&sort=full_name&direction=asc&affiliation=owner`,
      headers,
      send,
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
  send: Fetch,
): Promise<RepoTrafficSnapshot> {
  const base = `${GITHUB_API_BASE}/repos/${repo}/traffic`

  const [views, clones, referrers, paths] = await Promise.all([
    githubJson<ViewsResponse>(`${base}/views`, headers, send),
    githubJson<ClonesResponse>(`${base}/clones`, headers, send),
    githubJson<Referrer[]>(`${base}/popular/referrers`, headers, send),
    githubJson<PopularPath[]>(`${base}/popular/paths`, headers, send),
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
): Statement[] {
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

  // Window-level aggregates straight from GitHub. `uniques` is deduplicated
  // across the whole 14-day window, so summing the daily rows would overstate
  // it; this snapshot is the only place the real figure exists.
  const totals = buildUpsert({
    table: 'traffic_totals',
    columns: [
      'repo',
      'date',
      'views',
      'view_uniques',
      'clones',
      'clone_uniques',
    ],
    conflict: ['repo', 'date'],
    rows: [
      [
        repo,
        collectedOn,
        views.count,
        views.uniques,
        clones.count,
        clones.uniques,
      ],
    ],
  })

  const dailyRows = buildUpsert({
    table: 'daily_traffic',
    columns: ['repo', 'date', 'views', 'visitors', 'clones', 'clone_uniques'],
    conflict: ['repo', 'date'],
    rows: Array.from(daily, ([date, row]) => [
      repo,
      date,
      row.views,
      row.visitors,
      row.clones,
      row.cloneUniques,
    ]),
  })

  // Referrers and paths are 14-day rolling aggregates rather than daily
  // figures, so each row is a snapshot stamped with the collection date.
  const referrerRows = buildUpsert({
    table: 'referrers',
    columns: ['repo', 'date', 'referrer', 'count', 'uniques'],
    conflict: ['repo', 'date', 'referrer'],
    rows: referrers.map((ref) => [
      repo,
      collectedOn,
      ref.referrer,
      ref.count,
      ref.uniques,
    ]),
  })

  const pathRows = buildUpsert({
    table: 'popular_paths',
    columns: ['repo', 'date', 'path', 'title', 'count', 'uniques'],
    conflict: ['repo', 'date', 'path'],
    rows: paths.map((path) => [
      repo,
      collectedOn,
      path.path,
      path.title,
      path.count,
      path.uniques,
    ]),
  })

  return [...totals, ...dailyRows, ...referrerRows, ...pathRows]
}

/**
 * Record the repositories the account owns right now.
 *
 * Written from the repo listing rather than from traffic results, so a repo
 * whose traffic fetch failed still counts as owned. Readers use the newest
 * `last_seen` to tell current repos from renamed or deleted ones, and
 * `private` to keep private repos off a public dashboard.
 */
export function buildRepositoryStatements(
  repos: Pick<Repository, 'full_name' | 'private'>[],
  collectedOn: string,
): Statement[] {
  return buildUpsert({
    table: 'repositories',
    columns: ['repo', 'first_seen', 'last_seen', 'private'],
    conflict: ['repo'],
    update: ['last_seen', 'private'],
    rows: repos.map((repo) => [
      repo.full_name,
      collectedOn,
      collectedOn,
      repo.private ? 1 : 0,
    ]),
  })
}

/** The day's run row, created on its first batch. */
interface Run {
  id: number
  startedAt: string
  finishedAt: string | null
}

async function ensureRun(
  db: D1Database,
  collectedOn: string,
  now: Date,
): Promise<Run> {
  const existing = await db
    .prepare(
      `SELECT id, started_at AS startedAt, finished_at AS finishedAt
       FROM collection_runs WHERE collected_on = ?`,
    )
    .bind(collectedOn)
    .first<Run>()
  if (existing) return existing

  const startedAt = now.toISOString()
  const { meta } = await db
    .prepare(
      `INSERT INTO collection_runs (started_at, collected_on, last_batch_at)
       VALUES (?, ?, ?)`,
    )
    .bind(startedAt, collectedOn, startedAt)
    .run()
  return { id: meta.last_row_id, startedAt, finishedAt: null }
}

/** Repositories owned on `collectedOn` that no batch has attempted yet. */
async function pendingRepos(
  db: D1Database,
  collectedOn: string,
  limit: number,
  force: boolean,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `
      SELECT repo FROM repositories
      WHERE last_seen = ?1
        ${force ? '' : `AND repo NOT IN (SELECT repo FROM collection_attempts WHERE collected_on = ?1)`}
      ORDER BY repo
      LIMIT ?2
    `,
    )
    .bind(collectedOn, limit)
    .all<{ repo: string }>()
  return results.map((row) => row.repo)
}

async function countRepos(
  db: D1Database,
  sql: string,
  collectedOn: string,
): Promise<number> {
  return (await db.prepare(sql).bind(collectedOn).first<number>('n')) ?? 0
}

function buildAttemptStatements(
  collectedOn: string,
  attemptedAt: string,
  outcomes: { repo: string; succeeded: boolean }[],
): Statement[] {
  return buildUpsert({
    table: 'collection_attempts',
    columns: ['collected_on', 'repo', 'attempted_at', 'succeeded'],
    conflict: ['collected_on', 'repo'],
    rows: outcomes.map(({ repo, succeeded }) => [
      collectedOn,
      repo,
      attemptedAt,
      succeeded ? 1 : 0,
    ]),
  })
}

/** Fold one batch's outcome into the day's run row. */
async function recordBatch(
  db: D1Database,
  run: Run,
  fields: {
    now: Date
    repos: number
    succeeded: number
    failed: string[]
    done: boolean
    error?: string | null
  },
): Promise<void> {
  const now = fields.now.toISOString()
  await db
    .prepare(
      `
      UPDATE collection_runs
      SET repos = ?,
          succeeded = succeeded + ?,
          failed = failed + ?,
          failed_repos = CASE
            WHEN ? = '' THEN failed_repos
            WHEN failed_repos IS NULL THEN ?
            ELSE failed_repos || ',' || ?
          END,
          error = ?,
          last_batch_at = ?,
          finished_at = CASE WHEN ? THEN ? ELSE finished_at END,
          duration_ms = CASE WHEN ? THEN ? ELSE duration_ms END
      WHERE id = ?
    `,
    )
    .bind(
      fields.repos,
      fields.succeeded,
      fields.failed.length,
      fields.failed.join(','),
      fields.failed.join(','),
      fields.failed.join(','),
      fields.error ?? null,
      now,
      fields.done ? 1 : 0,
      now,
      fields.done ? 1 : 0,
      fields.now.getTime() - new Date(run.startedAt).getTime(),
      run.id,
    )
    .run()
}

/**
 * Collect traffic for the repositories still pending today, up to `batchSize`.
 *
 * Shared by the CLI collector (`scripts/collect-traffic.ts`), which collects
 * everything at once, and the Nitro scheduled plugin (`src/nitro/scheduled.ts`)
 * driven by Cloudflare cron, which collects a batch per invocation so a run
 * stays inside the platform's per-invocation subrequest and query limits.
 *
 * The day's first batch lists the account's repositories into `repositories`;
 * later batches read that list back. Every repository is attempted once per
 * collection date (`collection_attempts`), so a failure is not retried in the
 * same day and cannot block the rest.
 *
 * All batches share one `collection_runs` row per collection date, which is
 * marked finished by whichever batch collects the last pending repository.
 *
 * The GitHub token comes from `options`, falling back to `process.env` — the
 * Cloudflare hook passes it explicitly so no `process.env` is required there.
 */
export async function collectTraffic(
  options: CollectOptions,
): Promise<CollectResult> {
  const log = options.log ?? (() => {})
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const send = options.fetch ?? ((request: Request) => fetch(request))

  const token = options.githubToken ?? process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set')
  }
  const headers = buildHeaders(token)

  const { db } = options
  await migrateSchema(db)

  const startedAtMs = Date.now()
  const now = options.now ?? new Date(startedAtMs)
  const collectedOn = now.toISOString().split('T')[0]
  const run = await ensureRun(db, collectedOn, now)

  const ownedSql = `SELECT COUNT(*) AS n FROM repositories WHERE last_seen = ?`
  const attemptedSql = `SELECT COUNT(*) AS n FROM collection_attempts WHERE collected_on = ?`

  let repos = await countRepos(db, ownedSql, collectedOn)
  const failed: string[] = []
  let succeeded = 0

  try {
    if (repos === 0) {
      const owned = await getMyRepos(headers, send)
      await runBatch(db, buildRepositoryStatements(owned, collectedOn))
      repos = owned.length
      log(`Found ${repos} repositories`)
    }
  } catch (error) {
    await recordBatch(db, run, {
      now: new Date(),
      repos,
      succeeded,
      failed,
      done: false,
      error: String(error),
    })
    throw error
  }

  const batch = await pendingRepos(
    db,
    collectedOn,
    // SQLite reads a negative LIMIT as no limit.
    options.batchSize ?? -1,
    options.force ?? false,
  )

  const outcomes: { repo: string; succeeded: boolean }[] = []
  await mapWithConcurrency(batch, concurrency, async (repo) => {
    try {
      const snapshot = await fetchRepoTraffic(repo, headers, send)
      const statements = buildRepoStatements(repo, collectedOn, snapshot)
      await runBatch(db, statements)
      succeeded++
      outcomes.push({ repo, succeeded: true })
      log(`✓ ${repo} (${statements.length} rows)`)
    } catch (error) {
      failed.push(repo)
      outcomes.push({ repo, succeeded: false })
      log(`✗ ${repo}: ${String(error)}`)
    }
  })

  if (outcomes.length > 0) {
    const attemptedAt = new Date().toISOString()
    await runBatch(
      db,
      buildAttemptStatements(collectedOn, attemptedAt, outcomes),
    )
  }

  const pending = repos - (await countRepos(db, attemptedSql, collectedOn))
  const finishedNow = new Date()

  // An invocation after the day is complete leaves the run row alone, so its
  // finished_at keeps pointing at the batch that actually completed it.
  if (outcomes.length === 0 && pending <= 0 && run.finishedAt !== null) {
    log(`Nothing pending for ${collectedOn}`)
    return {
      repos,
      succeeded,
      failed,
      pending: 0,
      durationMs: finishedNow.getTime() - startedAtMs,
    }
  }

  await recordBatch(db, run, {
    now: finishedNow,
    repos,
    succeeded,
    failed,
    done: pending <= 0,
    error: null,
  })

  return {
    repos,
    succeeded,
    failed,
    pending: Math.max(pending, 0),
    durationMs: finishedNow.getTime() - startedAtMs,
  }
}
