import { ExternalLink } from 'lucide-react'
import { Area, AreaChart, XAxis } from 'recharts'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../chart'
import type { RepoTrafficCardProps } from './repo-traffic-card.types'

const chartConfig = {
  views: { label: 'Views', color: 'var(--color-data-categorical-blue)' },
  visitors: { label: 'Visitors', color: 'var(--color-data-categorical-teal)' },
  clones: { label: 'Clones', color: 'var(--color-data-categorical-purple)' },
} satisfies ChartConfig

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting">{label}</Text>
      <Text size="2xl" weight="bold" hasTabularNumbers>
        {value.toLocaleString()}
      </Text>
    </VStack>
  )
}

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
      <VStack gap={4}>
        <VStack gap={1}>
          <Link
            href={`https://github.com/${traffic.repo}`}
            isExternalLink
            isStandalone
            weight="semibold"
          >
            <HStack gap={1.5} vAlign="center" as="span">
              {repoName}
              <Icon icon={ExternalLink} size="xsm" />
            </HStack>
          </Link>
          {topReferrer && (
            <Text type="supporting">
              Top referrer: {topReferrer.referrer} ({topReferrer.count})
            </Text>
          )}
        </VStack>

        <Grid columns={3} gap={4}>
          <Metric label="Views" value={traffic.views.count} />
          <Metric label="Visitors" value={traffic.views.uniques} />
          <Metric label="Clones" value={traffic.clones.count} />
        </Grid>

        {chartData.length > 0 && (
          <ChartContainer config={chartConfig} height={100}>
            <AreaChart data={chartData} margin={{ left: 0, right: 0 }}>
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 10 }}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
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
      </VStack>
    </Card>
  )
}
