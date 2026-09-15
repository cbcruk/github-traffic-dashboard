/**
 * The D1 binding declared in wrangler.jsonc.
 *
 * Nitro's Cloudflare handler stores the Worker `env` on `globalThis.__env__`
 * for every request and cron event, and its dev plugin does the same with
 * wrangler's local emulation under `pnpm dev`, so server functions read the
 * database the same way in both. (`import { env } from 'cloudflare:workers'`
 * would be the usual route, but TanStack Start's SSR build cannot resolve it.)
 * The cron handler receives `env` directly and does not need this.
 */
export function getDb(): D1Database {
  const env = (globalThis as { __env__?: { DB?: D1Database } }).__env__
  if (!env?.DB) {
    throw new Error('D1 binding `DB` is not configured (see wrangler.jsonc)')
  }
  return env.DB
}
