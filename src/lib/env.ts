import { migrateSchema } from './schema'

/**
 * This isolate's schema check, shared by concurrent requests and cleared if it
 * fails so the next request retries.
 */
let migrated: Promise<void> | undefined

/**
 * The D1 binding declared in wrangler.jsonc.
 *
 * Nitro's Cloudflare handler stores the Worker `env` on `globalThis.__env__`
 * for every request and cron event, and its dev plugin does the same with
 * wrangler's local emulation under `pnpm dev`, so server functions read the
 * database the same way in both. (`import { env } from 'cloudflare:workers'`
 * would be the usual route, but TanStack Start's SSR build cannot resolve it.)
 * The cron handler receives `env` directly and does not need this.
 *
 * Pending migrations are applied before the first query in each isolate, so a
 * fresh deployment reads a current schema without waiting for the next cron
 * run. After a check has succeeded, later calls cost nothing; a failed one is
 * retried on the next call.
 */
export async function getDb(): Promise<D1Database> {
  const env = (globalThis as { __env__?: { DB?: D1Database } }).__env__
  if (!env?.DB) {
    throw new Error('D1 binding `DB` is not configured (see wrangler.jsonc)')
  }
  const db = env.DB
  migrated ??= migrateSchema(db).then(
    () => {},
    (error) => {
      migrated = undefined
      throw error
    },
  )
  await migrated
  return db
}
