# Migrating from Turso

Deployments that collected into Turso before the move to Cloudflare D1 need to copy their data over once. GitHub keeps traffic for 14 days only, so anything older exists only in Turso.

```bash
# 1. Create the D1 database first; deploys bind it by this name
npx wrangler d1 create github-traffic-dashboard

# 2. Export the Turso data, schema included, to an SQL file
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... pnpm db:export-turso

# 3. Import it into D1
npx wrangler d1 execute github-traffic-dashboard --remote --file=turso-export.sql

# 4. After deploying, delete the Turso secrets
npx wrangler secret delete TURSO_DATABASE_URL
npx wrangler secret delete TURSO_AUTH_TOKEN
```

If a collection writes to Turso between the export and the deploy, only that day's referrer and path snapshots are missing from D1. The next collection fills in the last 14 days of daily traffic again.
