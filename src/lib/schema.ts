/**
 * Versioned database migrations.
 *
 * Applied in order by `migrateSchema()`, which records each version in
 * `schema_migrations`. The dashboard runs it before its first query in each
 * Worker isolate and the collector at the start of every run, so a deployment
 * catches up on its own after pulling upstream changes; there is no deploy
 * step to remember.
 *
 * A migration that has shipped must never change, because deployments that
 * already recorded its version will not run it again. Change the schema by
 * appending a migration with the next version.
 */

export interface Migration {
  version: number
  name: string
  /**
   * Statements that bring the schema to this version.
   *
   * Receives the database so a step can inspect it first, since SQLite has no
   * `ADD COLUMN IF NOT EXISTS`. The returned statements run in one batch with
   * the version record, so a migration is applied and recorded together or not
   * at all.
   */
  up: (db: D1Database) => string[] | Promise<string[]>
}

async function hasColumn(
  db: D1Database,
  table: string,
  column: string,
): Promise<boolean> {
  const { results } = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all<{ name: string }>()
  return results.some((row) => row.name === column)
}

/**
 * The schema as it stood when migrations were introduced; migration 1.
 *
 * `IF NOT EXISTS` throughout: deployments created before versioning (and
 * databases imported from Turso) already have some or all of it. Exported for
 * the Turso export script, which needs tables to insert into.
 */
export const INITIAL_SCHEMA = [
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

  // GitHub keeps popular paths for 14 days only, same as views and
  // referrers, so rows are snapshotted per collection date and never
  // backfillable.
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
  // breakdown. Unique visitors are deduplicated across the whole 14-day
  // window, so they cannot be recovered by summing `daily_traffic`;
  // snapshot them here.
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

  // Which repositories the account actually owned at each run. Traffic
  // rows outlive the repository, so this is what separates a renamed or
  // deleted repo from one that simply had no traffic.
  //
  // `private` is NULL for rows written before visibility was recorded.
  // Readers treat NULL as private, so an unknown repo stays hidden until
  // the next run.
  `CREATE TABLE IF NOT EXISTS repositories (
    repo TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    private INTEGER
  )`,

  // One row per collection run. A run killed mid-flight leaves
  // finished_at NULL, which is what distinguishes "not collected" from
  // "no traffic".
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

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: () => INITIAL_SCHEMA,
  },
  {
    version: 2,
    name: 'repositories_private',
    // Databases created before visibility was recorded have a repositories
    // table without this column, which version 1 does not alter.
    up: async (db) =>
      (await hasColumn(db, 'repositories', 'private'))
        ? []
        : [`ALTER TABLE repositories ADD COLUMN private INTEGER`],
  },
]

const TRACKING_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`

async function currentVersion(db: D1Database): Promise<number> {
  return (
    (await db
      .prepare(`SELECT MAX(version) AS version FROM schema_migrations`)
      .first<number>('version')) ?? 0
  )
}

/**
 * Apply pending migrations and return the ones this call applied.
 *
 * Safe to run concurrently, as two isolates starting at once will: the loser's
 * batch fails on the version's primary key (or on the schema change the winner
 * already made), rolls back, and is accepted once the version shows as
 * recorded.
 */
export async function migrateSchema(
  db: D1Database,
  migrations: Migration[] = MIGRATIONS,
): Promise<Migration[]> {
  await db.prepare(TRACKING_TABLE).run()
  let version = await currentVersion(db)

  const applied: Migration[] = []
  for (const migration of migrations) {
    if (migration.version <= version) continue

    const statements = await migration.up(db)
    try {
      await db.batch([
        ...statements.map((sql) => db.prepare(sql)),
        db
          .prepare(
            `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
          )
          .bind(migration.version, migration.name, new Date().toISOString()),
      ])
      applied.push(migration)
    } catch (error) {
      if ((await currentVersion(db)) < migration.version) {
        throw new Error(
          `Migration ${migration.version} (${migration.name}) failed: ${String(error)}`,
          { cause: error },
        )
      }
    }
    version = migration.version
  }
  return applied
}
