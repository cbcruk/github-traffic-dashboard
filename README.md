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
- [Astryx](https://astryx.atmeta.com) - UI components, layout, and theming
- [Recharts](https://recharts.org) - Charts
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) - 앱 호스팅과 cron 수집
- [Cloudflare D1](https://developers.cloudflare.com/d1/) - SQLite 데이터베이스

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Cloudflare 계정 (배포 시 Workers Paid 플랜 필요, [제한 사항](#cloudflare-제한-사항) 참고)

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
# GitHub Token
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# (선택) private 레포를 대시보드에 표시
# SHOW_PRIVATE_REPOS=true
```

> GitHub Token은 `repo` scope가 필요합니다. [GitHub Settings](https://github.com/settings/tokens)에서 생성

### Database Setup

로컬 개발에는 별도 데이터베이스가 필요 없습니다. `pnpm dev`와 `pnpm db:*` 스크립트는 [`wrangler.jsonc`](./wrangler.jsonc)의 D1 binding을 wrangler 로컬 에뮬레이션(`.wrangler/state`)으로 실행합니다.

```bash
# 로컬 D1에 트래픽 데이터 수집 (테이블은 자동 생성)
pnpm db:collect
```

### Development

```bash
pnpm dev
```

http://localhost:3000 에서 확인

## Scripts

| Script            | Description                  |
| ----------------- | ---------------------------- |
| `pnpm dev`        | 개발 서버 실행               |
| `pnpm build`      | 프로덕션 빌드                |
| `pnpm preview`    | 빌드 미리보기                |
| `pnpm test`       | 테스트 실행                  |
| `pnpm format`     | Prettier 포맷 적용           |
| `pnpm db:init`    | 로컬 D1에 마이그레이션 적용  |
| `pnpm db:collect` | 로컬 D1에 트래픽 데이터 수집 |

## Data Collection (Cloudflare Cron)

대시보드 앱과 데이터 수집이 **하나의 Cloudflare Worker**로 배포됩니다. 매일 UTC 00:00에 Cloudflare cron 트리거가 실행되면, Nitro 서버 플러그인([`src/nitro/scheduled.ts`](./src/nitro/scheduled.ts))이 GitHub API에서 트래픽을 수집해 D1에 저장합니다.

> GitHub Actions의 `schedule` 트리거는 repo 활동이 60일간 없으면 자동 비활성화됩니다. Cloudflare cron 트리거에는 이 제한이 없습니다.

수집 로직은 [`src/lib/collect-traffic.ts`](./src/lib/collect-traffic.ts)에 있고, cron 플러그인과 CLI 스크립트(`pnpm db:collect`)가 이를 공유합니다. 레포지토리는 기본 6개씩 병렬로 처리하고, 한 레포의 모든 행은 테이블별 multi-row upsert로 묶어 한 번의 D1 batch로 기록합니다.

수집 대상은 GitHub Traffic API의 네 엔드포인트(views, clones, popular/referrers, popular/paths)입니다. views와 clones는 같은 14일 윈도우를 쓰므로 날짜 기준으로 병합해 `daily_traffic` 한 행에 저장하고, referrers와 paths는 14일 롤링 집계라 수집일 스냅샷으로 `referrers`, `popular_paths`에 남깁니다.

`traffic_totals`에는 GitHub이 함께 내려주는 윈도우 단위 합계를 스냅샷으로 저장합니다. 유니크 방문자는 14일 전체에 걸쳐 중복 제거된 값이라 일별 수치를 더해서는 복원할 수 없기 때문입니다. `repositories`에는 매 실행 시점의 소유 레포 목록을 기록합니다. 트래픽 행은 레포보다 오래 남으므로, 이름이 바뀌거나 삭제된 레포를 걸러내는 기준이 됩니다.

실행 이력은 `collection_runs` 테이블에 기록됩니다. 실행 시작 시 행이 만들어지고 완료 시 `finished_at`, `duration_ms`, 성공/실패 레포 수가 채워지므로, `finished_at`이 NULL인 행은 중간에 중단된 실행을 뜻합니다. GitHub은 트래픽이 없는 날도 0으로 돌려주기 때문에 이 테이블 없이는 "수집 실패"와 "트래픽 0"을 구분할 수 없습니다.

cron 스케줄과 D1 binding은 [`wrangler.jsonc`](./wrangler.jsonc)에 정의됩니다. Nitro가 빌드 시 생성하는 Worker 설정(`.output/server/wrangler.json`)에 이 파일이 병합됩니다.

### 수집 상태와 실패 알림

GitHub은 트래픽을 14일만 보관하므로, 수집이 조용히 멈추면 그 기간 데이터는 복구할 수 없습니다. 그래서 `collection_runs`를 두 곳에서 읽습니다.

- **대시보드 헤더:** 마지막 수집 시각과 상태(정상, 진행 중, 일부 실패, 실패, 수집 전)를 표시합니다. 공개 페이지이므로 실패한 레포 이름, 오류 메시지, 레포 수는 보여주지 않습니다.
- **헬스 체크 cron(UTC 06:00):** 최근 실행을 확인하고, 설정된 채널로 알립니다. 채널이 없으면 로그만 남깁니다.

실패로 판단하는 경우는 다음과 같습니다.

| 상태      | 조건                                                                        |
| --------- | --------------------------------------------------------------------------- |
| 실패      | 26시간 넘게 실행이 시작되지 않음, 1시간이 지나도 끝나지 않음, 오류로 중단됨 |
| 일부 실패 | 실패한 레포가 있음, 성공한 레포 수가 직전 정상 실행의 절반 미만으로 줄어듦  |

알림 채널은 둘 중 하나 또는 둘 다 쓸 수 있습니다.

- **GitHub 이슈(`ALERT_GITHUB_REPO=owner/name`):** 문제가 생기면 `collection-health` 라벨을 단 이슈를 엽니다. 문제가 계속되는 동안에는 새 이슈 대신 그 이슈에 매일 댓글을 달고, 수집이 정상으로 돌아오면 이슈를 닫습니다. `GITHUB_TOKEN`으로 요청하므로 토큰에 해당 레포의 Issues 쓰기 권한이 있어야 합니다(classic PAT의 `repo` scope면 충분합니다).
  - 대상 레포가 public이면 private 레포와 공개 여부를 모르는 레포의 이름을 `(private repository)`로 가립니다.
  - 토큰 주인이 만든 이슈와 댓글이라 GitHub이 본인에게는 알림을 보내지 않습니다. 레포 이슈 목록이나 라벨로 확인하세요.
- **웹훅(`ALERT_WEBHOOK_URL`):** URL이 Discord(`discord.com`)나 Slack(`hooks.slack.com`)이면 각 형식의 JSON으로, 그 밖의 URL(예: `https://ntfy.sh/<topic>`)이면 plain text로 POST합니다. 문제가 계속되면 매일 한 번씩 보냅니다. 비공개 채널이라는 전제로 레포 이름을 가리지 않습니다.

한 채널이 실패해도 다른 채널은 실행되고, 실패 내용은 Worker 로그에 남습니다. 두 값 모두 `wrangler.jsonc`의 `vars`가 아니라 시크릿으로 등록하세요. `wrangler deploy`는 설정 파일에 없는 일반 변수를 지우지만 시크릿은 유지하므로, fork한 레포의 설정 파일을 upstream과 다르게 유지할 필요가 없습니다.

헬스 체크 cron은 표현식 값으로 구분합니다. 시각을 바꾸려면 `wrangler.jsonc`의 `triggers.crons`와 `src/lib/collection-health.ts`의 `HEALTH_CHECK_CRON`을 함께 바꾸세요. 26시간 기준은 수집이 매일 돈다는 전제입니다.

### 스키마 마이그레이션

스키마 변경은 [`src/lib/schema.ts`](./src/lib/schema.ts)의 `MIGRATIONS`에 버전 순서대로 쌓이고, 적용된 버전은 `schema_migrations` 테이블에 기록됩니다. 배포 단계에서 따로 실행할 명령은 없습니다.

- 대시보드는 Worker isolate마다 첫 쿼리 전에 밀린 마이그레이션을 적용합니다. 새 버전을 배포하면 다음 cron을 기다리지 않고 첫 요청에서 스키마가 맞춰집니다.
- cron 수집도 시작할 때 같은 과정을 거칩니다.
- 마이그레이션 하나의 변경과 버전 기록은 한 D1 batch로 실행되므로, 실패하면 함께 롤백되고 다음 시도에서 다시 적용됩니다.

스키마를 바꿀 때는 이미 배포된 마이그레이션을 고치지 말고 다음 버전을 추가하세요. 이미 그 버전을 기록한 배포에서는 다시 실행되지 않습니다.

## Project Structure

```
├── scripts/
│   ├── init-db.ts          # 로컬 D1 초기화
│   ├── collect-traffic.ts  # 로컬 D1 수집 CLI
│   └── export-turso.ts     # Turso → D1 일회성 이관
├── src/
│   ├── components/         # React 컴포넌트
│   ├── lib/                # 유틸리티, DB 클라이언트, 수집 로직
│   ├── nitro/              # Nitro 서버 플러그인 (cron 수집)
│   └── routes/             # 페이지 라우트
└── wrangler.jsonc          # D1 binding, cron 트리거
```

## Private 레포

수집기는 토큰으로 접근 가능한 private 레포까지 모두 수집하지만, 대시보드에는 **public 레포만 표시**합니다. 배포된 Worker URL은 누구나 열 수 있기 때문입니다.

private 레포까지 보려면 먼저 [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)로 대시보드 접근을 제한한 뒤 `SHOW_PRIVATE_REPOS=true`를 설정하세요.

공개 여부는 `repositories.private`에 기록됩니다. 이 값이 없는 레포(이 컬럼이 추가되기 전에 수집된 레포)는 다음 수집이 끝날 때까지 private으로 취급되어 숨겨집니다.

## Deployment

앱과 cron이 하나의 Cloudflare Worker로 함께 배포됩니다.

```bash
# 1. Cloudflare 로그인
npx wrangler login

# 2. 빌드 + 배포 (D1 데이터베이스와 cron 트리거가 함께 등록됨)
pnpm run deploy

# 3. 시크릿 등록
npx wrangler secret put GITHUB_TOKEN
# (선택) 수집 실패를 기록할 GitHub 레포 (owner/name)
# npx wrangler secret put ALERT_GITHUB_REPO
# (선택) 수집 실패 알림을 받을 웹훅 URL (Discord, Slack, ntfy 등)
# npx wrangler secret put ALERT_WEBHOOK_URL
# (선택) Cloudflare Access로 보호한 경우에만
# npx wrangler secret put SHOW_PRIVATE_REPOS
```

`wrangler.jsonc`에는 `database_id`가 없습니다. 첫 배포 때 wrangler가 `github-traffic-dashboard`라는 이름의 D1 데이터베이스를 찾아 연결하고, 없으면 새로 만듭니다. 로컬에서 배포하면 wrangler가 생성된 ID를 `wrangler.jsonc`에 적어줄 수 있는데, 커밋하지 않아도 이후 배포는 계속 동작합니다.

> `pnpm deploy`는 pnpm 내장 명령과 충돌하므로 반드시 `pnpm run deploy`로 실행하세요.

| Script            | Description                           |
| ----------------- | ------------------------------------- |
| `pnpm run deploy` | 빌드 후 Cloudflare에 배포 (cron 포함) |
| `pnpm cf:preview` | 로컬에서 빌드된 Worker 미리보기       |
| `pnpm cf:tail`    | 배포된 Worker 실시간 로그             |

> 배포 후 Cloudflare 대시보드 > Workers > 해당 Worker > Settings > Triggers에서 cron 등록을 확인할 수 있습니다. `GITHUB_TOKEN`은 `repo` scope PAT여야 합니다.

### Cloudflare 제한 사항

수집은 cron 호출 한 번 안에서 끝나야 하므로 **Workers Paid 플랜**이 필요합니다. 무료 플랜은 호출당 subrequest 50개, D1 쿼리 50개로 제한되어 레포 몇 개만 처리할 수 있습니다.

Paid 플랜에서도 D1은 호출당 쿼리 1000개로 제한됩니다. 레포 하나에 쿼리 최대 4개를 쓰므로, 한 번에 수집할 수 있는 레포는 약 240개입니다. 이를 넘으면 실행이 도중에 실패하고 `collection_runs.finished_at`이 NULL로 남습니다.

### Turso에서 옮기기

D1 전환 이전에 Turso로 수집하던 배포는 기존 데이터를 한 번 옮겨야 합니다. GitHub은 트래픽을 14일만 보관하므로 그보다 오래된 기록은 Turso에만 있습니다.

```bash
# 1. D1 데이터베이스를 먼저 만들어 둡니다 (배포 시 이 이름으로 연결됨)
npx wrangler d1 create github-traffic-dashboard

# 2. Turso 데이터를 SQL 파일로 내보냅니다 (스키마 포함)
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... pnpm db:export-turso

# 3. D1으로 가져옵니다
npx wrangler d1 execute github-traffic-dashboard --remote --file=turso-export.sql

# 4. 배포 후 Turso 시크릿 삭제
npx wrangler secret delete TURSO_DATABASE_URL
npx wrangler secret delete TURSO_AUTH_TOKEN
```

내보내기와 배포 사이에 cron(UTC 00:00)이 Turso에 한 번 더 기록하면 그날의 referrers/paths 스냅샷만 D1에서 빠집니다. 일별 트래픽은 다음 수집이 최근 14일을 다시 채웁니다.

## License

MIT
