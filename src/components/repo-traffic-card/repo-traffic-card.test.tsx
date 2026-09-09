// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RepoTrafficCard } from './repo-traffic-card'
import type { RepoTraffic } from '../../lib/github.types'

// No daily points, so the chart is skipped and the paths list is what renders.
const traffic: RepoTraffic = {
  repo: 'me/repo',
  views: { count: 40, uniques: 7, views: [] },
  clones: { count: 5, uniques: 2, clones: [] },
  referrers: [],
  paths: [
    { path: '/me/repo', title: 'me/repo: a repo', count: 30, uniques: 6 },
    {
      path: '/me/repo/blob/main/README.md',
      title: 'repo/README.md at main',
      count: 10,
      uniques: 3,
    },
  ],
}

describe('RepoTrafficCard', () => {
  // Vitest globals are off, so testing-library's auto-cleanup never registers.
  afterEach(cleanup)

  it('labels the repo root and strips the repo prefix from deeper paths', () => {
    render(<RepoTrafficCard traffic={traffic} />)

    expect(screen.getByText('Repository root')).toBeDefined()
    expect(screen.getByText('blob/main/README.md')).toBeDefined()
  })

  it('links each path back to GitHub', () => {
    render(<RepoTrafficCard traffic={traffic} />)

    // ListItem renders the anchor separately from the label text, so query by
    // role rather than by the text node.
    const link = screen.getByRole('link', { name: 'blob/main/README.md' })
    expect(link.getAttribute('href')).toBe(
      'https://github.com/me/repo/blob/main/README.md',
    )
  })

  it('shows the deduplicated visitor count, not a sum of daily uniques', () => {
    render(<RepoTrafficCard traffic={traffic} />)

    expect(screen.getByText('7')).toBeDefined()
  })
})
