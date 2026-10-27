/**
 * Turning what a page shows into a file to download.
 *
 * Built in the browser from data the page already holds, so an export always
 * matches the filters on screen and costs no extra query.
 */

import type { DailyTraffic, RepoTraffic } from './github.types'
import { addDays } from './period-comparison'

export type ExportValue = string | number | null

export interface ExportTable {
  columns: string[]
  rows: Record<string, ExportValue>[]
  /** Context written into the JSON file: period, filters and the like. */
  meta: Record<string, unknown>
}

/**
 * GitHub reports a day without traffic as 0, and so does a day the collector
 * missed, so the files say what a 0 may mean.
 */
export const ZERO_NOTE =
  'A 0 can also mean the collector missed that day: GitHub reports both the same way.'

function csvField(value: ExportValue): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** RFC 4180 CSV with a header row. */
export function toCsv({ columns, rows }: ExportTable): string {
  const lines = [columns.map(csvField).join(',')]
  for (const row of rows) {
    lines.push(columns.map((column) => csvField(row[column] ?? null)).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

export function toJson({ rows, meta }: ExportTable, exportedAt: Date): string {
  return `${JSON.stringify(
    { exportedAt: exportedAt.toISOString(), ...meta, note: ZERO_NOTE, rows },
    null,
    2,
  )}\n`
}

/** Save `content` through a temporary link, which works in every browser. */
export function downloadFile(
  filename: string,
  content: string,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked on the next task: some browsers start the download after click().
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** `/`: each repository's totals over GitHub's 14-day window. */
export function dashboardExport(
  repos: RepoTraffic[],
  filters: { search?: string; sort: string; showEmpty: boolean },
  today: string,
): ExportTable {
  return {
    columns: ['repo', 'views', 'unique_visitors', 'clones', 'unique_cloners'],
    rows: repos.map((t) => ({
      repo: t.repo,
      views: t.views.count,
      // GitHub's figures deduplicated across the window, not daily sums.
      unique_visitors: t.views.uniques,
      clones: t.clones.count,
      unique_cloners: t.clones.uniques,
    })),
    meta: {
      period: { from: addDays(today, -13), to: today, days: 14 },
      filters,
    },
  }
}

/** `/history`: daily rows per repository, as filtered on the page. */
export function historyExport(
  daily: DailyTraffic[],
  filters: { repo: string | null; days: number },
  today: string,
): ExportTable {
  return {
    columns: ['date', 'repo', 'views', 'visitors', 'clones', 'unique_cloners'],
    rows: [...daily]
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.repo.localeCompare(b.repo),
      )
      .map((d) => ({
        date: d.date,
        repo: d.repo,
        views: d.views,
        visitors: d.visitors,
        clones: d.clones,
        unique_cloners: d.cloneUniques,
      })),
    meta: {
      period: {
        from: addDays(today, 1 - filters.days),
        to: today,
        days: filters.days,
      },
      filters: { repo: filters.repo ?? 'all' },
    },
  }
}

/** `owner/name` made safe for a file name. */
export function fileSlug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-')
}
