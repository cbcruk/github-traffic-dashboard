/**
 * Which repositories the collector lists, read from environment variables so a
 * fork configures its own account without changing code.
 *
 * - `GITHUB_ORGS=org1,org2` adds each organization's repositories to the
 *   token owner's own.
 * - `EXCLUDE_REPOS=me/dotfiles,me/*-archive` drops repositories by full name.
 *   `*` matches any run of characters, and matching ignores case like GitHub.
 * - `INCLUDE_FORKS=true` keeps forks, which are skipped by default.
 * - `EXCLUDE_ARCHIVED=true` skips archived repositories, which are kept by
 *   default because GitHub still reports their traffic.
 */
export interface RepoSelection {
  orgs: string[]
  exclude: string[]
  includeForks: boolean
  excludeArchived: boolean
}

export interface RepoSelectionEnv {
  GITHUB_ORGS?: string
  EXCLUDE_REPOS?: string
  INCLUDE_FORKS?: string
  EXCLUDE_ARCHIVED?: string
}

/** A listed repository, with the fields selection needs. */
export interface ListedRepository {
  full_name: string
  fork: boolean
  archived?: boolean
  private: boolean
  /** Absent when GitHub does not report the token's permissions. */
  permissions?: { push?: boolean; admin?: boolean }
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseRepoSelection(env: RepoSelectionEnv): RepoSelection {
  return {
    orgs: list(env.GITHUB_ORGS),
    exclude: list(env.EXCLUDE_REPOS),
    includeForks: env.INCLUDE_FORKS === 'true',
    excludeArchived: env.EXCLUDE_ARCHIVED === 'true',
  }
}

function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`, 'i')
}

export interface SelectedRepos {
  repos: ListedRepository[]
  /**
   * Repositories dropped because the token cannot read their traffic. The
   * traffic API needs push access, so an organization member without it would
   * otherwise fail every day instead of being left out.
   */
  noAccess: string[]
}

/** Apply `selection` to listed repositories, keeping the first of duplicates. */
export function selectRepos(
  listed: ListedRepository[],
  selection: RepoSelection,
): SelectedRepos {
  const excluded = selection.exclude.map(patternToRegExp)
  const seen = new Set<string>()
  const repos: ListedRepository[] = []
  const noAccess: string[] = []

  for (const repo of listed) {
    const key = repo.full_name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    if (repo.fork && !selection.includeForks) continue
    if (repo.archived && selection.excludeArchived) continue
    if (excluded.some((re) => re.test(repo.full_name))) continue
    if (repo.permissions && !repo.permissions.push && !repo.permissions.admin) {
      noAccess.push(repo.full_name)
      continue
    }
    repos.push(repo)
  }

  return { repos, noAccess }
}
