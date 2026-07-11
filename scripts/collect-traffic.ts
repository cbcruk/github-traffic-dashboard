import 'dotenv/config'
import { collectTraffic } from '../src/lib/collect-traffic'

async function main(): Promise<void> {
  console.log('Starting traffic data collection...')

  const result = await collectTraffic({ log: (msg) => console.log(msg) })

  console.log(
    `Traffic data collection completed! ${result.succeeded}/${result.repos} repositories succeeded.`,
  )
  if (result.failed.length > 0) {
    console.log(`Failed: ${result.failed.join(', ')}`)
  }
}

main().catch(console.error)
