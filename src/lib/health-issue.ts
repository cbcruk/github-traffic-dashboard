/**
 * Reports collection health as a GitHub issue.
 *
 * One open issue per problem, not one per day: while a problem lasts the
 * daily check comments on the open issue, and the first healthy check closes
 * it. The issue is found by its label, so renaming it is harmless.
 */

const GITHUB_API_BASE = 'https://api.github.com'

export const ALERT_LABEL = 'collection-health'
const ALERT_TITLE = 'Traffic collection needs attention'

export interface IssueTarget {
  /** `owner/name` of the repository to file issues in. */
  repo: string
  /** Needs Issues write access to `repo`. */
  token: string
  fetch: (request: Request) => Promise<Response>
}

interface Issue {
  number: number
  html_url: string
}

async function github<T>(
  target: IssueTarget,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null }> {
  const response = await target.fetch(
    new Request(`${GITHUB_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${target.token}`,
        Accept: 'application/vnd.github+json',
        // Cloudflare Workers send no default User-Agent, which GitHub rejects.
        'User-Agent': 'github-traffic-dashboard',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
  if (response.status === 404) return { status: 404, data: null }
  if (!response.ok) {
    throw new Error(
      `GitHub ${method} ${path} responded ${response.status}: ${await response.text()}`,
    )
  }
  return { status: response.status, data: (await response.json()) as T }
}

/**
 * Whether issues filed in the repository are visible to everyone. Unknown
 * counts as public, so a failed lookup never leaks what redaction would hide.
 */
export async function isPublicRepo(target: IssueTarget): Promise<boolean> {
  try {
    const { data } = await github<{ private: boolean }>(
      target,
      'GET',
      `/repos/${target.repo}`,
    )
    return data?.private !== true
  } catch {
    return true
  }
}

async function findOpenAlert(target: IssueTarget): Promise<Issue | null> {
  const { data } = await github<Issue[]>(
    target,
    'GET',
    `/repos/${target.repo}/issues?state=open&labels=${ALERT_LABEL}&per_page=1`,
  )
  return data?.[0] ?? null
}

async function ensureLabel(target: IssueTarget): Promise<void> {
  const { status } = await github(
    target,
    'GET',
    `/repos/${target.repo}/labels/${ALERT_LABEL}`,
  )
  if (status !== 404) return
  await github(target, 'POST', `/repos/${target.repo}/labels`, {
    name: ALERT_LABEL,
    color: 'd73a4a',
    description: 'Opened and closed by the daily collection health check',
  })
}

/** Open an alert issue, or comment on the one already open. */
export async function reportProblem(
  target: IssueTarget,
  message: string,
  now: Date,
): Promise<{ action: 'opened' | 'commented'; url: string }> {
  const open = await findOpenAlert(target)
  if (open) {
    await github(
      target,
      'POST',
      `/repos/${target.repo}/issues/${open.number}/comments`,
      { body: `Still unresolved at ${now.toISOString()}:\n\n${message}` },
    )
    return { action: 'commented', url: open.html_url }
  }

  await ensureLabel(target)
  const { data } = await github<Issue>(
    target,
    'POST',
    `/repos/${target.repo}/issues`,
    {
      title: ALERT_TITLE,
      labels: [ALERT_LABEL],
      body:
        `${message}\n\n` +
        'The daily health check comments here while the problem lasts and ' +
        'closes this issue once collection is healthy again.',
    },
  )
  return { action: 'opened', url: data?.html_url ?? '' }
}

/** Close the open alert issue, if any, noting the recovery. */
export async function resolveProblem(
  target: IssueTarget,
  message: string,
): Promise<string | null> {
  const open = await findOpenAlert(target)
  if (!open) return null

  await github(
    target,
    'POST',
    `/repos/${target.repo}/issues/${open.number}/comments`,
    { body: message },
  )
  await github(target, 'PATCH', `/repos/${target.repo}/issues/${open.number}`, {
    state: 'closed',
    state_reason: 'completed',
  })
  return open.html_url
}

/**
 * Replace each repository name in `text` with a placeholder.
 *
 * Alert details name failed repositories and quote errors that may contain
 * them; in a public repository's issues that would expose private repos the
 * dashboard hides.
 */
export function redactRepos(text: string, repos: string[]): string {
  return repos.reduce((result, repo) => {
    const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Bounded so `me/app` does not match inside `me/app-v2`.
    return result.replace(
      new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, 'g'),
      '(private repository)',
    )
  }, text)
}
