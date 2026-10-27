import { describe, expect, it } from 'vitest'
import {
  buildReferrerAnalysis,
  validateReferrersSearch,
  windowEnds,
  type SnapshotRow,
} from './referrers'

function snap(
  repo: string,
  date: string,
  referrer: string,
  count: number,
  uniques = 1,
): SnapshotRow {
  return { repo, date, referrer, count, uniques }
}

/** Every day from `from` to `to`. */
function everyDay(from: string, to: string): string[] {
  const dates = []
  for (
    let d = new Date(from);
    d <= new Date(to);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

const anchor = '2026-10-28'

describe('windowEnds', () => {
  it('tiles the period with 14-day windows that do not overlap', () => {
    expect(windowEnds(anchor, 14)).toEqual(['2026-10-28'])
    expect(windowEnds(anchor, 28)).toEqual(['2026-10-28', '2026-10-14'])
    expect(windowEnds(anchor, 84)).toHaveLength(6)
  })
})

describe('buildReferrerAnalysis', () => {
  const collectionDates = everyDay('2026-08-01', anchor)

  it('adds the snapshots of each window, never overlapping ones', () => {
    const analysis = buildReferrerAnalysis({
      anchor,
      days: 28,
      snapshots: [
        snap('me/a', '2026-10-28', 'Google', 10),
        snap('me/a', '2026-10-27', 'Google', 999), // inside the first window
        snap('me/a', '2026-10-14', 'Google', 4),
        snap('me/b', '2026-10-28', 'Google', 3),
      ],
      trendRows: [],
      collectionDates,
    })

    expect(analysis.totals).toEqual([
      {
        referrer: 'Google',
        count: 17,
        uniques: null,
        repos: [
          { repo: 'me/a', count: 14 },
          { repo: 'me/b', count: 3 },
        ],
      },
    ])
    expect(analysis.isIncomplete).toBe(false)
  })

  it('reports uniques for a single 14-day window only', () => {
    const analysis = buildReferrerAnalysis({
      anchor,
      days: 14,
      snapshots: [snap('me/a', anchor, 'Google', 10, 6)],
      trendRows: [],
      collectionDates,
    })

    expect(analysis.totals[0].uniques).toBe(6)
  })

  it('ranks referrers by count, ties by name', () => {
    const analysis = buildReferrerAnalysis({
      anchor,
      days: 14,
      snapshots: [
        snap('me/a', anchor, 'reddit.com', 5),
        snap('me/a', anchor, 'Google', 5),
        snap('me/a', anchor, 'github.com', 9),
      ],
      trendRows: [],
      collectionDates,
    })

    expect(analysis.totals.map((t) => t.referrer)).toEqual([
      'github.com',
      'Google',
      'reddit.com',
    ])
  })

  it('is incomplete when a window ends on an uncollected day', () => {
    const analysis = buildReferrerAnalysis({
      anchor,
      days: 28,
      snapshots: [snap('me/a', anchor, 'Google', 10)],
      trendRows: [],
      collectionDates: collectionDates.filter((d) => d !== '2026-10-14'),
    })

    expect(analysis.isIncomplete).toBe(true)
  })

  it('follows the top referrers with gaps on uncollected days', () => {
    const analysis = buildReferrerAnalysis({
      anchor,
      days: 14,
      snapshots: [snap('me/a', anchor, 'Google', 10)],
      trendRows: [
        { date: '2026-10-27', referrer: 'Google', count: 8 },
        { date: anchor, referrer: 'Google', count: 10 },
      ],
      collectionDates: collectionDates.filter((d) => d !== '2026-10-26'),
    })

    expect(analysis.trendReferrers).toEqual(['Google'])
    expect(analysis.trend).toHaveLength(14)
    expect(analysis.trend.slice(-3)).toEqual([
      { date: '2026-10-26', Google: null },
      { date: '2026-10-27', Google: 8 },
      { date: anchor, Google: 10 },
    ])
  })

  it('has nothing to show before the first collection', () => {
    expect(
      buildReferrerAnalysis({
        anchor: null,
        days: 14,
        snapshots: [],
        trendRows: [],
        collectionDates: [],
      }).totals,
    ).toEqual([])
  })
})

describe('validateReferrersSearch', () => {
  it('accepts multiples of 14 only and leaves the default out', () => {
    expect(validateReferrersSearch({ period: '84' }).period).toBe(84)
    expect(validateReferrersSearch({ period: 14 }).period).toBeUndefined()
    expect(validateReferrersSearch({ period: 30 }).period).toBeUndefined()
    expect(validateReferrersSearch({ referrer: 'Google' }).referrer).toBe(
      'Google',
    )
  })
})
