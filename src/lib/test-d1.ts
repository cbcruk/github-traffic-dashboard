import { getPlatformProxy } from 'wrangler'

/**
 * A throwaway local D1 database for tests, backed by the same workerd emulation
 * as `pnpm dev`. Nothing is persisted to disk.
 */
export async function createTestDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false })
  return { db: proxy.env.DB, dispose: () => proxy.dispose() }
}
