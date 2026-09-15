import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HEALTH_CHECK_CRON,
  assessCollection,
  buildWebhookRequest,
  checkCollectionHealth,
  type CollectionRun,
} from './collection-health'
import { migrateSchema } from './schema'
import { createTestDb } from './test-d1'

const now = new Date('2026-09-16T06:00:00Z')

function run(overrides: Partial<CollectionRun> = {}): CollectionRun {
  return {
    startedAt: '2026-09-16T00:00:00Z',
    finishedAt: '2026-09-16T00:01:30Z',
    repos: 110,
    succeeded: 110,
    failed: 0,
    failedRepos: null,
    error: null,
    ...overrides,
  }
}

describe('assessCollection', () => {
  it('is ok when the latest run finished for every repository', () => {
    expect(assessCollection([run()], now)).toMatchObject({
      status: 'ok',
      problems: [],
    })
  })

  it('reports a database with no runs as never collected, not failed', () => {
    expect(assessCollection([], now).status).toBe('never')
  })

  it('treats a recent unfinished run as running', () => {
    const started = run({
      startedAt: '2026-09-16T05:50:00Z',
      finishedAt: null,
    })

    expect(assessCollection([started], now).status).toBe('running')
  })

  it('fails a run that never finished', () => {
    const killed = run({ finishedAt: null })

    const health = assessCollection([killed], now)

    expect(health.status).toBe('failed')
    expect(health.problems[0]).toMatch(/never finished/)
  })

  it('fails when the daily run did not start', () => {
    const yesterday = run({
      startedAt: '2026-09-15T00:00:00Z',
      finishedAt: '2026-09-15T00:01:30Z',
    })

    const health = assessCollection([yesterday], now)

    expect(health.status).toBe('failed')
    expect(health.problems[0]).toMatch(/No collection has started in 30 hours/)
  })

  it('fails a run that stopped with an error', () => {
    const errored = run({ error: 'GitHub API error: 401', succeeded: 0 })

    expect(assessCollection([errored], now).status).toBe('failed')
  })

  it('flags failed repositories as degraded and names them', () => {
    const partial = run({ succeeded: 108, failed: 2, failedRepos: 'me/a,me/b' })

    const health = assessCollection([partial], now)

    expect(health.status).toBe('degraded')
    expect(health.problems[0]).toBe('2 of 110 repositories failed: me/a,me/b')
  })

  it('flags a sharp drop in successful repositories, as in #6', () => {
    const shrunk = run({ repos: 3, succeeded: 3 })
    const previous = run({
      startedAt: '2026-09-15T00:00:00Z',
      finishedAt: '2026-09-15T00:01:30Z',
    })

    const health = assessCollection([shrunk, previous], now)

    expect(health.status).toBe('degraded')
    expect(health.problems[0]).toMatch(
      /Only 3 repositories succeeded, down from 110/,
    )
  })

  it('compares against the last clean run, skipping failed ones', () => {
    const latest = run({ succeeded: 100 })
    const errored = run({ succeeded: 0, error: 'boom' })
    const clean = run({ succeeded: 110 })

    expect(assessCollection([latest, errored, clean], now).status).toBe('ok')
  })
})

describe('buildWebhookRequest', () => {
  it('sends Discord its content field, within its length limit', async () => {
    const request = buildWebhookRequest(
      'https://discord.com/api/webhooks/1/abc',
      'x'.repeat(2500),
    )

    const body = (await request.json()) as { content: string }
    expect(body.content).toHaveLength(2000)
  })

  it('sends Slack its text field', async () => {
    const request = buildWebhookRequest(
      'https://hooks.slack.com/services/T/B/X',
      'hello',
    )

    expect(await request.json()).toEqual({ text: 'hello' })
  })

  it('sends any other endpoint plain text', async () => {
    const request = buildWebhookRequest('https://ntfy.sh/my-topic', 'hello')

    expect(request.headers.get('Content-Type')).toMatch(/^text\/plain/)
    expect(await request.text()).toBe('hello')
  })
})

describe('checkCollectionHealth', () => {
  let dispose: (() => Promise<void>) | undefined

  afterEach(async () => {
    await dispose?.()
    dispose = undefined
  })

  async function dbWithRun(values: string) {
    const test = await createTestDb()
    dispose = test.dispose
    await migrateSchema(test.db)
    await test.db
      .prepare(
        `INSERT INTO collection_runs
           (started_at, finished_at, repos, succeeded, failed, failed_repos, error)
         VALUES ${values}`,
      )
      .run()
    return test.db
  }

  it('posts problems to the webhook', async () => {
    const db = await dbWithRun(
      `('2026-09-16T00:00:00Z', NULL, 0, 0, 0, NULL, NULL)`,
    )
    const sent: Request[] = []

    const health = await checkCollectionHealth({
      db,
      webhookUrl: 'https://ntfy.sh/topic',
      now,
      fetch: async (request) => {
        sent.push(request)
        return new Response('ok')
      },
    })

    expect(health.status).toBe('failed')
    expect(sent).toHaveLength(1)
    expect(await sent[0].text()).toMatch(/collection is failing/)
  })

  it('stays quiet when collection is healthy', async () => {
    const db = await dbWithRun(
      `('2026-09-16T00:00:00Z', '2026-09-16T00:01:30Z', 110, 110, 0, NULL, NULL)`,
    )
    const sent: Request[] = []

    await checkCollectionHealth({
      db,
      webhookUrl: 'https://ntfy.sh/topic',
      now,
      fetch: async (request) => {
        sent.push(request)
        return new Response('ok')
      },
    })

    expect(sent).toHaveLength(0)
  })

  it('surfaces a webhook that rejects the alert', async () => {
    const db = await dbWithRun(
      `('2026-09-16T00:00:00Z', NULL, 0, 0, 0, NULL, NULL)`,
    )

    await expect(
      checkCollectionHealth({
        db,
        webhookUrl: 'https://ntfy.sh/topic',
        now,
        fetch: async () => new Response('nope', { status: 403 }),
      }),
    ).rejects.toThrow(/responded 403/)
  })
})

describe('HEALTH_CHECK_CRON', () => {
  it('is registered as a trigger in wrangler.jsonc', async () => {
    const config = await readFile('wrangler.jsonc', 'utf8')

    expect(config).toContain(`"${HEALTH_CHECK_CRON}"`)
  })
})
