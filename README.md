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

## Data Collection (Cloudflare Workers Cron)

매일 UTC 00:00에 Cloudflare Worker의 cron 트리거가 GitHub API에서 트래픽을 수집해 Turso에 저장합니다. 데이터 수집은 웹앱(Vercel)과 분리되어 있어, Vercel은 대시보드 조회 전용입니다.

> GitHub Actions의 `schedule` 트리거는 repo 활동이 60일간 없으면 자동 비활성화됩니다. Cloudflare cron 트리거에는 이 제한이 없습니다.

### Setup

```bash
# 1. Cloudflare 로그인
npx wrangler login

# 2. Worker 시크릿 등록 (worker/wrangler.toml 기준)
npx wrangler secret put GITHUB_TOKEN       --config worker/wrangler.toml
npx wrangler secret put TURSO_DATABASE_URL --config worker/wrangler.toml
npx wrangler secret put TURSO_AUTH_TOKEN   --config worker/wrangler.toml

# 3. 배포 (cron 트리거가 함께 등록됨)
pnpm worker:deploy
```

수집 로직은 [`src/lib/collect-traffic.ts`](./src/lib/collect-traffic.ts)에 있고, Worker([`worker/index.ts`](./worker/index.ts))와 CLI 스크립트가 이를 공유합니다. 스케줄은 [`worker/wrangler.toml`](./worker/wrangler.toml)의 `[triggers] crons`에 정의되어 있습니다.

| Script               | Description                   |
| -------------------- | ----------------------------- |
| `pnpm worker:dev`    | 로컬에서 Worker 실행 (테스트) |
| `pnpm worker:deploy` | Worker 배포 + cron 등록       |
| `pnpm worker:tail`   | 배포된 Worker 실시간 로그     |

> 배포 후 즉시 확인하려면 Worker의 HTTP 엔드포인트를 호출하거나(수동 실행 지원), Cloudflare 대시보드 > Workers > Triggers에서 cron을 확인하세요.

### 수동 수집 (fallback)

GitHub Actions에 `workflow_dispatch` 전용 워크플로우가 남아 있습니다: Actions > Collect Traffic Data > Run workflow. 이 경우 Repository Secrets에 `TRAFFIC_GITHUB_TOKEN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`이 필요합니다. 로컬에서는 `pnpm db:collect`로도 수집할 수 있습니다.

## Project Structure

```
├── scripts/
│   ├── init-db.ts          # DB 초기화 스크립트
│   └── collect-traffic.ts  # 데이터 수집 CLI
├── worker/
│   ├── index.ts            # Cloudflare Worker (cron 수집)
│   └── wrangler.toml       # Worker 설정 + cron 스케줄
├── src/
│   ├── components/         # React 컴포넌트
│   ├── lib/                # 유틸리티, DB 클라이언트, 수집 로직
│   └── routes/             # 페이지 라우트
└── .github/
    └── workflows/          # GitHub Actions (수동 fallback)
```

## Deployment

### Vercel (대시보드)

웹앱은 Turso를 읽어 대시보드를 렌더링하기만 합니다. 데이터 수집은 Cloudflare Worker가 담당하므로 Vercel에는 수집용 시크릿이 필요 없습니다.

1. Vercel 프로젝트 생성
2. Environment Variables 추가:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
3. Deploy

데이터 수집(Cloudflare Worker) 설정은 위 [Data Collection](#data-collection-cloudflare-workers-cron) 섹션을 참고하세요.

## License

MIT
