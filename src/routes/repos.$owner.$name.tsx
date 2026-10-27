import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
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
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../components/chart'
import { HistorySkeleton } from '../components/page-skeleton'
import { StatCard } from '../components/stat-card'
import { ThemeToggle } from '../components/theme-toggle'
import { getRepoDetail } from '../lib/github'
import { addDays } from '../lib/period-comparison'
import {
  buildDailySeries,
  repoRangeOptions,
  validateRepoDetailSearch,
  type RepoDetail,
} from '../lib/repo-detail'

const chartConfig = {
  views: { label: 'Views', color: 'var(--color-data-categorical-blue)' },
  visitors: { label: 'Visitors', color: 'var(--color-data-categorical-teal)' },
  clones: { label: 'Clones', color: 'var(--color-data-categorical-purple)' },
} satisfies ChartConfig

export const Route = createFileRoute('/repos/$owner/$name')({
  validateSearch: validateRepoDetailSearch,
  loader: async ({ params }): Promise<RepoDetail | null> => {
    try {
      return await getRepoDetail({
        data: { repo: `${params.owner}/${params.name}` },
      })
    } catch (error) {
      console.error('Failed to fetch repository detail:', error)
      return null
    }
  },
  pendingComponent: HistorySkeleton,
  component: RepoDetailPage,
})

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <Layout height="auto" contentWidth={1280} padding={6}>
      <LayoutContent>
        <VStack gap={8}>{children}</VStack>
      </LayoutContent>
    </Layout>
  )
}

function BackLink() {
  return (
    <Link href="/" isStandalone type="supporting">
      <HStack gap={1} vAlign="center" as="span">
        <Icon icon={ArrowLeft} size="sm" />
        Back to Dashboard
      </HStack>
    </Link>
  )
}

function RepoDetailPage() {
  const detail = Route.useLoaderData()
  const { owner, name } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/repos/$owner/$name' })

  if (!detail) {
    return (
      <PageFrame>
        <BackLink />
        <EmptyState
          title="Repository not found"
          description={`${owner}/${name} has not been collected, or this dashboard does not show it.`}
        />
      </PageFrame>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const firstDate = detail.daily[0]?.date ?? today
  const from = search.range ? addDays(today, 1 - search.range) : firstDate
  const series = buildDailySeries(detail.daily, detail.uncovered, from, today)
  const hasGap = series.some((point) => point.views === null)
  // `first_seen` starts with the repositories table (2026-09), while daily
  // traffic can reach further back.
  const trackedSince =
    detail.daily[0] && detail.daily[0].date < detail.firstSeen
      ? detail.daily[0].date
      : detail.firstSeen

  const chartData = series.map((point) => ({
    ...point,
    dateLabel: new Date(point.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(search.range && search.range <= 90 ? {} : { year: '2-digit' }),
    }),
  }))
  const total = (metric: 'views' | 'visitors' | 'clones') =>
    series.reduce((sum, point) => sum + (point[metric] ?? 0), 0)

  // GitHub returns paths absolute from the site root; show them relative to
  // the repository, as the dashboard cards do.
  const repoPrefix = `/${detail.repo}`
  function pathLabel(path: string): string {
    if (!path.startsWith(repoPrefix)) return path
    return path.slice(repoPrefix.length).replace(/^\//, '') || 'Repository root'
  }

  return (
    <PageFrame>
      <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
        <VStack gap={1}>
          <BackLink />
          <Heading level={1}>{name}</Heading>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Link
              href={`https://github.com/${detail.repo}`}
              isExternalLink
              isStandalone
              type="supporting"
            >
              <HStack gap={1} vAlign="center" as="span">
                {detail.repo}
                <Icon icon={ExternalLink} size="xsm" />
              </HStack>
            </Link>
            <Text type="supporting">
              Tracked since {trackedSince} · last collected {detail.lastSeen}
            </Text>
          </HStack>
        </VStack>
        <ThemeToggle />
      </HStack>

      <HStack gap={4} wrap="wrap" vAlign="end">
        <Selector
          label="Period"
          value={String(search.range ?? 'all')}
          onChange={(range) =>
            navigate({
              search: validateRepoDetailSearch({ range }),
              replace: true,
            })
          }
          options={repoRangeOptions}
          width={180}
        />
      </HStack>

      <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
        <StatCard label="Total Views" value={total('views')} />
        <StatCard label="Total Visitors" value={total('visitors')} />
        <StatCard label="Total Clones" value={total('clones')} />
      </Grid>

      <Card>
        <VStack gap={4}>
          <Heading level={2}>Traffic Over Time</Heading>
          {hasGap && (
            <Text type="supporting">
              Breaks in the chart mark days the collector missed. GitHub keeps
              traffic for 14 days only, so they cannot be filled in.
            </Text>
          )}
          {detail.daily.length > 0 ? (
            <ChartContainer config={chartConfig} height={320}>
              <AreaChart data={chartData} margin={{ left: 0, right: 0 }}>
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
                {(['views', 'visitors', 'clones'] as const).map((key) => (
                  <Area
                    key={key}
                    dataKey={key}
                    type="monotone"
                    fill={`var(--color-${key})`}
                    fillOpacity={0.4}
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          ) : (
            <EmptyState
              title="No traffic collected yet"
              description="Daily traffic appears here after the next collection."
              isCompact
            />
          )}
        </VStack>
      </Card>

      <Grid columns={{ minWidth: 340, max: 2 }} gap={4}>
        <Card>
          {detail.referrers.length > 0 ? (
            <List header="Referrers (last 14 days)" density="compact">
              {detail.referrers.map((ref) => (
                <ListItem
                  key={ref.referrer}
                  label={ref.referrer}
                  endContent={
                    <Text color="secondary" hasTabularNumbers>
                      {ref.count.toLocaleString()}
                    </Text>
                  }
                />
              ))}
            </List>
          ) : (
            <EmptyState
              title="No referrers"
              description="GitHub reported no referring sites in the last 14 days."
              isCompact
            />
          )}
        </Card>
        <Card>
          {detail.paths.length > 0 ? (
            <List header="Popular paths (last 14 days)" density="compact">
              {detail.paths.map((path) => (
                <ListItem
                  key={path.path}
                  label={pathLabel(path.path)}
                  href={`https://github.com${path.path}`}
                  target="_blank"
                  endContent={
                    <Text color="secondary" hasTabularNumbers>
                      {path.count.toLocaleString()}
                    </Text>
                  }
                />
              ))}
            </List>
          ) : (
            <EmptyState
              title="No popular paths"
              description="GitHub reported no visited paths in the last 14 days."
              isCompact
            />
          )}
        </Card>
      </Grid>
    </PageFrame>
  )
}
