// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DashboardSkeleton, HistorySkeleton } from './page-skeleton'

describe('page skeletons', () => {
  // Vitest globals are off, so testing-library's auto-cleanup never registers.
  afterEach(cleanup)

  it('renders the dashboard placeholder without data', () => {
    const { container } = render(<DashboardSkeleton />)

    expect(
      container.querySelectorAll('.astryx-skeleton').length,
    ).toBeGreaterThan(0)
  })

  it('renders the history placeholder without data', () => {
    const { container } = render(<HistorySkeleton />)

    expect(
      container.querySelectorAll('.astryx-skeleton').length,
    ).toBeGreaterThan(0)
  })
})
