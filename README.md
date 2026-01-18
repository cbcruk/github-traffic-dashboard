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
- [libSQL](https://github.com/tursodatabase/libsql) - SQLite database
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

`.env` 파일에 GitHub Personal Access Token 설정:

```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

> Token은 `repo` scope가 필요합니다. [GitHub Settings](https://github.com/settings/tokens)에서 생성하세요.

### Database Setup

```bash
# 데이터베이스 초기화
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
| `pnpm db:init`    | SQLite 데이터베이스 초기화        |
| `pnpm db:collect` | GitHub API에서 트래픽 데이터 수집 |

## GitHub Actions

매일 UTC 00:00에 자동으로 트래픽 데이터를 수집합니다.

### Setup

1. Repository Settings > Secrets에 `TRAFFIC_GITHUB_TOKEN` 추가
2. Actions 탭에서 워크플로우 활성화

수동 실행: Actions > Collect Traffic Data > Run workflow

## Project Structure

```
├── data/
│   └── traffic.db          # SQLite 데이터베이스
├── scripts/
│   ├── init-db.ts          # DB 초기화 스크립트
│   └── collect-traffic.ts  # 데이터 수집 스크립트
├── src/
│   ├── components/         # React 컴포넌트
│   ├── lib/                # 유틸리티 및 API
│   └── routes/             # 페이지 라우트
└── .github/
    └── workflows/          # GitHub Actions
```

## License

MIT
