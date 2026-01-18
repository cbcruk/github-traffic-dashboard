import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { getHistoricalTraffic } from '../lib/github'
import { ThemeToggle } from '../components/theme-toggle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DailyTraffic } from '../lib/github.types'

const chartConfig = {
  views: {
    label: 'Views',
    color: 'var(--chart-1)',
  },
  visitors: {
    label: 'Visitors',
    color: 'var(--chart-2)',
  },
  clones: {
    label: 'Clones',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig

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

function HistoryPage() {
  const historicalData = Route.useLoaderData()
  const [selectedRepo, setSelectedRepo] = useState<string>('all')
  const [dateRange, setDateRange] = useState<string>('30')

  const repos = [...new Set(historicalData.map((d) => d.repo))].sort()

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
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <Link
              to="/"
              className="text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">
              Traffic History
            </h1>
          </div>
          <ThemeToggle />
        </header>

        <Card>
          <CardContent className="py-12">
            <div className="text-muted-foreground text-center">
              <p className="mb-2">No historical data available.</p>
              <p className="text-sm">
                Configure Turso database and run the data collection workflow to
                start tracking historical traffic.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Traffic History
          </h1>
          <p className="text-muted-foreground text-sm">
            Historical traffic data from your repositories
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Repository:</span>
          <Select value={selectedRepo} onValueChange={setSelectedRepo}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All repositories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All repositories</SelectItem>
              {repos.map((repo) => (
                <SelectItem key={repo} value={repo}>
                  {repo.split('/')[1]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Period:</span>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Views
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {totalViews.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Visitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {totalVisitors.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Clones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {totalClones.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Traffic Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-80 w-full">
              <AreaChart data={chartData} margin={{ left: 0, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                <ChartTooltip
                  content={<ChartTooltipContent indicator="line" />}
                />
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
            <div className="text-muted-foreground py-12 text-center">
              No data for selected filters
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
