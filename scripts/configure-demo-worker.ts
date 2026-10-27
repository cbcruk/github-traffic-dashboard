import { readFile, writeFile } from 'node:fs/promises'

/**
 * Turn the built Worker config into a demo Worker's (`pnpm build:demo`).
 *
 * The demo gets its own Worker name and D1 database, so it can live in the
 * same Cloudflare account as a real deployment without touching its data, and
 * `DEMO_MODE` is set in the config so no secret is needed.
 *
 * This edits Nitro's generated `.output/server/wrangler.json` rather than
 * passing `cloudflare.wrangler` in vite.config.ts, because Nitro merges that
 * option with defu, which appends to `d1_databases` instead of replacing it.
 */

export const DEMO_WORKER_NAME = 'github-traffic-dashboard-demo'
export const DEMO_DATABASE_NAME = 'github-traffic-dashboard-demo'

const CONFIG_PATH = '.output/server/wrangler.json'

interface WorkerConfig {
  name?: string
  vars?: Record<string, string>
  d1_databases?: { binding: string; database_name?: string }[]
}

export function demoWorkerConfig<T extends WorkerConfig>(config: T): T {
  const databases = config.d1_databases ?? []
  if (!databases.some((db) => db.binding === 'DB')) {
    throw new Error('The built config has no `DB` binding (see wrangler.jsonc)')
  }

  return {
    ...config,
    name: DEMO_WORKER_NAME,
    vars: { ...config.vars, DEMO_MODE: 'true' },
    d1_databases: databases.map((db) =>
      db.binding === 'DB' ? { ...db, database_name: DEMO_DATABASE_NAME } : db,
    ),
  }
}

async function main(): Promise<void> {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
  await writeFile(
    CONFIG_PATH,
    JSON.stringify(demoWorkerConfig(config), null, 2),
  )
  console.log(
    `Configured ${CONFIG_PATH} as the demo Worker \`${DEMO_WORKER_NAME}\` ` +
      `with D1 database \`${DEMO_DATABASE_NAME}\`.`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
