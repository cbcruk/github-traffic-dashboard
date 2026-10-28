# GitHub Traffic Dashboard

[한국어](./README.ko.md)

GitHub keeps repository traffic (views, clones, referrers) for 14 days only. This dashboard collects it every day into a database you own and shows it for as long as you keep collecting.

It runs as a single Cloudflare Worker, app and collector together, and fits the free plan.

**[Live demo](https://github-traffic-dashboard-demo.cbcruk.workers.dev)**, with made-up data ([demo mode](#demo-mode)).

## Features

- **Dashboard**: the last 14 days per repository, with views, unique visitors, clones and the top referrer and paths
- **History**: daily traffic over up to 90 days, filtered by repository and period
- **Top 10**: repositories ranked by views, visitors or clones, with rank changes
- **Referrers**: referring sites across repositories, broken down by repository, with a 14-day trend
- **Repository pages**: one repository's whole history, referrers and popular paths
- **Period comparison**: each total shows its change against the previous period of the same length
- **Collection health**: the header shows whether collection is working, and failures can open a GitHub issue or post to a webhook
- **Honest gaps**: days the collector missed are shown as missing, never as zero traffic
- **Export**: download the dashboard or history as CSV or JSON, with the filters on screen
- **Demo mode**: try it with made-up data, no token needed

## Deploy your own

You need a GitHub account, a Cloudflare account (the free plan works) and about 15 minutes.

### 1. Fork this repository

Fork it rather than copying it with "Use this template", so you can pull fixes later with one click (see [Updating](#updating)). A bug in collection loses data for good once it is older than GitHub's 14 days, so staying up to date matters here.

Do not edit tracked files in your fork. Everything you configure lives in Cloudflare secrets, which keeps your fork in sync with no conflicts.

### 2. Create a GitHub token

Create a [personal access token](https://github.com/settings/tokens) that can read traffic:

| Token        | Permission                                        |
| ------------ | ------------------------------------------------- |
| Classic      | `repo` scope                                      |
| Fine-grained | Repository permissions > **Administration: Read** |

A fine-grained token works for one resource owner only (your account or one organization). To collect your repositories and an organization's together (`GITHUB_ORGS`), use a classic token. If you want collection failures filed as GitHub issues (`ALERT_GITHUB_REPO`), the token also needs **Issues: Read and write** on that repository (included in `repo`).

### 3. Deploy to Cloudflare

**With Workers Builds (recommended).** Cloudflare builds and deploys every push to your fork, including the updates you sync from upstream.

1. In the Cloudflare dashboard, go to **Workers & Pages** > **Create** > **Import a repository** and pick your fork.
2. Name the Worker `<your-github-user>-github-traffic-dashboard`, in lowercase. The build generates the Worker name from your fork's `owner/repo`, and Workers Builds requires the two to match.
3. Set the build command to `pnpm run build` and keep the deploy command `npx wrangler deploy`.
4. Deploy. The first deploy creates the D1 database (`github-traffic-dashboard`) and registers the cron triggers.

**From your machine.**

```bash
git clone https://github.com/<your-github-user>/github-traffic-dashboard.git
cd github-traffic-dashboard
pnpm install
npx wrangler login
pnpm run deploy   # not `pnpm deploy`, which is a pnpm built-in
```

### 4. Add the token as a secret

In the Worker's **Settings** > **Variables and Secrets**, add `GITHUB_TOKEN` as a **Secret**, or run:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Add any other [configuration](#configuration) the same way. Use secrets rather than `vars` in `wrangler.jsonc`: a deploy keeps secrets but drops variables the config file does not list.

### 5. Check the first collection

Collection runs every 10 minutes and works through your repositories in small batches. Within a few minutes the dashboard header should read **Collecting now**, and **Collected** once the day is done. To follow along:

```bash
pnpm cf:tail   # live Worker logs
```

The Worker URL is public. Private repositories are collected but hidden; see [Private repositories](#private-repositories).

## Updating

Click **Sync fork** on your fork's GitHub page. With Workers Builds, that push deploys the update, and pending database migrations apply on the first request or cron run afterward. No other steps are needed.

> Why no "Deploy to Cloudflare" button? The button clones this repository into a new one in your account instead of forking it, so **Sync fork** would not be available and updates would have to be pulled by hand.

## Configuration

All settings are environment variables. On Cloudflare, add them as secrets; locally, put them in `.env` (copy [`.env.example`](./.env.example)).

| Variable             | Example                                | Purpose                                                                            |
| -------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`       | `ghp_...`                              | **Required.** Reads traffic (see [step 2](#2-create-a-github-token))               |
| `GITHUB_ORGS`        | `acme,tools`                           | Also collect these organizations' repositories                                     |
| `EXCLUDE_REPOS`      | `me/dotfiles,me/*-archive`             | Skip repositories by full name. `*` matches anything; case is ignored              |
| `INCLUDE_FORKS`      | `true`                                 | Collect forks too (skipped by default)                                             |
| `EXCLUDE_ARCHIVED`   | `true`                                 | Skip archived repositories (kept by default, as GitHub still counts their traffic) |
| `SHOW_PRIVATE_REPOS` | `true`                                 | Show private repositories. Only behind access control                              |
| `ALERT_GITHUB_REPO`  | `me/github-traffic-dashboard`          | File collection failures as an issue in this repository                            |
| `ALERT_WEBHOOK_URL`  | `https://discord.com/api/webhooks/...` | Post collection failures to Discord, Slack or any URL (as plain text)              |
| `DEMO_MODE`          | `true`                                 | Serve made-up data instead of collecting (see [Demo mode](#demo-mode))             |

The repository list is built by the day's first collection, so changes to `GITHUB_ORGS`, `EXCLUDE_REPOS`, `INCLUDE_FORKS` and `EXCLUDE_ARCHIVED` apply from the next UTC day.

Organization repositories need push access for their traffic. Those the token cannot push to are left out and logged as `Skipped N without push access`, rather than failing every day.

### Private repositories

The collector stores every repository the token can read, but the dashboard shows **public repositories only**, because anyone can open the Worker URL. To show private ones, first put the dashboard behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/), then set `SHOW_PRIVATE_REPOS=true`.

### Collection alerts

GitHub keeps traffic for 14 days, so collection that stops quietly loses data for good. A health check runs daily at 06:00 UTC and reports problems:

| Status   | When                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| Failed   | No run started for 26 hours, a run stopped partway (no batch for 40 minutes), or a run errored |
| Degraded | Some repositories failed, or fewer than half as many succeeded as in the last good run         |

- **GitHub issue** (`ALERT_GITHUB_REPO`): opens an issue labelled `collection-health`, comments on it daily while the problem lasts, and closes it once collection recovers. In a public repository, names of private repositories are masked. GitHub does not notify you of issues your own token opens, so watch the label.
- **Webhook** (`ALERT_WEBHOOK_URL`): Discord and Slack URLs get their own JSON format; any other URL (for example `https://ntfy.sh/<topic>`) gets plain text. Repository names are not masked.

If one channel fails, the other still runs, and the failure is logged.

## Local development

Requires Node.js 24+ and pnpm. No database setup is needed: `pnpm dev` and the `pnpm db:*` scripts use wrangler's local D1 emulation (`.wrangler/state`).

```bash
pnpm install
cp .env.example .env   # set GITHUB_TOKEN
pnpm db:collect        # collect into the local D1
pnpm dev               # http://localhost:3000
```

### Demo mode

Browse the dashboard without a token or collected data. Demo mode writes eight made-up repositories with 90 days of traffic through the same collection path as real data, so every page works.

```bash
pnpm db:demo              # write demo data to the local D1
DEMO_MODE=true pnpm dev   # shows a "Demo data" banner
```

`pnpm db:demo` refuses a local database that already holds real repositories; delete `.wrangler/state` to start fresh.

#### Deploying a demo

`pnpm build:demo` builds a demo Worker: it is named `github-traffic-dashboard-demo`, binds its own D1 database (`github-traffic-dashboard-demo`) and sets `DEMO_MODE=true`. It can share a Cloudflare account with your real dashboard without touching its data, and needs no token or secrets. Its cron collects the demo data, so every page fills in within about half an hour of the first deploy.

- **With Workers Builds:** import the same repository a second time, name the Worker `github-traffic-dashboard-demo`, and set the build command to `pnpm run build:demo`.
- **From your machine:** `pnpm build:demo && npx wrangler deploy`.

### Queries and type checking

The dashboard's queries live in [`src/queries`](./src/queries) as `.sql` files, imported by the server functions. [Reylo](https://reylo.dev) infers each query's parameter and row types by preparing it against [`db/schema.sqlite`](./db/schema.sqlite), the empty, fully migrated schema, so a misspelled column or a changed result is a type error. The collector's writes are built in code, as they are batched.

```bash
pnpm typecheck   # tsc with reylo; needs no database besides db/schema.sqlite
pnpm db:schema   # rewrite db/schema.sqlite after adding a migration
```

Type checking uses TypeScript 7.1 (beta). To see query types in VS Code, install the **TypeScript 7** extension (`TypeScriptTeam.native-preview`) and set `"js/ts.experimental.useTsgo": true`; see [Reylo's editor setup](https://reylo.dev/#editors) for others. The build does not type-check and needs no database.

### Scripts

| Script            | Description                       |
| ----------------- | --------------------------------- |
| `pnpm dev`        | Start the dev server              |
| `pnpm build`      | Build for production              |
| `pnpm build:demo` | Build the demo Worker             |
| `pnpm test`       | Run tests                         |
| `pnpm typecheck`  | Type-check, queries included      |
| `pnpm format`     | Format with Prettier              |
| `pnpm db:init`    | Apply migrations to the local D1  |
| `pnpm db:collect` | Collect traffic into the local D1 |
| `pnpm db:demo`    | Write demo data to the local D1   |
| `pnpm db:schema`  | Rewrite `db/schema.sqlite`        |
| `pnpm run deploy` | Build and deploy to Cloudflare    |
| `pnpm cf:preview` | Preview the built Worker locally  |
| `pnpm cf:tail`    | Stream the deployed Worker's logs |

## How it works

A Cloudflare cron trigger fires every 10 minutes. A Nitro server plugin ([`src/nitro/scheduled.ts`](./src/nitro/scheduled.ts)) runs the collector ([`src/lib/collect-traffic.ts`](./src/lib/collect-traffic.ts)), which picks a few repositories not yet collected that day, reads GitHub's four traffic endpoints for each, and writes them to D1. Once the day is done, later runs do nothing. Unlike GitHub Actions schedules, Cloudflare cron triggers are not disabled when a repository goes quiet.

**Batching.** The free plan allows 50 subrequests and 50 D1 queries per invocation. A repository costs 4 GitHub requests and up to 4 statements, so each run collects `CRON_BATCH_SIZE` (7) repositories. The day's first run lists the repositories, and a longer listing (organizations, more than 100 repositories) takes slots from that run's batch. At 144 runs a day this covers about 1,000 repositories; beyond that, shorten the cron interval or raise `CRON_BATCH_SIZE` on Workers Paid. Each repository is attempted once per day (`collection_attempts`), so a failing one never blocks the rest.

**Storage.** Views and clones share GitHub's 14-day window and are merged per day into `daily_traffic`. Referrers and popular paths are 14-day aggregates, stored as snapshots stamped with the collection date. `traffic_totals` keeps GitHub's window totals, since unique visitors are deduplicated across the window and cannot be rebuilt from daily figures. `repositories` records which repositories exist on each collection date, so renamed and deleted ones drop out. `collection_runs` keeps one row per day, which is how the dashboard tells a quiet day from a missed one: GitHub reports both as 0.

**Migrations.** Schema changes are versioned in [`src/lib/schema.ts`](./src/lib/schema.ts) and applied automatically, before the first query of each Worker isolate and at the start of each collection. Add a new version rather than editing a deployed one, then run `pnpm db:schema`; a test fails until you do.

The cron schedule and D1 binding are in [`wrangler.jsonc`](./wrangler.jsonc), which Nitro merges into the Worker config it generates at build time. The health check is matched by its cron expression: change `triggers.crons` and `HEALTH_CHECK_CRON` in [`src/lib/collection-health.ts`](./src/lib/collection-health.ts) together.

Moving from the earlier Turso-based version? See [docs/migrate-from-turso.md](./docs/migrate-from-turso.md).

## Project structure

```
├── db/                 # empty schema that queries are typed against
├── scripts/            # local D1 scripts (init, collect, demo, schema, Turso export)
├── src/
│   ├── components/     # React components
│   ├── lib/            # collector, server functions, schema, comparisons
│   ├── nitro/          # Nitro server plugin (cron)
│   ├── queries/        # the dashboard's SQL, typed by reylo
│   └── routes/         # pages
└── wrangler.jsonc      # D1 binding, cron triggers
```

## Tech stack

[TanStack Start](https://tanstack.com/start) and [Router](https://tanstack.com/router), [Astryx](https://astryx.atmeta.com) UI, [Recharts](https://recharts.org), [Reylo](https://reylo.dev), [Cloudflare Workers](https://developers.cloudflare.com/workers/) and [D1](https://developers.cloudflare.com/d1/).

## License

MIT
