import { startTransition, useState } from 'react'
import { useForecast, useReplay, type ForecastFreq, type Quantiles, type TermPayload } from '../lib/api'
import { formatDay, formatNumber } from '../lib/format'
import { TimeChart, toData, type Datum } from './charts/TimeChart'
import { Bar, Card, ErrorNote, Segmented } from './ui'

const MODELS = ['Ensemble', 'XGBoost', 'MLP', 'TimesFM', 'Naive'] as const
type Model = (typeof MODELS)[number]
const LOOKBACK: Record<ForecastFreq, number> = { daily: 42, weekly: 26 }
const HORIZON: Record<ForecastFreq, number> = { daily: 28, weekly: 12 }
const STEP_DAYS: Record<ForecastFreq, number> = { daily: 1, weekly: 7 }
const LATEST = '__latest'

// Every 7th day (2nd week) once the lookback is full and the term has some signal (as in training).
function liveOrigins(points: [string, number | null][], freq: ForecastFreq) {
  const out: string[] = []
  let peak = 0
  points.forEach(([date, v], i) => {
    peak = Math.max(peak, v ?? 0)
    if (i >= LOOKBACK[freq] - 1 && i < points.length - 1 && peak >= 3) out.push(date)
  })
  return out.filter((_, i) => i % (freq === 'daily' ? 7 : 2) === 0)
}

function mae(forecast: number[], actual: (number | null)[]) {
  const pairs = forecast.flatMap((f, i) => (actual[i] == null ? [] : [Math.abs(f - actual[i]!)]))
  return pairs.length ? pairs.reduce((a, b) => a + b, 0) / pairs.length : null
}

/**
 * Pick a past date, see what each model forecast from only the data before it, and what happened.
 * Catalog terms use out-of-fold forecasts (the models never trained on that term);
 * searched terms are forecast live by the production models, which never saw them either.
 */
