import 'dotenv/config'
import { collectTraffic } from '../src/lib/collect-traffic'
import { withLocalDb } from './local-db'

async function main(): Promise<void> {
  console.log('Starting traffic data collection into the local D1 database...')

  const result = await withLocalDb((db) =>
    // No batching locally: Node has no per-invocation subrequest budget, and
    // `force` re-collects repositories the deployed cron already did today.
    collectTraffic({ db, force: true, log: (msg) => console.log(msg) }),
  )

  console.log(
    `Traffic data collection completed in ${(result.durationMs / 1000).toFixed(1)}s! ` +
      `${result.succeeded}/${result.repos} repositories succeeded.`,
  )
  if (result.failed.length > 0) {
    console.log(`Failed: ${result.failed.join(', ')}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
