import type { NitroAppPlugin } from 'nitro/types'
import { collectTraffic } from '../lib/collect-traffic'
import {
  HEALTH_CHECK_CRON,
  checkCollectionHealth,
} from '../lib/collection-health'

interface CloudflareEnv {
  GITHUB_TOKEN?: string
  ALERT_WEBHOOK_URL?: string
  ALERT_GITHUB_REPO?: string
  DB?: D1Database
}

/**
 * Nitro plugin that runs traffic collection on the Cloudflare cron trigger.
 *
 * The Cloudflare Workers preset invokes `scheduled(controller, env, ctx)` and
 * fires the `cloudflare:scheduled` hook. We read the token and the D1 binding
 * straight off `env` and pass them to the shared collector, so this path does
 * not depend on `process.env`.
 *
 * The cron schedules are defined in wrangler.jsonc (`triggers.crons`). The
 * `HEALTH_CHECK_CRON` trigger checks recent runs and alerts instead of
 * collecting; every other trigger collects.
 *
 * `defineNitroPlugin` is just an identity helper, so a plain default-exported
 * function typed as NitroAppPlugin is equivalent and avoids an extra import.
 */
const plugin: NitroAppPlugin = (nitroApp) => {
  nitroApp.hooks.hook(
    'cloudflare:scheduled',
    async ({
      controller,
      env,
    }: {
      controller: ScheduledController
      env: unknown
    }) => {
      const e = (env ?? {}) as CloudflareEnv
      try {
        if (!e.DB) {
          throw new Error(
            'D1 binding `DB` is not configured (see wrangler.jsonc)',
          )
        }
        if (controller.cron === HEALTH_CHECK_CRON) {
          await checkCollectionHealth({
            db: e.DB,
            webhookUrl: e.ALERT_WEBHOOK_URL,
            issueRepo: e.ALERT_GITHUB_REPO,
            githubToken: e.GITHUB_TOKEN,
            log: (msg) => console.log(msg),
          })
          return
        }
        const result = await collectTraffic({
          githubToken: e.GITHUB_TOKEN,
          db: e.DB,
          log: (msg) => console.log(msg),
        })
        console.log(
          `Scheduled collection completed in ${(result.durationMs / 1000).toFixed(1)}s: ` +
            `${result.succeeded}/${result.repos} succeeded` +
            (result.failed.length
              ? `, failed: ${result.failed.join(', ')}`
              : ''),
        )
      } catch (error) {
        console.error(`Scheduled task for "${controller.cron}" failed:`, error)
      }
    },
  )
}

export default plugin
