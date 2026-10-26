import { describe, expect, it } from 'vitest'
import {
  parseRepoSelection,
  selectRepos,
  type ListedRepository,
} from './repo-selection'

function repo(
  full_name: string,
  fields: Partial<ListedRepository> = {},
): ListedRepository {
  return { full_name, fork: false, private: false, ...fields }
}

const names = (repos: ListedRepository[]) => repos.map((r) => r.full_name)

describe('parseRepoSelection', () => {
  it('defaults to own repositories without forks', () => {
    expect(parseRepoSelection({})).toEqual({
      orgs: [],
      exclude: [],
      includeForks: false,
      excludeArchived: false,
    })
  })

  it('reads comma-separated lists, ignoring blanks and spaces', () => {
    const selection = parseRepoSelection({
      GITHUB_ORGS: ' acme , ,tools',
      EXCLUDE_REPOS: 'me/dotfiles,',
    })

    expect(selection.orgs).toEqual(['acme', 'tools'])
    expect(selection.exclude).toEqual(['me/dotfiles'])
  })
})

describe('selectRepos', () => {
  const selection = parseRepoSelection({})

  it('skips forks unless INCLUDE_FORKS is set', () => {
    const listed = [repo('me/app'), repo('me/fork', { fork: true })]

    expect(names(selectRepos(listed, selection).repos)).toEqual(['me/app'])
    expect(
      names(selectRepos(listed, { ...selection, includeForks: true }).repos),
    ).toEqual(['me/app', 'me/fork'])
  })

  it('keeps archived repositories unless EXCLUDE_ARCHIVED is set', () => {
    const listed = [repo('me/app'), repo('me/old', { archived: true })]

    expect(names(selectRepos(listed, selection).repos)).toEqual([
      'me/app',
      'me/old',
    ])
    expect(
      names(selectRepos(listed, { ...selection, excludeArchived: true }).repos),
    ).toEqual(['me/app'])
  })

  it('excludes by full name, with * as a wildcard and ignoring case', () => {
    const listed = [
      repo('me/dotfiles'),
      repo('me/site-archive'),
      repo('me/app'),
      repo('me/app.v2'),
    ]

    const { repos } = selectRepos(listed, {
      ...selection,
      exclude: ['Me/Dotfiles', 'me/*-archive', 'me/app.v*'],
    })

    expect(names(repos)).toEqual(['me/app'])
  })

  it('leaves out repositories the token cannot read traffic for', () => {
    const listed = [
      repo('acme/writable', { permissions: { push: true } }),
      repo('acme/read-only', { permissions: { push: false, admin: false } }),
      repo('me/app'),
    ]

    expect(selectRepos(listed, selection)).toEqual({
      repos: [listed[0], listed[2]],
      noAccess: ['acme/read-only'],
    })
  })

  it('keeps one entry for a repository listed twice', () => {
    const listed = [repo('me/app'), repo('Me/App')]

    expect(names(selectRepos(listed, selection).repos)).toEqual(['me/app'])
  })
})
