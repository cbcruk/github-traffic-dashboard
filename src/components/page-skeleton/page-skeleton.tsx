import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { VStack } from '@astryxdesign/core/VStack'

/**
 * Loading placeholders shaped like the pages they stand in for, shown while a
 * route loader waits on D1 during client-side navigation. Without them the
 * previous page stays frozen until the query returns.
 */

function HeaderSkeleton() {
  return (
    <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
      <VStack gap={2}>
        <Skeleton width={320} height={36} />
        <Skeleton width={260} height={20} index={1} />
      </VStack>
      <Skeleton width={96} height={32} index={2} />
    </HStack>
  )
}

function StatCardSkeleton({ index }: { index: number }) {
  return (
    <Card>
      <VStack gap={2}>
        <Skeleton width={96} height={18} index={index} />
        <Skeleton width={120} height={36} index={index} />
      </VStack>
    </Card>
  )
}

function StatGridSkeleton({ count }: { count: number }) {
  return (
    <Grid columns={{ minWidth: 200, max: count }} gap={4}>
      {Array.from({ length: count }, (_, i) => (
        <StatCardSkeleton key={i} index={i} />
      ))}
    </Grid>
  )
}

function RepoCardSkeleton({ index }: { index: number }) {
  return (
    <Card>
      <VStack gap={4}>
        <Skeleton width={160} height={22} index={index} />
        <Grid columns={3} gap={4}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={52} index={index} />
          ))}
        </Grid>
        <Skeleton height={100} index={index} />
      </VStack>
    </Card>
  )
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <Layout height="auto" contentWidth={1280} padding={6}>
      <LayoutContent>
        <VStack gap={8}>{children}</VStack>
      </LayoutContent>
    </Layout>
  )
}

/** Stands in for `/`: header, four totals, filters, repository cards. */
export function DashboardSkeleton() {
  return (
    <PageFrame>
      <HeaderSkeleton />
      <StatGridSkeleton count={4} />
      <HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
        <Skeleton width={320} height={40} />
        <Skeleton width={240} height={40} />
      </HStack>
      <Grid columns={{ minWidth: 340, max: 3 }} gap={4}>
        {Array.from({ length: 6 }, (_, i) => (
          <RepoCardSkeleton key={i} index={i} />
        ))}
      </Grid>
    </PageFrame>
  )
}

/** Stands in for `/top`: header, filters, the ranking table. */
export function RankingSkeleton() {
  return (
    <PageFrame>
      <HeaderSkeleton />
      <HStack gap={4} wrap="wrap" vAlign="end">
        <Skeleton width={160} height={64} />
        <Skeleton width={180} height={64} index={1} />
      </HStack>
      <Card>
        <VStack gap={3}>
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} height={32} index={i} />
          ))}
        </VStack>
      </Card>
    </PageFrame>
  )
}

/** Stands in for `/history`: header, filters, three totals, the chart. */
export function HistorySkeleton() {
  return (
    <PageFrame>
      <HeaderSkeleton />
      <HStack gap={4} wrap="wrap" vAlign="end">
        <Skeleton width={220} height={64} />
        <Skeleton width={160} height={64} index={1} />
      </HStack>
      <StatGridSkeleton count={3} />
      <Card>
        <VStack gap={4}>
          <Skeleton width={200} height={28} />
          <Skeleton height={320} index={1} />
        </VStack>
      </Card>
    </PageFrame>
  )
}
