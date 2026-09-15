// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CollectionStatus } from './collection-status'

describe('CollectionStatus', () => {
  // Vitest globals are off, so testing-library's auto-cleanup never registers.
  afterEach(cleanup)

  it('says when collection is failing', () => {
    render(
      <CollectionStatus
        status={{ status: 'failed', lastStartedAt: '2026-09-10T00:00:00Z' }}
      />,
    )

    expect(screen.getByText(/Collection failing/)).toBeDefined()
  })

  it('renders nothing when the status could not be read', () => {
    const { container } = render(<CollectionStatus status={null} />)

    expect(container.textContent).toBe('')
  })
})
