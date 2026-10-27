import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Selector } from '@astryxdesign/core/Selector'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { VStack } from '@astryxdesign/core/VStack'
import { getHistoricalTraffic, getPreviousPeriods } from '../lib/github'
import { RankingSkeleton } from '../components/page-skeleton'
import { ThemeToggle } from '../components/theme-toggle'
import type { PreviousPeriods } from '../lib/period-comparison'
import {
  DEFAULT_RANKING_METRIC,
  DEFAULT_RANKING_PERIOD,
  RANKING_SIZE,
  currentSums,
  rankRepos,
  rankingMetricOptions,
  rankingPeriodOptions,
  validateRankingSearch,
  type RankedRepo,
} from '../lib/ranking'
import type { DailyTraffic } from '../lib/github.types'
import { repoPath } from '../lib/repo-detail'

export const Route = createFileRoute('/top')({
  validateSearch: validateRankingSearch,
  loader: async (): Promise<{
    daily: DailyTraffic[]
    previousPeriods: PreviousPeriods
  }> => {
    const [daily, previousPeriods] = await Promise.all([
      getHistoricalTraffic().catch((error) => {
        console.error('Failed to fetch historical data:', error)
        return []
      }),
      getPreviousPeriods().catch(() => ({})),
    ])
    return { daily, previousPeriods }
  },
  pendingComponent: RankingSkeleton,
  component: RankingPage,
})

interface RankingRow extends RankedRepo, Record<string, unknown> {}

function RankChange({
  rank,
  previousRank,
}: Pick<RankedRepo, 'rank' | 'previousRank'>) {
  if (previousRank === null) {
    return (
      <Token
        size="sm"
        color="blue"
        label="New"
        description="No traffic in the previous period"
      />
    )
  }
  const moved = previousRank - rank
  if (moved === 0) {
    return <Text type="supporting">No change</Text>
  }
  return (
    <Token
      size="sm"
      color={moved > 0 ? 'green' : 'red'}
      label={`${moved > 0 ? '↑' : '↓'}${Math.abs(moved)}`}
      description={`${moved > 0 ? 'Up' : 'Down'} from #${previousRank}`}
    />
  )
}

function RankingPage() {
  const { daily, previousPeriods } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/top' })

  const days = search.period ?? DEFAULT_RANKING_PERIOD
  const metric = search.metric ?? DEFAULT_RANKING_METRIC
  const metricLabel =
    rankingMetricOptions.find((option) => option.value === metric)?.label ?? ''

  function updateSearch(updates: { period?: string; metric?: string }) {
    navigate({
      search: (prev) => validateRankingSearch({ ...prev, ...updates }),
      replace: true,
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const previousPeriod = previousPeriods[days]
  const isIncomplete = previousPeriod?.incomplete ?? false
  const ranked = rankRepos(
    currentSums(daily, today, days),
    previousPeriod?.byRepo ?? {},
    metric,
  )

  const columns = [
    {
      key: 'rank',
      header: '#',
      width: pixel(56),
      renderCell: (row: RankingRow) => (
        <Text weight="bold" hasTabularNumbers>
          {row.rank}
        </Text>
      ),
    },
    {
      key: 'repo',
      header: 'Repository',
      width: proportional(1),
      renderCell: (row: RankingRow) => (
        <Link href={repoPath(row.repo)}>{row.repo.split('/')[1]}</Link>
      ),
    },
    {
      key: 'value',
      header: metricLabel,
      width: pixel(140),
      align: 'end' as const,
      renderCell: (row: RankingRow) => (
        <Text hasTabularNumbers>{row.value.toLocaleString()}</Text>
      ),
    },
    // A rank change across a collection gap would be as misleading as the
    // totals' percentage, so the column goes with it.
    ...(isIncomplete || !previousPeriod
      ? []
      : [
          {
            key: 'previousRank',
            header: `vs previous ${days} days`,
            width: pixel(180),
            align: 'end' as const,
            renderCell: (row: RankingRow) => <RankChange {...row} />,
          },
        ]),
  ]

  return (
    <Layout height="auto" contentWidth={1280} padding={6}>
      <LayoutContent>
        <VStack gap={8}>
          <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
            <VStack gap={1}>
              <Link href="/" isStandalone type="supporting">
                <HStack gap={1} vAlign="center" as="span">
                  <Icon icon={ArrowLeft} size="sm" />
                  Back to Dashboard
                </HStack>
              </Link>
              <Heading level={1}>Top {RANKING_SIZE} Repositories</Heading>
              <Text type="supporting">
                Ranked by {metricLabel.toLowerCase()} over the last {days} days
              </Text>
            </VStack>
            <ThemeToggle />
          </HStack>

          <HStack gap={4} wrap="wrap" vAlign="end">
            <Selector
              label="Period"
              value={String(days)}
              onChange={(period) => updateSearch({ period })}
              options={rankingPeriodOptions}
              width={160}
            />
            <Selector
              label="Ranked by"
              value={metric}
              onChange={(value) => updateSearch({ metric: value })}
              options={rankingMetricOptions}
              width={180}
            />
            {isIncomplete && (
              <Token
                color="yellow"
                label="Incomplete data"
                description={`Collection missed days in this or the previous ${days} days, so rank changes are hidden`}
              />
            )}
          </HStack>

          <Card>
            {ranked.length > 0 ? (
              <Table<RankingRow>
                data={ranked as RankingRow[]}
                columns={columns}
                idKey="repo"
              />
            ) : (
              <EmptyState
                title="No traffic in this period"
                description="Pick a longer period, or wait for the daily collection."
                isCompact
              />
            )}
          </Card>
        </VStack>
      </LayoutContent>
    </Layout>
  )
}
