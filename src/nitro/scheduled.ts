import type { NitroAppPlugin } from 'nitro/types'
import { collectTraffic } from '../lib/collect-traffic'

interface CloudflareEnv {
  GITHUB_TOKEN?: string
  TURSO_DATABASE_URL?: string
  TURSO_AUTH_TOKEN?: string
}

/**
 * Nitro plugin that runs traffic collection on the Cloudflare cron trigger.
 *
 * The Cloudflare Workers preset invokes `scheduled(controller, env, ctx)` and
 * fires the `cloudflare:scheduled` hook. We read secrets straight off `env`
 * (Cloudflare bindings) and pass them to the shared collector, so this path
 * does not depend on `process.env`.
 *
 * The cron schedule is defined in vite.config.ts (`cloudflare.wrangler.triggers`).
 *
 * `defineNitroPlugin` is just an identity helper, so a plain default-exported
 * function typed as NitroAppPlugin is equivalent and avoids an extra import.
 */
const plugin: NitroAppPlugin = (nitroApp) => {
  nitroApp.hooks.hook(
    'cloudflare:scheduled',
    async ({ env }: { env: unknown }) => {
      const e = (env ?? {}) as CloudflareEnv
      try {
        const result = await collectTraffic({
          githubToken: e.GITHUB_TOKEN,
          turso: {
            url: e.TURSO_DATABASE_URL,
            authToken: e.TURSO_AUTH_TOKEN,
          },
          log: (msg) => console.log(msg),
        })
        console.log(
          `Scheduled collection completed: ${result.succeeded}/${result.repos} succeeded` +
            (result.failed.length
              ? `, failed: ${result.failed.join(', ')}`
              : ''),
        )
      } catch (error) {
        console.error('Scheduled collection failed:', error)
      }
    },
  )
}

export default plugin
