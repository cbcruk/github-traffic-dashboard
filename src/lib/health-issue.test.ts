import { afterEach, describe, expect, it } from 'vitest'
import { checkCollectionHealth } from './collection-health'
import {
  ALERT_LABEL,
  redactRepos,
  reportProblem,
  resolveProblem,
  type IssueTarget,
} from './health-issue'
import { migrateSchema } from './schema'
import { createTestDb } from './test-d1'

interface FakeIssue {
  number: number
  html_url: string
  state: 'open' | 'closed'
  body: string
  labels: string[]
  comments: string[]
}

/** Just enough of GitHub's REST API for the alert issue flow. */
function fakeGitHub({ isPrivate = false } = {}) {
  const issues: FakeIssue[] = []
  const labels = new Set<string>()
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status })

  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const route = `${request.method} ${url.pathname}`
    const body = (request.method === 'GET' ? {} : await request.json()) as {
      name: string
      body: string
      labels: string[]
      state: FakeIssue['state']
    }

    if (route === 'GET /repos/me/dash') return json({ private: isPrivate })
    if (route === 'GET /repos/me/dash/issues') {
      const label = url.searchParams.get('labels')
      return json(
        issues.filter((i) => i.state === 'open' && i.labels.includes(label!)),
      )
    }
    if (route === `GET /repos/me/dash/labels/${ALERT_LABEL}`) {
      return labels.has(ALERT_LABEL)
        ? json({ name: ALERT_LABEL })
        : json({ message: 'Not Found' }, 404)
    }
    if (route === 'POST /repos/me/dash/labels') {
      labels.add(body.name)
      return json(body, 201)
    }
    if (route === 'POST /repos/me/dash/issues') {
      const issue: FakeIssue = {
        number: issues.length + 1,
        html_url: `https://github.com/me/dash/issues/${issues.length + 1}`,
        state: 'open',
        body: body.body,
        labels: body.labels,
        comments: [],
      }
      issues.push(issue)
      return json(issue, 201)
    }
    const comment = route.match(
      /^POST \/repos\/me\/dash\/issues\/(\d+)\/comments$/,
    )
    if (comment) {
      issues[Number(comment[1]) - 1].comments.push(body.body)
      return json({}, 201)
    }
    const update = route.match(/^PATCH \/repos\/me\/dash\/issues\/(\d+)$/)
    if (update) {
      issues[Number(update[1]) - 1].state = body.state
      return json({})
    }
    return json({ message: `Unexpected ${route}` }, 500)
  }

  return { issues, labels, fetch }
}

const now = new Date('2026-09-16T06:00:00Z')

describe('alert issue', () => {
  it('opens one labeled issue, then comments while the problem lasts', async () => {
    const gh = fakeGitHub()
    const target: IssueTarget = { repo: 'me/dash', token: 't', fetch: gh.fetch }

    const first = await reportProblem(target, 'broken', now)
    const second = await reportProblem(target, 'still broken', now)

    expect(first.action).toBe('opened')
    expect(second.action).toBe('commented')
    expect(gh.issues).toHaveLength(1)
    expect(gh.issues[0].labels).toEqual([ALERT_LABEL])
    expect(gh.labels.has(ALERT_LABEL)).toBe(true)
    expect(gh.issues[0].comments[0]).toMatch(/still broken/)
  })

  it('closes the open issue on recovery, and does nothing without one', async () => {
    const gh = fakeGitHub()
    const target: IssueTarget = { repo: 'me/dash', token: 't', fetch: gh.fetch }

    expect(await resolveProblem(target, 'healthy')).toBeNull()

    await reportProblem(target, 'broken', now)
    await resolveProblem(target, 'healthy')

    expect(gh.issues[0].state).toBe('closed')
    expect(gh.issues[0].comments).toEqual(['healthy'])
  })
})

describe('redactRepos', () => {
  it('hides whole repository names, including inside URLs', () => {
    const text =
      'failed: me/app,me/app-v2 (401 for https://api.github.com/repos/me/app/traffic)'

    expect(redactRepos(text, ['me/app'])).toBe(
      'failed: (private repository),me/app-v2 (401 for https://api.github.com/repos/(private repository)/traffic)',
    )
  })
})

describe('checkCollectionHealth with a GitHub issue', () => {
  let dispose: (() => Promise<void>) | undefined

  afterEach(async () => {
    await dispose?.()
    dispose = undefined
  })

  async function setup() {
    const test = await createTestDb()
    dispose = test.dispose
    await migrateSchema(test.db)
    await test.db.batch([
      test.db.prepare(
        `INSERT INTO repositories VALUES
           ('me/public', '2026-09-01', '2026-09-16', 0),
           ('me/secret', '2026-09-01', '2026-09-16', 1),
           ('me/unknown', '2026-09-01', '2026-09-16', NULL)`,
      ),
      test.db.prepare(
        `INSERT INTO collection_runs
           (started_at, finished_at, repos, succeeded, failed, failed_repos)
         VALUES ('2026-09-16T00:00:00Z', '2026-09-16T00:01:00Z', 3, 0, 3,
                 'me/public,me/secret,me/unknown')`,
      ),
    ])
    return test.db
  }

  it('hides private and unknown repositories in a public repository', async () => {
    const db = await setup()
    const gh = fakeGitHub({ isPrivate: false })

    await checkCollectionHealth({
      db,
      issueRepo: 'me/dash',
      githubToken: 't',
      now,
      fetch: gh.fetch,
    })

    expect(gh.issues[0].body).toContain('me/public')
    expect(gh.issues[0].body).not.toContain('me/secret')
    expect(gh.issues[0].body).not.toContain('me/unknown')
  })

  it('keeps full details in a private repository', async () => {
    const db = await setup()
    const gh = fakeGitHub({ isPrivate: true })

    await checkCollectionHealth({
      db,
      issueRepo: 'me/dash',
      githubToken: 't',
      now,
      fetch: gh.fetch,
    })

    expect(gh.issues[0].body).toContain('me/secret')
  })

  it('still posts the webhook when the issue cannot be filed', async () => {
    const db = await setup()
    const posted: string[] = []

    await expect(
      checkCollectionHealth({
        db,
        webhookUrl: 'https://ntfy.sh/topic',
        issueRepo: 'me/dash',
        githubToken: 't',
        now,
        fetch: async (request) => {
          if (request.url.startsWith('https://ntfy.sh/')) {
            posted.push(await request.text())
            return new Response('ok')
          }
          return new Response('Forbidden', { status: 403 })
        },
      }),
    ).rejects.toThrow(/GitHub issue: .*403/)

    expect(posted).toHaveLength(1)
  })
})