export function ForecastReplay({ term }: { term: TermPayload }) {
  const available = (['daily', 'weekly'] as const).filter((f) => (term.series[f]?.length ?? 0) > LOOKBACK[f] + 4)
  const [freq, setFreq] = useState<ForecastFreq>(available[0] ?? 'weekly')
  const [model, setModel] = useState<Model>('Ensemble')
  const points = term.series[freq] ?? []
  const reachesEnd = points.length > 0 && (Date.parse(term.end_date) - Date.parse(points[points.length - 1][0])) / 86_400_000 <= 14
  const hasReplay = term.replay[freq]
  const replay = useReplay(term.slug, freq, hasReplay)

  // Origins: the stored out-of-fold dates, or every 7th day / 2nd week with enough history.
  const origins = hasReplay
    ? (replay.data?.origins.map((o) => o.date) ?? [])
    : liveOrigins(points, freq)
  const stops = reachesEnd ? [...origins, LATEST] : origins
  const peakDate = term.summary.lifecycle?.peak_date
  const defaultIndex = Math.max(0, origins.findIndex((d) => peakDate && d >= peakDate) - (freq === 'daily' ? 2 : 1))
  const [picked, setPicked] = useState<Record<string, number>>({})
  const index = Math.min(picked[freq] ?? defaultIndex, Math.max(0, stops.length - 1))
  const stop = stops[index]
  const isLatest = stop === LATEST

  // Live forecasts: always for the latest stop; for past stops only without stored replays.
  const live = useForecast(term.slug, freq, isLatest ? null : stop ?? null, Boolean(stop) && (isLatest || !hasReplay))
  const stored = hasReplay && !isLatest ? replay.data?.origins.find((o) => o.date === stop) : undefined
  const originDate = isLatest ? live.data?.origin : stop
  const quantiles: Quantiles | undefined = stored ? stored.models[model] : live.data?.models[model]
  const naive: Quantiles | undefined = stored ? stored.models.Naive : undefined
  const loading = stops.length > 0 && !quantiles && !live.error && !replay.error

  const all = toData(points)
  const step = STEP_DAYS[freq] * 86_400_000
  let chart = <Bar className="h-[260px] w-full" />
  let verdict: { model: number | null; naive: number | null } | null = null
  if (originDate && quantiles) {
    const origin = new Date(`${originDate}T00:00:00Z`)
    const windowStart = +origin - LOOKBACK[freq] * 2 * step
    const before = all.filter((p) => +p.t <= +origin && +p.t >= windowStart)
    const after = all.filter((p) => +p.t > +origin && +p.t <= +origin + HORIZON[freq] * step)
    const future: Datum[] = quantiles[1].map((v, h) => ({ t: new Date(+origin + (h + 1) * step), v }))
    const band = quantiles[1].map((_, h) => ({ t: new Date(+origin + (h + 1) * step), lo: quantiles[0][h], hi: quantiles[2][h] }))
    const actual = future.map((f) => after.find((a) => +a.t === +f.t)?.v ?? null)
    const lastValue = before.findLast((p) => p.v !== null)?.v ?? null
    verdict = {
      model: mae(quantiles[1], actual),
      naive: naive ? mae(naive[1], actual) : lastValue === null ? null : mae(actual.map(() => lastValue), actual),
    }
    chart = (
      <TimeChart
        label={`${model} forecast made on ${formatDay(originDate)} against what happened`}
        height={260}
        yMax={100}
        lines={[
          { id: 'observed', label: 'Observed', points: [...before, ...after], color: '#0038a8' },
          { id: 'forecast', label: `${model} median`, points: [{ t: origin, v: lastValue }, ...future], color: '#a86f0c', dashed: true },
        ]}
        band={{ points: band, color: '#a86f0c' }}
        markers={[{ t: origin, label: `Forecast made ${formatDay(originDate)}`, color: '#5d5f60' }]}
      />
    )
  }

  const error = replay.error ?? live.error
  return (
    <Card
      title="Forecast replay"
      aside={
        <div className="flex flex-wrap items-center gap-2">
          {available.length > 1 ? (
            <Segmented label="Resolution" value={freq} onChange={setFreq} options={available.map((f) => ({ value: f, label: f === 'daily' ? 'Daily' : 'Weekly' }))} />
          ) : null}
          <Segmented
            label="Model"
            value={model}
            onChange={setModel}
            options={MODELS.map((m) => ({ value: m, label: m, disabled: !isLatest && hasReplay && stored ? !stored.models[m] : m === 'Naive' && !hasReplay }))}
          />
        </div>
      }
    >
      {!available.length ? (
        <p className="text-body text-muted">This term has no daily or weekly series long enough to forecast. Google returns monthly rows only.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0">
            {error ? <ErrorNote message={error.message} onRetry={() => (hasReplay ? replay.mutate() : live.mutate())} /> : chart}
            <div className="mt-4">
              <label htmlFor="replay-origin" className="text-small text-muted">
                Forecast date: <span className="font-medium text-ink">{isLatest ? `Latest data (${formatDay(live.data?.origin)})` : formatDay(stop)}</span>
              </label>
              <input
                id="replay-origin"
                type="range"
                min={0}
                max={Math.max(0, stops.length - 1)}
                value={index}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  startTransition(() => setPicked((p) => ({ ...p, [freq]: value })))
                }}
                className="mt-2 h-6 w-full cursor-pointer accent-[#0038a8]"
              />
              <div className="flex justify-between text-small text-muted">
                <span>{formatDay(origins[0])}</span>
                <span>{reachesEnd ? 'Latest' : formatDay(origins[origins.length - 1])}</span>
              </div>
            </div>
          </div>
          <dl className="flex flex-col gap-5 lg:border-l lg:border-edge lg:pl-6">
            <div>
              <dt className="text-body font-medium text-muted">{model} missed by</dt>
              <dd className="mt-1 text-kpi text-ink num">
                {loading ? <Bar className="h-[34px] w-24" /> : formatNumber(verdict?.model, 1)}
                <span className="ml-1 text-body text-muted">pts</span>
              </dd>
              <dd className="text-small text-muted">Mean gap to what happened, {HORIZON[freq]} {freq === 'daily' ? 'days' : 'weeks'} ahead</dd>
            </div>
            <div>
              <dt className="text-body font-medium text-muted">Last value missed by</dt>
              <dd className="mt-1 text-kpi text-ink num">
                {loading ? <Bar className="h-[34px] w-24" /> : formatNumber(verdict?.naive, 1)}
                <span className="ml-1 text-body text-muted">pts</span>
              </dd>
              <dd className="text-small text-muted">Repeating the day&rsquo;s value, the baseline to beat</dd>
            </div>
            <p className="text-small text-muted">
              {isLatest
                ? 'From the latest data there is nothing to compare against yet. The band is the 10th to 90th percentile.'
                : hasReplay
                  ? 'Out-of-fold: the models that made this forecast were trained without this term. The band is the 10th to 90th percentile.'
                  : term.group === 'search'
                    ? 'Production models, which never trained on this searched term. The band is the 10th to 90th percentile.'
                    : 'Production models trained on every term, this one included, so this past forecast is in-sample. The band is the 10th to 90th percentile.'}
            </p>
          </dl>
        </div>
      )}
    </Card>
  )
}
