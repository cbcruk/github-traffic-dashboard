# GitHub Traffic Dashboard

GitHub 레포지토리의 트래픽 통계(views, clones, referrers)를 시각화하는 대시보드입니다.

## Features

- **Dashboard** - 최근 14일 트래픽 데이터 (views, visitors, clones)
- **History** - 90일+ 히스토리 데이터 및 차트
- **Dark Mode** - 시스템 설정 연동 다크 모드
- **Search & Filter** - 레포지토리 검색, 정렬, 필터링
- **Auto Collection** - GitHub Actions cron으로 일일 데이터 자동 수집

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

## Data Collection (Vercel Cron)

매일 UTC 00:00에 Vercel Cron이 `/api/collect` 엔드포인트를 호출해 트래픽 데이터를 자동 수집합니다.

> GitHub Actions의 `schedule` 트리거는 repo 활동이 60일간 없으면 자동 비활성화되기 때문에, 스케줄 수집은 Vercel Cron으로 운영합니다.

### Setup

Vercel 프로젝트의 Environment Variables에 다음을 추가:

- `GITHUB_TOKEN` - GitHub Personal Access Token (`repo` scope)
- `TURSO_DATABASE_URL` - Turso 데이터베이스 URL
- `TURSO_AUTH_TOKEN` - Turso 인증 토큰
- `CRON_SECRET` - `/api/collect` 보호용 랜덤 문자열 (`openssl rand -hex 32`)

스케줄은 [`vercel.json`](./vercel.json)의 `crons`에 정의되어 있습니다. Vercel 무료(Hobby) 플랜은 **하루 1회, UTC 기준** cron을 지원하므로 현재 설정과 일치합니다.

> Hobby 플랜 함수 실행 시간 제한(최대 60초) 때문에 레포 수가 매우 많으면 수집이 중간에 끊길 수 있습니다. 그럴 경우 Pro 플랜이나 아래 수동 워크플로우를 사용하세요.

### 수동 수집 (fallback)

GitHub Actions에 `workflow_dispatch` 전용 워크플로우가 남아 있습니다: Actions > Collect Traffic Data > Run workflow. 이 경우 Repository Secrets에 `TRAFFIC_GITHUB_TOKEN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`이 필요합니다.

## Project Structure

```
├── scripts/
│   ├── init-db.ts          # DB 초기화 스크립트
│   └── collect-traffic.ts  # 데이터 수집 스크립트
├── src/
│   ├── components/         # React 컴포넌트
│   ├── lib/                # 유틸리티 및 DB 클라이언트
│   └── routes/             # 페이지 라우트
└── .github/
    └── workflows/          # GitHub Actions
```

## Deployment

### Vercel

1. Vercel 프로젝트 생성
2. Environment Variables 추가:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `GITHUB_TOKEN` (트래픽 수집용 PAT)
   - `CRON_SECRET` (`/api/collect` 보호용)
3. Deploy — `vercel.json`의 cron이 배포와 함께 자동 등록됩니다.

## License

MIT
