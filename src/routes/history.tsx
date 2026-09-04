import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { getHistoricalTraffic } from '../lib/github'
import { ThemeToggle } from '../components/theme-toggle'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../components/chart'
import type { DailyTraffic } from '../lib/github.types'

const chartConfig = {
  views: { label: 'Views', color: 'var(--color-data-categorical-blue)' },
  visitors: { label: 'Visitors', color: 'var(--color-data-categorical-teal)' },
  clones: { label: 'Clones', color: 'var(--color-data-categorical-purple)' },
} satisfies ChartConfig

const dateRangeOptions = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
]

export const Route = createFileRoute('/history')({
  loader: async (): Promise<DailyTraffic[]> => {
    try {
      return await getHistoricalTraffic()
    } catch (error) {
      console.error('Failed to fetch historical data:', error)
      return []
    }
  },
  component: HistoryPage,
})

function PageHeader({ hasSubtitle }: { hasSubtitle: boolean }) {
  return (
    <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
      <VStack gap={1}>
        <Link href="/" isStandalone type="supporting">
          <HStack gap={1} vAlign="center" as="span">
            <Icon icon={ArrowLeft} size="sm" />
            Back to Dashboard
          </HStack>
        </Link>
        <Heading level={1}>Traffic History</Heading>
        {hasSubtitle && (
          <Text type="supporting">
            Historical traffic data from your repositories
          </Text>
        )}
      </VStack>
      <ThemeToggle />
    </HStack>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <VStack gap={2}>
        <Text type="supporting">{label}</Text>
        <Text size="3xl" weight="bold" hasTabularNumbers>
          {value.toLocaleString()}
        </Text>
      </VStack>
    </Card>
  )
}

function HistoryPage() {
  const historicalData = Route.useLoaderData()
  const [selectedRepo, setSelectedRepo] = useState<string>('all')
  const [dateRange, setDateRange] = useState<string>('30')

  const repos = [...new Set(historicalData.map((d) => d.repo))].sort()
  const repoOptions = [
    { value: 'all', label: 'All repositories' },
    ...repos.map((repo) => ({ value: repo, label: repo.split('/')[1] })),
  ]

  const filteredData = historicalData.filter((d) => {
    if (selectedRepo !== 'all' && d.repo !== selectedRepo) return false
    const daysAgo = Math.floor(
      (Date.now() - new Date(d.date).getTime()) / (1000 * 60 * 60 * 24),
    )
    return daysAgo <= parseInt(dateRange)
  })

  const aggregatedByDate = filteredData.reduce(
    (acc, d) => {
      if (!acc[d.date]) {
        acc[d.date] = { date: d.date, views: 0, visitors: 0, clones: 0 }
      }
      acc[d.date].views += d.views
      acc[d.date].visitors += d.visitors
      acc[d.date].clones += d.clones
      return acc
    },
    {} as Record<
      string,
      { date: string; views: number; visitors: number; clones: number }
    >,
  )

  const chartData = Object.values(aggregatedByDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      dateLabel: new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    }))

  const totalViews = chartData.reduce((sum, d) => sum + d.views, 0)
  const totalVisitors = chartData.reduce((sum, d) => sum + d.visitors, 0)
  const totalClones = chartData.reduce((sum, d) => sum + d.clones, 0)

  if (historicalData.length === 0) {
    return (
      <Layout height="auto" contentWidth={1280} padding={6}>
        <LayoutContent>
          <VStack gap={8}>
            <PageHeader hasSubtitle={false} />
            <EmptyState
              title="No historical data available"
              description="Configure the Turso database and run the data collection workflow to start tracking historical traffic."
            />
          </VStack>
        </LayoutContent>
      </Layout>
    )
  }

  return (
    <Layout height="auto" contentWidth={1280} padding={6}>
      <LayoutContent>
        <VStack gap={8}>
          <PageHeader hasSubtitle />

          <HStack gap={4} wrap="wrap" vAlign="end">
            <Selector
              label="Repository"
              placeholder="All repositories"
              value={selectedRepo}
              onChange={setSelectedRepo}
              options={repoOptions}
              width={220}
            />
            <Selector
              label="Period"
              value={dateRange}
              onChange={setDateRange}
              options={dateRangeOptions}
              width={160}
            />
          </HStack>

          <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
            <StatCard label="Total Views" value={totalViews} />
            <StatCard label="Total Visitors" value={totalVisitors} />
            <StatCard label="Total Clones" value={totalClones} />
          </Grid>

          <Card>
            <VStack gap={4}>
              <Heading level={2}>Traffic Over Time</Heading>
              {chartData.length > 0 ? (
                <ChartContainer config={chartConfig} height={320}>
                  <AreaChart data={chartData} margin={{ left: 0, right: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="dateLabel"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 12 }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      dataKey="views"
                      type="monotone"
                      fill="var(--color-views)"
                      fillOpacity={0.4}
                      stroke="var(--color-views)"
                      strokeWidth={2}
                    />
                    <Area
                      dataKey="visitors"
                      type="monotone"
                      fill="var(--color-visitors)"
                      fillOpacity={0.4}
                      stroke="var(--color-visitors)"
                      strokeWidth={2}
                    />
                    <Area
                      dataKey="clones"
                      type="monotone"
                      fill="var(--color-clones)"
                      fillOpacity={0.4}
                      stroke="var(--color-clones)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <EmptyState
                  title="No data for selected filters"
                  description="Widen the period or pick a different repository."
                  isCompact
                />
              )}
            </VStack>
          </Card>
        </VStack>
      </LayoutContent>
    </Layout>
  )
}
