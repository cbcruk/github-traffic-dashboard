import { useMemo } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { History, Search } from 'lucide-react'
import { getAllReposTraffic } from '../lib/github'
import { RepoTrafficCard } from '../components/repo-traffic-card'
import { ThemeToggle } from '../components/theme-toggle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { RepoTraffic } from '../lib/github.types'

const sortOptions = ['views', 'visitors', 'clones', 'name'] as const
type SortOption = (typeof sortOptions)[number]

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

  const filteredAndSortedData = useMemo(() => {
    let data = [...trafficData]

    if (search) {
      const query = search.toLowerCase()
      data = data.filter((t) => t.repo.toLowerCase().includes(query))
    }

    if (!showEmpty) {
      data = data.filter((t) => t.views.uniques > 0)
    }

    data.sort((a, b) => {
      switch (sortBy) {
        case 'views':
          return b.views.count - a.views.count
        case 'visitors':
          return b.views.uniques - a.views.uniques
        case 'clones':
          return b.clones.count - a.clones.count
        case 'name':
          return a.repo.localeCompare(b.repo)
        default:
          return 0
      }
    })

    return data
  }, [trafficData, search, sortBy, showEmpty])

  const totalViews = trafficData.reduce((sum, t) => sum + t.views.count, 0)
  const totalUniques = trafficData.reduce((sum, t) => sum + t.views.uniques, 0)
  const totalClones = trafficData.reduce((sum, t) => sum + t.clones.count, 0)

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            GitHub Traffic Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Traffic statistics for your repositories (last 14 days)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/history"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <History className="h-4 w-4" />
            History
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Views
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalViews}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Unique Visitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalUniques}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Clones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalClones}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Repositories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{trafficData.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => updateSearch({ q: e.target.value })}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-empty"
              checked={showEmpty}
              onCheckedChange={(checked) => {
                updateSearch({ showEmpty: checked === true })
              }}
            />
            <Label htmlFor="show-empty" className="text-sm">
              Show empty
            </Label>
          </div>
          <Select
            value={sortBy}
            onValueChange={(v) => updateSearch({ sort: v as SortOption })}
          >
            <SelectTrigger className="w-35">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="views">Views</SelectItem>
              <SelectItem value="visitors">Visitors</SelectItem>
              <SelectItem value="clones">Clones</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredAndSortedData.map((traffic) => (
          <RepoTrafficCard key={traffic.repo} traffic={traffic} />
        ))}
      </div>

      {filteredAndSortedData.length === 0 && (
        <div className="text-muted-foreground py-12 text-center">
          No repositories found
        </div>
      )}
    </div>
  )
}
