/**
 * Canonical database schema.
 *
 * Shared by the init script (`pnpm db:init`) and the collector, which runs
 * these through `client.migrate()` at the start of every run so a freshly
 * deployed Worker never writes against a stale schema.
 */
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS daily_traffic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL,
    date TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    visitors INTEGER NOT NULL DEFAULT 0,
    clones INTEGER NOT NULL DEFAULT 0,
    clone_uniques INTEGER NOT NULL DEFAULT 0,
    UNIQUE(repo, date)
  )`,

  `CREATE TABLE IF NOT EXISTS referrers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL,
    date TEXT NOT NULL,
    referrer TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    uniques INTEGER NOT NULL DEFAULT 0,
    UNIQUE(repo, date, referrer)
  )`,

  // GitHub keeps popular paths for 14 days only, same as views and referrers,
  // so rows are snapshotted per collection date and never backfillable.
  `CREATE TABLE IF NOT EXISTS popular_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL,
    date TEXT NOT NULL,
    path TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,
    uniques INTEGER NOT NULL DEFAULT 0,
    UNIQUE(repo, date, path)
  )`,

  // GitHub reports window-level `count`/`uniques` alongside the daily
  // breakdown. Unique visitors are deduplicated across the whole 14-day window,
  // so they cannot be recovered by summing `daily_traffic`; snapshot them here.
  `CREATE TABLE IF NOT EXISTS traffic_totals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL,
    date TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    view_uniques INTEGER NOT NULL DEFAULT 0,
    clones INTEGER NOT NULL DEFAULT 0,
    clone_uniques INTEGER NOT NULL DEFAULT 0,
    UNIQUE(repo, date)
  )`,

  // Which repositories the account actually owned at each run. Traffic rows
  // outlive the repository, so this is what separates a renamed or deleted
  // repo from one that simply had no traffic.
  `CREATE TABLE IF NOT EXISTS repositories (
    repo TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
  )`,

  // One row per collection run. A run killed mid-flight leaves finished_at
  // NULL, which is what distinguishes "not collected" from "no traffic".
  `CREATE TABLE IF NOT EXISTS collection_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER,
    repos INTEGER NOT NULL DEFAULT 0,
    succeeded INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    failed_repos TEXT,
    error TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS idx_daily_traffic_repo_date ON daily_traffic(repo, date)`,
  `CREATE INDEX IF NOT EXISTS idx_referrers_repo_date ON referrers(repo, date)`,
  `CREATE INDEX IF NOT EXISTS idx_popular_paths_repo_date ON popular_paths(repo, date)`,
  `CREATE INDEX IF NOT EXISTS idx_traffic_totals_repo_date ON traffic_totals(repo, date)`,
  `CREATE INDEX IF NOT EXISTS idx_collection_runs_started_at ON collection_runs(started_at)`,
]
