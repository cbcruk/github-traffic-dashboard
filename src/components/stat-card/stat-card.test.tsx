// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StatCard } from './stat-card'

describe('StatCard', () => {
  // Vitest globals are off, so testing-library's auto-cleanup never registers.
  afterEach(cleanup)

  const change = { current: 112, previous: 100, isIncomplete: false, days: 14 }

  it('shows the change against the previous period', () => {
    render(<StatCard label="Views" value={112} change={change} />)

    expect(screen.getByText('↑12%')).toBeDefined()
    expect(screen.getByText('vs previous 14 days')).toBeDefined()
  })

  it('shows a drop', () => {
    render(
      <StatCard label="Views" value={95} change={{ ...change, current: 95 }} />,
    )

    expect(screen.getByText('↓5%')).toBeDefined()
  })

  it('says the data is incomplete instead of showing a change', () => {
    render(
      <StatCard
        label="Views"
        value={112}
        change={{ ...change, isIncomplete: true }}
      />,
    )

    expect(screen.getByText('Incomplete data')).toBeDefined()
    expect(screen.queryByText('↑12%')).toBeNull()
  })

  it('shows no change line without a previous figure', () => {
    render(
      <StatCard label="Views" value={5} change={{ ...change, previous: 0 }} />,
    )

    expect(screen.queryByText(/vs previous/)).toBeNull()
  })
})
