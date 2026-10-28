import { Link } from 'react-router'
import { LadderLegend, LifecycleLadder } from '../components/charts/LifecycleLadder'
import { TimeChart, toData } from '../components/charts/TimeChart'
import { TitleRow } from '../components/Shell'
import { Bar, Card, ErrorNote, KpiStrip, PhasePill } from '../components/ui'
import { useLibrary, useModels, useTerm, type LibraryRow } from '../lib/api'
import { formatDay, formatNumber, median, plural } from '../lib/format'

/** One of the four set trends: its daily lifecycle around the peak, the peak annotated. */
function CoreTrend({ row }: { row: LibraryRow }) {
  const { data, error } = useTerm(row.slug)
  const c = row.lifecycle
  const daily = data?.series.daily ?? data?.series.weekly
  let chart = <Bar className="h-[150px] w-full" />
  if (error) chart = <ErrorNote message="Couldn't load this term." />
  else if (daily && c) {
    const peak = new Date(`${c.peak_date}T00:00:00Z`)
    const from = new Date(+peak - 60 * 86_400_000)
    const to = new Date(+peak + 120 * 86_400_000)
    const points = toData(daily).filter((p) => p.t >= from && p.t <= to)
    chart = (
      <TimeChart
        label={`${row.query}: daily interest around its peak on ${formatDay(c.peak_date)}`}
        height={150}
        yMax={100}
        lines={[{ id: 'observed', label: row.query, points, color: '#0038a8' }]}
        markers={[{ t: peak, label: `Peak ${formatDay(c.peak_date)}`, color: '#ce1126' }]}
      />
    )
  }
  return (
    <Link to={`/trend/${row.slug}`} className="group block min-w-0 rounded-card border border-edge bg-sheet p-5 transition-colors hover:border-control">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-section font-semibold text-ink group-hover:text-observed">{row.query}</h3>
          <p className="mt-0.5 line-clamp-2 text-small text-muted">{row.blurb}</p>
        </div>
        <PhasePill phase={row.phase} />
      </div>
      <div className="mt-3">{chart}</div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-small">
        <div>
          <dt className="text-muted">Rise</dt>
          <dd className="text-body text-ink num">{c?.rise_days == null ? '—' : `${c.rise_days} days`}</dd>
        </div>
        <div>
          <dt className="text-muted">Half-life</dt>
          <dd className="text-body text-ink num">{c?.half_life_days == null ? '—' : `${c.half_life_days} days`}</dd>
        </div>
        <div>
          <dt className="text-muted">After 4 weeks</dt>
          <dd className="text-body text-ink num">{c?.retention_4w_pct == null ? '—' : `${formatNumber(c.retention_4w_pct, 0)}% of peak`}</dd>
        </div>
      </dl>
    </Link>
  )
}

function LibraryRail({ rows }: { rows: LibraryRow[] }) {
  const sorted = rows.toSorted((a, b) => (b.peak_month ?? '').localeCompare(a.peak_month ?? ''))
  return (
    <div>
      <h2 className="mb-2 text-section font-semibold text-ink">Library</h2>
      <div className="rounded-card border border-edge bg-sheet">
        <ul>
          {sorted.slice(0, 11).map((r) => (
            <li key={r.slug} className="border-b border-rule last:border-0">
              <Link to={`/trend/${r.slug}`} className="flex h-[45px] items-center justify-between gap-3 px-4 hover:bg-raised">
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink">{r.query}</span>
                </span>
                <span className="flex flex-none items-center gap-3">
                  <span className="text-small text-muted num">{r.peak_month?.slice(0, 4) ?? '—'}</span>
                  <PhasePill phase={r.phase} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="p-3 pt-1">
          <Link to="/library" className="flex h-[30px] items-center justify-center rounded-control border border-control text-body font-medium text-ink hover:bg-raised">
            View all {rows.length} terms
          </Link>
        </div>
      </div>
    </div>
  )
}

export function Overview() {
  const { data, error, mutate } = useLibrary()
  const { data: models } = useModels()
  const rows = data?.trends ?? []
  const core = rows.filter((r) => r.group === 'core')
  const halfLives = rows.flatMap((r) => (r.lifecycle?.half_life_days == null ? [] : [r.lifecycle.half_life_days]))
  const rises = rows.flatMap((r) => (r.lifecycle?.rise_days == null ? [] : [r.lifecycle.rise_days]))
  const flashes = rows.filter((r) => r.shape === 'Flash').length
  const weekly = models?.weekly?.metrics.by_bucket.find((m) => m.model === 'Ensemble' && m.bucket === '1-4 weeks')
  const halfMedian = median(halfLives)

  return (
    <>
      <TitleRow
        title="Overview"
        line={
          rows.length
            ? `Across ${plural(rows.length, 'Filipino term')}, a spike loses half its search interest a median ${formatNumber(halfMedian, 0)} days after it peaks. ${flashes} of them were gone within a week.`
            : 'How fast Filipino viral terms rise, peak and fade in Google searches.'
        }
      />
      {error ? <ErrorNote message="Couldn't load the trend library. Is the Flask server running on port 5000?" onRetry={() => mutate()} /> : null}

      <KpiStrip
        items={[
          { label: 'Terms tracked', value: rows.length || '—', caption: `${core.length} set trends, ${rows.length - core.length} added` },
          { label: 'Median rise', value: formatNumber(median(rises), 0), unit: 'days', caption: 'From 10% of peak to the peak' },
          { label: 'Median half-life', value: formatNumber(halfMedian, 0), unit: 'days', caption: 'From the peak down to 50%' },
          {
            label: 'Forecast skill, 1-4 weeks',
            value: weekly ? `${weekly.skill_pct > 0 ? '+' : ''}${formatNumber(weekly.skill_pct, 0)}%` : '—',
            caption: weekly ? `Ensemble vs last value, ${formatNumber(weekly.mae_index, 1)} pts MAE` : 'Train the models to score them',
          },
        ]}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
        <div className="min-w-0">
          <h2 className="mb-2 text-section font-semibold text-ink">The four set trends</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {core.length ? core.map((r) => <CoreTrend key={r.slug} row={r} />) : [0, 1, 2, 3].map((i) => <Bar key={i} className="h-[300px]" />)}
          </div>
        </div>
        {rows.length ? <LibraryRail rows={rows} /> : <Bar className="h-[480px]" />}
      </div>

      <Card className="mt-6" title="Lifecycles side by side" aside={<LadderLegend />}>
        <p className="-mt-2 mb-4 max-w-[680px] text-body text-muted">
          Each term on its own clock, centred on its peak day and sorted by how fast it fell. Select a row to open the term.
        </p>
        {rows.length ? <LifecycleLadder rows={rows} /> : <Bar className="h-[400px] w-full" />}
      </Card>
    </>
  )
}
