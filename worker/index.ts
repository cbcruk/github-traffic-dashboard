import { collectTraffic } from '../src/lib/collect-traffic'

export interface Env {
  GITHUB_TOKEN: string
  TURSO_DATABASE_URL: string
  TURSO_AUTH_TOKEN: string
}

/**
 * Cloudflare Worker that collects GitHub traffic into Turso on a cron schedule.
 *
 * The schedule is defined in wrangler.toml (`[triggers] crons`). Cloudflare
 * cron triggers are not subject to GitHub's 60-day inactivity auto-disable.
 *
 * With `nodejs_compat` enabled, the Worker's secrets are exposed on
 * `process.env`, which is what the shared `collectTraffic` code reads.
 */
export default {
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Mirror bindings onto process.env for the shared collector code.
    process.env.GITHUB_TOKEN = env.GITHUB_TOKEN
    process.env.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL
    process.env.TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN

    ctx.waitUntil(
      collectTraffic({ log: (msg) => console.log(msg) })
        .then((result) => {
          console.log(
            `Collection completed: ${result.succeeded}/${result.repos} succeeded` +
              (result.failed.length
                ? `, failed: ${result.failed.join(', ')}`
                : ''),
          )
        })
        .catch((error) => {
          console.error('Collection failed:', error)
        }),
    )
  },

  // Optional: allow manual runs via HTTP (e.g. `curl https://<worker-url>/`).
  async fetch(
    _request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    process.env.GITHUB_TOKEN = env.GITHUB_TOKEN
    process.env.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL
    process.env.TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN

    try {
      const result = await collectTraffic()
      return Response.json({ ok: true, ...result })
    } catch (error) {
      return Response.json({ ok: false, error: String(error) }, { status: 500 })
    }
  },
}
