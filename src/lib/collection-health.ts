import { migrateSchema } from './schema'

/**
 * Collection health: whether the daily cron is actually collecting.
 *
 * GitHub keeps traffic for 14 days, so a collector that silently stops loses
 * data for good. From 2026-07-15 to late August runs collected only 1-3
 * repositories and nobody noticed for six weeks (#6). `collection_runs`
 * records every run; this reads it back, and a second daily cron sends what it
 * finds to a webhook.
 */

/**
 * The cron expression that runs the health check instead of a collection.
 * Must also be listed in wrangler.jsonc `triggers.crons`; any other trigger
 * collects.
 */
export const HEALTH_CHECK_CRON = '0 6 * * *'

/**
 * A daily cron that has not started a run in this long has stopped. Above 24
 * hours so an ordinary daily gap is fine, and below the 30 hours the 06:00
 * check sees when that day's 00:00 run never started.
 */
const STALE_AFTER_HOURS = 26

/** A run still unfinished after this long was killed mid-flight. */
const INTERRUPTED_AFTER_MINUTES = 60

/**
 * A finished run that succeeded for fewer than this share of the repositories
 * the previous clean run did. Catches the partial collection behind #6.
 */
const SUCCESS_DROP_RATIO = 0.5

export interface CollectionRun {
  startedAt: string
  finishedAt: string | null
  repos: number
  succeeded: number
  failed: number
  failedRepos: string | null
  error: string | null
}

export type CollectionStatus =
  | 'never' // no run recorded yet, e.g. before a new deployment's first cron
  | 'running'
  | 'ok'
  | 'degraded' // the run finished, but not for every repository
  | 'failed' // the run did not finish, errored, or never started

export interface CollectionHealth {
  status: CollectionStatus
  lastRun: CollectionRun | null
  /**
   * What is wrong, for the webhook and logs. May name repositories (private
   * ones included) and quote errors, so never send it to the public page.
   */
  problems: string[]
}

function hoursBetween(from: string, to: Date): number {
  return (to.getTime() - new Date(from).getTime()) / 3_600_000
}

/** Judge the most recent runs, newest first. */
export function assessCollection(
  runs: CollectionRun[],
  now: Date,
): CollectionHealth {
  const [lastRun, ...earlier] = runs
  if (!lastRun) return { status: 'never', lastRun: null, problems: [] }

  const failures: string[] = []
  const warnings: string[] = []
  const age = hoursBetween(lastRun.startedAt, now)

  if (age > STALE_AFTER_HOURS) {
    failures.push(
      `No collection has started in ${Math.floor(age)} hours (last: ${lastRun.startedAt}).`,
    )
  }

  if (lastRun.finishedAt === null) {
    if (age * 60 < INTERRUPTED_AFTER_MINUTES) {
      return { status: 'running', lastRun, problems: [] }
    }
    failures.push(
      `The run started at ${lastRun.startedAt} never finished; it was likely killed mid-flight.`,
    )
  } else {
    if (lastRun.error !== null) {
      failures.push(`The latest run stopped with an error: ${lastRun.error}`)
    }
    if (lastRun.failed > 0) {
      warnings.push(
        `${lastRun.failed} of ${lastRun.repos} repositories failed: ${lastRun.failedRepos ?? 'unknown'}`,
      )
    }

    const previous = earlier.find(
      (run) => run.finishedAt !== null && run.error === null,
    )
    if (
      previous &&
      lastRun.error === null &&
      lastRun.succeeded < previous.succeeded * SUCCESS_DROP_RATIO
    ) {
      warnings.push(
        `Only ${lastRun.succeeded} repositories succeeded, down from ${previous.succeeded} in the previous run.`,
      )
    }
  }

  const status =
    failures.length > 0 ? 'failed' : warnings.length > 0 ? 'degraded' : 'ok'
  return { status, lastRun, problems: [...failures, ...warnings] }
}

/** Enough history to find the previous clean run behind a few bad ones. */
const RECENT_RUNS = 10

export async function loadRecentRuns(db: D1Database): Promise<CollectionRun[]> {
  const { results } = await db
    .prepare(
      `
      SELECT started_at AS startedAt, finished_at AS finishedAt, repos,
             succeeded, failed, failed_repos AS failedRepos, error
      FROM collection_runs
      ORDER BY started_at DESC
      LIMIT ?
    `,
    )
    .bind(RECENT_RUNS)
    .all<CollectionRun>()
  return results
}

/**
 * The request that posts `message` to a webhook.
 *
 * Discord and Slack incoming webhooks each require their own JSON field; any
 * other URL (ntfy, a custom endpoint) gets the message as plain text.
 */
export function buildWebhookRequest(
  webhookUrl: string,
  message: string,
): Request {
  const { hostname } = new URL(webhookUrl)

  if (hostname === 'discord.com' || hostname === 'discordapp.com') {
    // Discord rejects content over 2000 characters.
    const content =
      message.length > 2000 ? `${message.slice(0, 1997)}...` : message
    return jsonRequest(webhookUrl, { content })
  }
  if (hostname === 'hooks.slack.com') {
    return jsonRequest(webhookUrl, { text: message })
  }
  return new Request(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: message,
  })
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function formatAlert(health: CollectionHealth): string {
  const heading =
    health.status === 'failed'
      ? 'GitHub traffic collection is failing.'
      : 'GitHub traffic collection is incomplete.'
  return [
    heading,
    ...health.problems.map((problem) => `- ${problem}`),
    'GitHub keeps traffic for 14 days, so days missed past that are lost.',
  ].join('\n')
}

interface HealthCheckOptions {
  db: D1Database
  /** Where to report problems. Without one the check only logs. */
  webhookUrl?: string
  now?: Date
  log?: (message: string) => void
  fetch?: (request: Request) => Promise<Response>
}

/** Assess recent runs and report a failed or degraded collection. */
export async function checkCollectionHealth({
  db,
  webhookUrl,
  now = new Date(),
  log = () => {},
  fetch: send = (request) => fetch(request),
}: HealthCheckOptions): Promise<CollectionHealth> {
  await migrateSchema(db)
  const health = assessCollection(await loadRecentRuns(db), now)

  if (health.status !== 'failed' && health.status !== 'degraded') {
    log(`Collection health: ${health.status}`)
    return health
  }

  const message = formatAlert(health)
  log(message)
  if (!webhookUrl) {
    log('ALERT_WEBHOOK_URL is not set; not sending an alert.')
    return health
  }

  const response = await send(buildWebhookRequest(webhookUrl, message))
  if (!response.ok) {
    throw new Error(
      `Alert webhook responded ${response.status}: ${await response.text()}`,
    )
  }
  return health
}
