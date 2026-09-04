import { useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { History, Search } from 'lucide-react'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { getAllReposTraffic } from '../lib/github'
import { RepoTrafficCard } from '../components/repo-traffic-card'
import { ThemeToggle } from '../components/theme-toggle'
import {
  filterAndSortRepos,
  sortOptions,
  type SortOption,
} from '../lib/traffic-utils'
import type { RepoTraffic } from '../lib/github.types'

const sortSelectorOptions = [
  { value: 'views', label: 'Views' },
  { value: 'visitors', label: 'Visitors' },
  { value: 'clones', label: 'Clones' },
  { value: 'name', label: 'Name' },
]

interface SearchParams {
  q?: string
  sort?: SortOption
  showEmpty?: boolean
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    sort: sortOptions.includes(search.sort as SortOption)
      ? (search.sort as SortOption)
      : undefined,
    showEmpty: search.showEmpty === true || search.showEmpty === 'true',
  }),
  loader: async (): Promise<RepoTraffic[]> => {
    try {
      return await getAllReposTraffic()
    } catch (error) {
      console.error('Failed to fetch traffic data:', error)
      return []
    }
  },
  component: Dashboard,
})

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

function Dashboard() {
  const trafficData = Route.useLoaderData()
  const { q, sort, showEmpty } = Route.useSearch()
  const navigate = useNavigate({ from: '/' })

  const search = q ?? ''
  const sortBy = sort ?? 'views'

  function updateSearch(updates: Partial<SearchParams>) {
    navigate({
      search: (prev) => ({
        ...prev,
        ...updates,
        q: updates.q === '' ? undefined : (updates.q ?? prev.q),
        sort:
          updates.sort === 'views' ? undefined : (updates.sort ?? prev.sort),
        showEmpty:
          'showEmpty' in updates
            ? updates.showEmpty || undefined
            : prev.showEmpty,
      }),
      replace: true,
    })
  }

  const filteredAndSortedData = useMemo(
    () => filterAndSortRepos(trafficData, { search, sortBy, showEmpty }),
    [trafficData, search, sortBy, showEmpty],
  )

  const totalViews = trafficData.reduce((sum, t) => sum + t.views.count, 0)
  const totalUniques = trafficData.reduce((sum, t) => sum + t.views.uniques, 0)
  const totalClones = trafficData.reduce((sum, t) => sum + t.clones.count, 0)

  return (
    <Layout height="auto" contentWidth={1280} padding={6}>
      <LayoutContent>
        <VStack gap={8}>
          <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
            <VStack gap={1}>
              <Heading level={1}>GitHub Traffic Dashboard</Heading>
              <Text type="supporting">
                Traffic statistics for your repositories (last 14 days)
              </Text>
            </VStack>
            <HStack gap={2} vAlign="center">
              <Link href="/history" isStandalone>
                <HStack gap={1.5} vAlign="center" as="span">
                  <Icon icon={History} size="sm" />
                  History
                </HStack>
              </Link>
              <ThemeToggle />
            </HStack>
          </HStack>

          <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
            <StatCard label="Total Views" value={totalViews} />
            <StatCard label="Unique Visitors" value={totalUniques} />
            <StatCard label="Total Clones" value={totalClones} />
            <StatCard label="Repositories" value={trafficData.length} />
          </Grid>

          <HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
            <TextInput
              label="Search repositories"
              isLabelHidden
              placeholder="Search repositories..."
              value={search}
              onChange={(value) => updateSearch({ q: value })}
              startIcon={Search}
              hasClear
              width={320}
            />
            <HStack gap={4} vAlign="center">
              <CheckboxInput
                label="Show empty"
                value={showEmpty ?? false}
                onChange={(checked) => updateSearch({ showEmpty: checked })}
              />
              <Selector
                label="Sort by"
                isLabelHidden
                placeholder="Sort by"
                value={sortBy}
                onChange={(value) =>
                  updateSearch({ sort: value as SortOption })
                }
                options={sortSelectorOptions}
                width={140}
              />
            </HStack>
          </HStack>

          {filteredAndSortedData.length > 0 ? (
            <Grid columns={{ minWidth: 340, max: 3 }} gap={4}>
              {filteredAndSortedData.map((traffic) => (
                <RepoTrafficCard key={traffic.repo} traffic={traffic} />
              ))}
            </Grid>
          ) : (
            <EmptyState
              title="No repositories found"
              description={
                search
                  ? 'No repository matches your search. Try a different term or clear the filters.'
                  : 'Once traffic data is collected, your repositories will appear here.'
              }
            />
          )}
        </VStack>
      </LayoutContent>
    </Layout>
  )
}
