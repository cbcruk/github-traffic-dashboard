import { ExternalLink } from 'lucide-react'
import { Area, AreaChart, XAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { RepoTrafficCardProps } from './repo-traffic-card.types'

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

export function RepoTrafficCard({ traffic }: RepoTrafficCardProps) {
  const repoName = traffic.repo.split('/')[1]
  const topReferrer = traffic.referrers[0]

  const viewsMap = new Map(
    traffic.views.views.map((v) => [v.timestamp.split('T')[0], v]),
  )
  const clonesMap = new Map(
    traffic.clones.clones.map((c) => [c.timestamp.split('T')[0], c]),
  )

  const allDates = [
    ...new Set([...viewsMap.keys(), ...clonesMap.keys()]),
  ].sort()

  const chartData = allDates.map((date) => {
    const view = viewsMap.get(date)
    const clone = clonesMap.get(date)
    return {
      date: new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      views: view?.count ?? 0,
      visitors: view?.uniques ?? 0,
      clones: clone?.count ?? 0,
    }
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            <a
              href={`https://github.com/${traffic.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary flex items-center gap-1.5 hover:underline"
            >
              {repoName}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardTitle>
        </div>
        {topReferrer && (
          <CardDescription>
            Top referrer: {topReferrer.referrer} ({topReferrer.count})
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Views</div>
            <div className="text-2xl font-bold">{traffic.views.count}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Visitors</div>
            <div className="text-2xl font-bold">{traffic.views.uniques}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Clones</div>
            <div className="text-2xl font-bold">{traffic.clones.count}</div>
          </div>
        </div>

        {chartData.length > 0 && (
          <ChartContainer config={chartConfig} className="h-25 w-full">
            <AreaChart data={chartData} margin={{ left: 0, right: 0 }}>
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 10 }}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Area
                dataKey="views"
                type="natural"
                fill="var(--color-views)"
                fillOpacity={0.4}
                stroke="var(--color-views)"
                strokeWidth={2}
              />
              <Area
                dataKey="visitors"
                type="natural"
                fill="var(--color-visitors)"
                fillOpacity={0.4}
                stroke="var(--color-visitors)"
                strokeWidth={2}
              />
              <Area
                dataKey="clones"
                type="natural"
                fill="var(--color-clones)"
                fillOpacity={0.4}
                stroke="var(--color-clones)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
