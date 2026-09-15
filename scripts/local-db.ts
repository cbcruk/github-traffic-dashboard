import { getPlatformProxy } from 'wrangler'

/**
 * Run `task` against the local D1 database that `pnpm dev` also uses.
 *
 * Both go through wrangler's local emulation with the default persistence
 * directory (`.wrangler/state/v3`), so data written here shows up in the dev
 * server.
 */
export async function withLocalDb<T>(
  task: (db: D1Database) => Promise<T>,
): Promise<T> {
  const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>()
  try {
    return await task(env.DB)
  } finally {
    await dispose()
  }
}
