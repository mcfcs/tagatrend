import useSWR from 'swr'

export type Point = [string, number | null]
export type Freq = 'monthly' | 'weekly' | 'daily'
export type ForecastFreq = 'daily' | 'weekly'
/** [q10[], q50[], q90[]] on the term's 0-100 index. */
export type Quantiles = [number[], number[], number[]]

export interface Phase {
  phase: 'Rising' | 'Peaking' | 'Fading' | 'Dormant' | 'Evergreen' | 'No signal'
  detail: string
  recent_vs_peak_pct?: number
  days_since_peak?: number
  basis?: Freq
}

export interface Lifecycle {
  resolution: ForecastFreq
  peak_date: string
  onset_date: string | null
  rise_days: number | null
  half_life_days: number | null
  fade_days: number | null
  retention_4w_pct: number | null
  spike_share_pct: number | null
}

export interface LibraryRow {
  slug: string
  query: string
  group: 'core' | 'extra'
  year: number
  blurb: string
  phase: Phase
  shape: 'Flash' | 'Wave' | 'Slow burn' | 'Unresolved'
  lifecycle: Lifecycle | null
  peak_month: string | null
  resolutions: Freq[]
  yearly: Point[]
}

export interface Week {
  label: 'Before' | 'Peak week' | 'After'
  start: string
  end: string
  days: number
  mean: number | null
}

export interface RegionWindow {
  start: string
  end: string
  scores: Record<string, number>
}

export interface TermPayload {
  slug: string
  query: string
  group: 'core' | 'extra' | 'search'
  year: number | null
  blurb: string | null
  series: Partial<Record<Freq, Point[]>>
  summary: {
    phase: Phase
    lifecycle: Lifecycle | null
    shape: LibraryRow['shape']
    weeks: Week[]
    resurgences: { date: string; level: number; prominence: number }[]
    peak_month?: string
    latest_month?: { date: string; value: number }
  }
  regions: Record<string, RegionWindow>
  meta: Partial<Record<Freq, { request_windows: string[]; pulls_per_window: number[]; dropouts_masked: number; window: string }>>
  replay: Record<ForecastFreq, boolean>
  end_date: string
}

export interface Replay {
  freq: ForecastFreq
  origins: { date: string; models: Record<string, Quantiles> }[]
}

export interface Forecast {
  freq: ForecastFreq
  origin: string
  dates: string[]
  quantiles: number[]
  models: Record<string, Quantiles>
}

export interface SummaryRow {
  model: string
  mae_index: number
  mae_pts: number
  coverage_80: number
  n: number
  skill_pct: number
  bucket?: string
  h?: number
  phase?: string
  trend?: string
}

export interface ModelReport {
  metrics: {
    freq: ForecastFreq
    lookback: number
    horizon: number
    trends: string[]
    origins: number
    overall: SummaryRow[]
    by_bucket: SummaryRow[]
    by_horizon: SummaryRow[]
    by_phase: SummaryRow[]
    by_trend: SummaryRow[]
  }
  meta: { trained_on: string[]; train_origins: number; val_origins: number; gpu: string; timesfm: boolean; seconds: number } | null
}

export interface SearchJob {
  id: string | null
  status: 'running' | 'done' | 'error'
  slug: string
  query: string
  steps?: string[]
  error?: string | null
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status)
  return body as T
}

const fetcher = <T,>(url: string) => fetchJson<T>(url)
const stable = { revalidateOnFocus: false, keepPreviousData: true }

export function useLibrary() {
  return useSWR<{ trends: LibraryRow[]; searched: { slug: string; query: string }[] }>('/api/trends', fetcher, stable)
}

export function useTerm(slug: string | undefined) {
  return useSWR<TermPayload>(slug ? `/api/trends/${slug}` : null, fetcher, stable)
}

export function useReplay(slug: string, freq: ForecastFreq, enabled: boolean) {
  return useSWR<Replay>(enabled ? `/api/trends/${slug}/replay/${freq}` : null, fetcher, stable)
}

export function useForecast(slug: string, freq: ForecastFreq, origin: string | null, enabled = true) {
  const query = origin ? `?origin=${origin}` : ''
  return useSWR<Forecast>(enabled ? `/api/trends/${slug}/forecast/${freq}${query}` : null, fetcher, stable)
}

export function useModels() {
  return useSWR<Partial<Record<ForecastFreq, ModelReport>>>('/api/models', fetcher, stable)
}

export function useDocs() {
  return useSWR<{ markdown: string }>('/api/docs', fetcher, stable)
}
