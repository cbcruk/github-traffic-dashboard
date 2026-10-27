import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { Selector } from '@astryxdesign/core/Selector'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { VStack } from '@astryxdesign/core/VStack'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../components/chart'
import { RankingSkeleton } from '../components/page-skeleton'
import { ThemeToggle } from '../components/theme-toggle'
import { getReferrerAnalysis } from '../lib/github'
import {
  DEFAULT_REFERRER_PERIOD,
  referrerPeriodOptions,
  validateReferrersSearch,
  type ReferrerAnalysis,
  type ReferrerTotal,
} from '../lib/referrers'
import { repoPath } from '../lib/repo-detail'

const TREND_COLORS = ['blue', 'orange', 'teal', 'purple', 'pink']

export const Route = createFileRoute('/referrers')({
  validateSearch: validateReferrersSearch,
  loaderDeps: ({ search }) => ({
    days: search.period ?? DEFAULT_REFERRER_PERIOD,
  }),
  loader: async ({ deps }): Promise<ReferrerAnalysis | null> => {
    try {
      return await getReferrerAnalysis({ data: { days: deps.days } })
    } catch (error) {
      console.error('Failed to fetch referrers:', error)
      return null
    }
  },
  pendingComponent: RankingSkeleton,
  component: ReferrersPage,
})

interface ReferrerRow extends ReferrerTotal, Record<string, unknown> {}

function ReferrersPage() {
  const analysis = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/referrers' })
  const days = search.period ?? DEFAULT_REFERRER_PERIOD

  function updateSearch(updates: { period?: string; referrer?: string }) {
    navigate({
      search: (prev) => validateReferrersSearch({ ...prev, ...updates }),
      replace: true,
    })
  }

  const totals = analysis?.totals ?? []
  const selected = totals.find((t) => t.referrer === search.referrer)
  const showUniques = totals.some((t) => t.uniques !== null)

  // Referrer names such as `news.ycombinator.com` are not valid CSS custom
  // property names, which the chart derives from its keys, so series are
  // keyed by position instead.
  const trendReferrers = analysis?.trendReferrers ?? []
  const chartConfig = Object.fromEntries(
    trendReferrers.map((referrer, i) => [
      `r${i}`,
      {
        label: referrer,
        color: `var(--color-data-categorical-${TREND_COLORS[i]})`,
      },
    ]),
  ) satisfies ChartConfig
  const chartData = (analysis?.trend ?? []).map((point) => ({
    ...Object.fromEntries(
      trendReferrers.map((referrer, i) => [`r${i}`, point[referrer]]),
    ),
    dateLabel: new Date(point.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }))

  const columns = [
    {
      key: 'referrer',
      header: 'Referrer',
      width: proportional(1),
      renderCell: (row: ReferrerRow) => (
        <Link
          href={`/referrers?${new URLSearchParams({
            ...(search.period ? { period: String(search.period) } : {}),
            referrer: row.referrer,
          })}`}
        >
          {row.referrer}
        </Link>
      ),
    },
    {
      key: 'count',
      header: 'Views',
      width: pixel(120),
      align: 'end' as const,
      renderCell: (row: ReferrerRow) => (
        <Text hasTabularNumbers>{row.count.toLocaleString()}</Text>
      ),
    },
    ...(showUniques
      ? [
          {
            key: 'uniques',
            header: 'Uniques',
            width: pixel(120),
            align: 'end' as const,
            renderCell: (row: ReferrerRow) => (
              <Text hasTabularNumbers>
                {(row.uniques ?? 0).toLocaleString()}
              </Text>
            ),
          },
        ]
      : []),
    {
      key: 'repos',
      header: 'Repositories',
      width: pixel(120),
      align: 'end' as const,
      renderCell: (row: ReferrerRow) => (
        <Text hasTabularNumbers>{row.repos.length}</Text>
      ),
    },
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
              <Heading level={1}>Referrers</Heading>
              <Text type="supporting">
                {analysis?.anchor
                  ? `Sites sending visitors to your repositories, ${days} days through ${analysis.anchor}`
                  : 'Sites sending visitors to your repositories'}
              </Text>
            </VStack>
            <ThemeToggle />
          </HStack>

          <HStack gap={4} wrap="wrap" vAlign="end">
            <Selector
              label="Period"
              value={String(days)}
              onChange={(period) => updateSearch({ period })}
              options={referrerPeriodOptions}
              width={160}
            />
            {analysis?.isIncomplete && (
              <Token
                color="yellow"
                label="Incomplete data"
                description="Collection missed a day these totals are built from, so they undercount"
              />
            )}
          </HStack>

          {totals.length === 0 ? (
            <EmptyState
              title="No referrers in this period"
              description="GitHub reports referrers once visitors arrive from other sites."
            />
          ) : (
            <>
              <Grid columns={{ minWidth: 340, max: 2 }} gap={4}>
                <Card>
                  <VStack gap={3}>
                    <Table<ReferrerRow>
                      data={totals as ReferrerRow[]}
                      columns={columns}
                      idKey="referrer"
                      density="compact"
                    />
                    <Text type="supporting">
                      GitHub reports each repository&apos;s top 10 referrers
                      only, so totals can undercount.
                      {showUniques
                        ? ' Uniques are summed across repositories, so a visitor to two of them counts twice.'
                        : ' Uniques are shown for 14 days only: they cannot be added across GitHub’s 14-day windows.'}
                    </Text>
                  </VStack>
                </Card>
                <Card>
                  {selected ? (
                    <List
                      header={`${selected.referrer} by repository`}
                      density="compact"
                    >
                      {selected.repos.map(({ repo, count }) => (
                        <ListItem
                          key={repo}
                          label={repo.split('/')[1]}
                          href={repoPath(repo)}
                          endContent={
                            <Text color="secondary" hasTabularNumbers>
                              {count.toLocaleString()}
                            </Text>
                          }
                        />
                      ))}
                    </List>
                  ) : (
                    <EmptyState
                      title="Pick a referrer"
                      description="Select a referrer to see which repositories it sends visitors to."
                      isCompact
                    />
                  )}
                </Card>
              </Grid>

              <Card>
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2}>Trend</Heading>
                    <Text type="supporting">
                      Each point is the 14 days up to that day, as GitHub
                      reports it. Breaks mark days the collector missed.
                    </Text>
                  </VStack>
                  <ChartContainer config={chartConfig} height={320}>
                    <LineChart data={chartData} margin={{ left: 0, right: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="dateLabel"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={24}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tick={{ fontSize: 12 }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      {trendReferrers.map((referrer, i) => (
                        <Line
                          key={referrer}
                          dataKey={`r${i}`}
                          type="monotone"
                          stroke={`var(--color-r${i})`}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ChartContainer>
                </VStack>
              </Card>
            </>
          )}
        </VStack>
      </LayoutContent>
    </Layout>
  )
}
