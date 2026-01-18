export interface Repository {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  private: boolean
  fork: boolean
  stargazers_count: number
}

export interface TrafficView {
  timestamp: string
  count: number
  uniques: number
}

export interface TrafficClone {
  timestamp: string
  count: number
  uniques: number
}

export interface ViewsResponse {
  count: number
  uniques: number
  views: TrafficView[]
}

export interface ClonesResponse {
  count: number
  uniques: number
  clones: TrafficClone[]
}

export interface Referrer {
  referrer: string
  count: number
  uniques: number
}

export interface RepoTraffic {
  repo: string
  views: ViewsResponse
  clones: ClonesResponse
  referrers: Referrer[]
}

export interface DailyTraffic {
  repo: string
  date: string
  views: number
  visitors: number
  clones: number
  cloneUniques: number
}
