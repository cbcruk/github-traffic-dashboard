import { describe, expect, it } from 'vitest'
import {
  buildPreviousPeriods,
  percentChange,
  periods,
  previousSums,
  uncoveredDays,
  type DailyRow,
} from './period-comparison'

function row(repo: string, date: string, views: number): DailyRow {
  return { repo, date, views, visitors: views / 2, clones: 1 }
}

/** A collection on every day from `from` to `to`. */
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

describe('periods', () => {
  it('counts today as the last day of the current period', () => {
    expect(periods('2026-10-14', 7)).toEqual({
      current: { from: '2026-10-08', to: '2026-10-14' },
      previous: { from: '2026-10-01', to: '2026-10-07' },
    })
  })
})

describe('uncoveredDays', () => {
  it('covers a day through any collection in the 14 days from it', () => {
    // One collection reports its date and the 13 days before.
    expect(
      uncoveredDays(['2026-10-14'], { from: '2026-09-30', to: '2026-10-14' }),
    ).toEqual(['2026-09-30'])
  })

  it('finds a gap between collections', () => {
    const dates = [...everyDay('2026-07-01', '2026-07-14'), '2026-08-30']
    const gap = uncoveredDays(dates, { from: '2026-07-10', to: '2026-08-20' })

    expect(gap[0]).toBe('2026-07-15')
    expect(gap.at(-1)).toBe('2026-08-16')
  })

  it('takes a longer window for collections that report more days', () => {
    expect(
      uncoveredDays(
        ['2026-10-14'],
        { from: '2026-07-17', to: '2026-10-14' },
        90,
      ),
    ).toEqual([])
  })

  it('does not count days after the newest collection as missing', () => {
    expect(
      uncoveredDays(['2026-10-13'], { from: '2026-10-10', to: '2026-10-14' }),
    ).toEqual([])
  })
})

describe('percentChange', () => {
  it('rounds to a whole percentage', () => {
    expect(percentChange(112, 100)).toBe(12)
    expect(percentChange(95, 100)).toBe(-5)
    expect(percentChange(1, 3)).toBe(-67)
  })

  it('has nothing to say without a previous figure', () => {
    expect(percentChange(5, 0)).toBeNull()
  })
})

describe('buildPreviousPeriods', () => {
  const today = '2026-10-14'
  const rows = [
    row('me/a', '2026-10-07', 10), // previous 7 days
    row('me/a', '2026-10-01', 4), // previous 7 days, first day
    row('me/a', '2026-09-30', 100), // before the previous 7 days
    row('me/a', '2026-10-08', 1000), // current 7 days
    row('me/b', '2026-10-05', 6),
  ]

  it('sums each repository over the previous period only', () => {
    const result = buildPreviousPeriods(
      rows,
      everyDay('2026-09-01', today),
      today,
      [7],
    )

    expect(result[7].byRepo).toEqual({
      'me/a': { views: 14, visitors: 7, clones: 2 },
      'me/b': { views: 6, visitors: 3, clones: 1 },
    })
    expect(result[7].incomplete).toBe(false)
    expect(previousSums(result[7])).toEqual({
      views: 20,
      visitors: 10,
      clones: 3,
    })
    expect(previousSums(result[7], 'me/b')?.views).toBe(6)
    expect(previousSums(result[7], 'me/none')?.views).toBe(0)
  })

  it('marks a comparison incomplete when either period has a gap', () => {
    // Collections stop on 09-20 and resume on 10-10: 09-21 to 09-26 has none
    // within its 14-day window, which touches the 14-day comparison only.
    const collections = [
      ...everyDay('2026-09-01', '2026-09-20'),
      ...everyDay('2026-10-10', today),
    ]

    const result = buildPreviousPeriods(rows, collections, today, [7, 14])

    expect(result[7].incomplete).toBe(false)
    expect(result[14].incomplete).toBe(true)
  })
})
