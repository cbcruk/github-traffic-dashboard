# GitHub Traffic Dashboard

GitHub 레포지토리의 트래픽 통계(views, clones, referrers)를 시각화하는 대시보드입니다.

## Features

- **Dashboard** - 최근 14일 트래픽 데이터 (views, visitors, clones)
- **History** - 90일+ 히스토리 데이터 및 차트
- **Dark Mode** - 시스템 설정 연동 다크 모드
- **Search & Filter** - 레포지토리 검색, 정렬, 필터링
- **Auto Collection** - Cloudflare Workers cron으로 일일 데이터 자동 수집

## Tech Stack

- [TanStack Start](https://tanstack.com/start) - Full-stack React framework
- [TanStack Router](https://tanstack.com/router) - Type-safe routing
- [shadcn/ui](https://ui.shadcn.com) - UI components
- [Recharts](https://recharts.org) - Charts
- [Turso](https://turso.tech) - Edge SQLite database
- [Tailwind CSS v4](https://tailwindcss.com) - Styling

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Installation

```bash
pnpm install
```

### Environment Variables

```bash
cp .env.example .env
```

`.env` 파일에 환경 변수 설정:

```
# Turso Database
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# GitHub Token
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

> - Turso 데이터베이스는 [turso.tech](https://turso.tech)에서 무료로 생성 가능
> - GitHub Token은 `repo` scope가 필요합니다. [GitHub Settings](https://github.com/settings/tokens)에서 생성

### Database Setup

```bash
# Turso CLI로 데이터베이스 생성
turso db create github-traffic
turso db tokens create github-traffic

# 테이블 초기화
pnpm db:init

# 트래픽 데이터 수집
pnpm db:collect
```

### Development

```bash
pnpm dev
```

http://localhost:3000 에서 확인

## Scripts

| Script            | Description                       |
| ----------------- | --------------------------------- |
| `pnpm dev`        | 개발 서버 실행                    |
| `pnpm build`      | 프로덕션 빌드                     |
| `pnpm preview`    | 빌드 미리보기                     |
| `pnpm test`       | 테스트 실행                       |
| `pnpm format`     | Prettier 포맷 적용                |
| `pnpm db:init`    | Turso 데이터베이스 테이블 초기화  |
| `pnpm db:collect` | GitHub API에서 트래픽 데이터 수집 |

## Data Collection (Cloudflare Cron)

대시보드 앱과 데이터 수집이 **하나의 Cloudflare Worker**로 배포됩니다. 매일 UTC 00:00에 Cloudflare cron 트리거가 실행되면, Nitro 서버 플러그인([`src/nitro/scheduled.ts`](./src/nitro/scheduled.ts))이 GitHub API에서 트래픽을 수집해 Turso에 저장합니다.

> GitHub Actions의 `schedule` 트리거는 repo 활동이 60일간 없으면 자동 비활성화됩니다. Cloudflare cron 트리거에는 이 제한이 없습니다.

수집 로직은 [`src/lib/collect-traffic.ts`](./src/lib/collect-traffic.ts)에 있고, cron 플러그인과 CLI 스크립트(`pnpm db:collect`)가 이를 공유합니다. cron 스케줄과 Cloudflare 프리셋은 [`vite.config.ts`](./vite.config.ts)의 Nitro 설정(`cloudflare.wrangler.triggers`)에 정의됩니다.

### 수동 수집 (fallback)

GitHub Actions에 `workflow_dispatch` 전용 워크플로우가 남아 있습니다: Actions > Collect Traffic Data > Run workflow. 이 경우 Repository Secrets에 `TRAFFIC_GITHUB_TOKEN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`이 필요합니다. 로컬에서는 `pnpm db:collect`로도 수집할 수 있습니다.

## Project Structure

```
├── scripts/
│   ├── init-db.ts          # DB 초기화 스크립트
│   └── collect-traffic.ts  # 데이터 수집 CLI
├── src/
│   ├── components/         # React 컴포넌트
│   ├── lib/                # 유틸리티, DB 클라이언트, 수집 로직
│   ├── nitro/              # Nitro 서버 플러그인 (cron 수집)
│   └── routes/             # 페이지 라우트
└── .github/
    └── workflows/          # GitHub Actions (수동 fallback)
```

## Deployment

앱과 cron이 하나의 Cloudflare Worker로 함께 배포됩니다.

```bash
# 1. Cloudflare 로그인
npx wrangler login

# 2. 시크릿 등록 (빌드 후 생성되는 Worker에 적용됨)
pnpm build
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN

# 3. 빌드 + 배포 (cron 트리거가 함께 등록됨)
pnpm run deploy
```

> `pnpm deploy`는 pnpm 내장 명령과 충돌하므로 반드시 `pnpm run deploy`로 실행하세요.

| Script            | Description                           |
| ----------------- | ------------------------------------- |
| `pnpm run deploy` | 빌드 후 Cloudflare에 배포 (cron 포함) |
| `pnpm cf:preview` | 로컬에서 빌드된 Worker 미리보기       |
| `pnpm cf:tail`    | 배포된 Worker 실시간 로그             |

> 배포 후 Cloudflare 대시보드 > Workers > 해당 Worker > Settings > Triggers에서 cron 등록을 확인할 수 있습니다. `GITHUB_TOKEN`은 `repo` scope PAT여야 합니다.

## License

MIT
