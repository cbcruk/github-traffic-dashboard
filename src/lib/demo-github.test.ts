import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectTraffic } from './collect-traffic'
import {
  DEMO_BATCH_SIZE,
  DEMO_HISTORY_DAYS,
  createDemoGitHub,
} from './demo-github'
import { migrateSchema } from './schema'
import { createTestDb } from './test-d1'

describe('demo GitHub', () => {
  let db: D1Database
  let dispose: () => Promise<void>

  beforeEach(async () => {
    ;({ db, dispose } = await createTestDb())
    await migrateSchema(db)
  })

  afterEach(async () => {
    await dispose()
  })

  const collectOn = (date: string, batchSize?: number) => {
    const now = new Date(`${date}T03:00:00Z`)
    return collectTraffic({
      db,
      githubToken: 'demo',
      fetch: createDemoGitHub(() => now),
      now,
      batchSize,
    })
  }

  const dailyRow = (repo: string, date: string) =>
    db
      .prepare(
        `SELECT views, clones FROM daily_traffic WHERE repo = ? AND date = ?`,
      )
      .bind(repo, date)
      .first()

  it('fills public repositories with history back to the start of the window', async () => {
    const result = await collectOn('2026-09-30')

    expect(result).toMatchObject({ repos: 8, succeeded: 8, failed: [] })
    expect(
      await db
        .prepare(
          `SELECT COUNT(DISTINCT date) AS days, MIN(date) AS first
           FROM daily_traffic WHERE repo = 'demo/awesome-cli'`,
        )
        .first(),
    ).toEqual({ days: DEMO_HISTORY_DAYS, first: '2026-07-03' })
    expect(
      await db
        .prepare(`SELECT COUNT(*) AS n FROM repositories WHERE private = 0`)
        .first('n'),
    ).toBe(8)
  })

  it('keeps the numbers for a date when collected again on a later day', async () => {
    await collectOn('2026-09-30')
    const before = await dailyRow('demo/awesome-cli', '2026-09-20')

    await collectOn('2026-10-01')

    expect(await dailyRow('demo/awesome-cli', '2026-09-20')).toEqual(before)
  })

  it('finishes the day across cron-sized batches', async () => {
    const pending = []
    for (let i = 0; i < 3; i++) {
      pending.push((await collectOn('2026-09-30', DEMO_BATCH_SIZE)).pending)
    }

    expect(pending).toEqual([5, 2, 0])
  })

  it('answers only the endpoints the collector calls', async () => {
    const fetch = createDemoGitHub()

    const responses = await Promise.all(
      [
        '/repos/demo/unknown/traffic/views',
        '/repos/someone/awesome-cli/traffic/views',
        '/user/orgs',
      ].map((path) => fetch(new Request(`https://api.github.com${path}`))),
    )

    expect(responses.map((r) => r.status)).toEqual([404, 404, 404])
  })
})
