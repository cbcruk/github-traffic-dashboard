import { collectTraffic } from '../src/lib/collect-traffic'
import { DEMO_OWNER, createDemoGitHub } from '../src/lib/demo-github'
import { parseRepoSelection } from '../src/lib/repo-selection'
import { migrateSchema } from '../src/lib/schema'
import { withLocalDb } from './local-db'

async function main(): Promise<void> {
  const force = process.argv.includes('--force')

  const result = await withLocalDb(async (db) => {
    await migrateSchema(db)

    // Demo repositories would sit beside real ones collected the same day.
    const real = await db
      .prepare(`SELECT COUNT(*) AS n FROM repositories WHERE repo NOT LIKE ?`)
      .bind(`${DEMO_OWNER}/%`)
      .first<number>('n')
    if (real && !force) {
      throw new Error(
        `The local database already has ${real} real repositories. ` +
          'Delete .wrangler/state to start fresh, or pass --force to mix them.',
      )
    }

    return collectTraffic({
      db,
      githubToken: 'demo',
      fetch: createDemoGitHub(),
      // Ignore GITHUB_ORGS and the like in .env; the demo API knows none.
      selection: parseRepoSelection({}),
      force: true,
      log: (msg) => console.log(msg),
    })
  })

  console.log(
    `Wrote demo traffic for ${result.succeeded} repositories. ` +
      'Run `pnpm dev` with DEMO_MODE=true to see it labeled as demo data.',
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
