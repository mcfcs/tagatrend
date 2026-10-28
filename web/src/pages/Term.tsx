import { useParams, useSearchParams } from 'react-router'
import { BarList } from '../components/charts/BarList'
import { TimeChart, toData } from '../components/charts/TimeChart'
import { ForecastReplay } from '../components/ForecastReplay'
import { ExternalIcon } from '../components/icons'
import { TitleRow } from '../components/Shell'
import { Bar, Card, ErrorNote, KpiStrip, PhasePill, Segmented } from '../components/ui'
import { useTerm, type Freq, type TermPayload } from '../lib/api'
import { formatDay, formatMonth, formatNumber, formatSigned, parseDate, trendsUrl } from '../lib/format'

const FREQ_LABEL: Record<Freq, string> = { monthly: 'Monthly', weekly: 'Weekly', daily: 'Daily' }

function MainChart({ term }: { term: TermPayload }) {
  const freqs = (['monthly', 'weekly', 'daily'] as const).filter((f) => term.series[f]?.length)
  const [params, setParams] = useSearchParams()
  const fallback: Freq = freqs.includes('daily') ? 'daily' : freqs[0]
  const freq = (freqs as readonly string[]).includes(params.get('res') ?? '') ? (params.get('res') as Freq) : fallback
  const setFreq = (value: Freq) =>
    setParams((p) => {
      if (value === fallback) p.delete('res')
      else p.set('res', value)
      return p
    }, { replace: true, preventScrollReset: true })
  const points = toData(term.series[freq] ?? [])
  const weeks = term.summary.weeks
  const peak = term.summary.lifecycle?.peak_date
  const spans =
    freq === 'daily'
      ? weeks.map((w) => ({ start: parseDate(w.start), end: new Date(+parseDate(w.end) + 86_400_000), label: w.label }))
      : []
  const peakMarker =
    freq === 'monthly' && term.summary.peak_month
      ? { t: parseDate(`${term.summary.peak_month}-01`), label: `Peak ${formatMonth(term.summary.peak_month)}`, color: '#ce1126' }
      : peak
        ? { t: parseDate(peak), label: `Peak ${formatDay(peak)}`, color: '#ce1126' }
        : null
  const meta = term.meta[freq]
  return (
    <Card
      title="Search interest"
      aside={<Segmented label="Resolution" value={freq} onChange={setFreq} options={freqs.map((f) => ({ value: f, label: FREQ_LABEL[f] }))} />}
    >
      <TimeChart
        label={`${term.query}: ${freq} search interest in the Philippines`}
        height={280}
        yMax={100}
        lines={[{ id: 'observed', label: 'Interest', points, color: '#0038a8' }]}
        spans={spans}
        markers={peakMarker ? [peakMarker] : []}
      />
      <p className="mt-3 text-small text-muted">
        {freq === 'daily' && weeks.length ? 'Shaded: the week before, the peak week and the week after. ' : ''}
        Google&rsquo;s 0-100 index, relative to this term&rsquo;s own peak in this series.
        {meta && meta.request_windows.length > 1 ? ` Stitched from ${meta.request_windows.length} overlapping requests.` : ''}
      </p>
    </Card>
  )
}

function PeakWeeks({ term }: { term: TermPayload }) {
  const weeks = term.summary.weeks
  if (!weeks.length) {
    return (
      <Card title="Weeks around the peak">
        <p className="text-body text-muted">Needs a daily series around the peak. Google only returned coarser rows for this term.</p>
      </Card>
    )
  }
  const [before, peak, after] = weeks
  const rise = before.mean !== null && peak.mean !== null ? peak.mean - before.mean : null
  const fall = after.mean !== null && peak.mean !== null ? after.mean - peak.mean : null
  const kept = after.mean !== null && peak.mean ? (100 * after.mean) / peak.mean : null
  return (
    <Card title="Weeks around the peak">
      <ul className="flex flex-col gap-3">
        {weeks.map((w) => (
          <li key={w.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body text-ink">{w.label}</span>
              <span className="text-body text-ink num">{w.mean === null ? '—' : formatNumber(w.mean, 1)}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-raised">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(1, w.mean ?? 0)}%`, background: w.label === 'Peak week' ? '#0038a8' : '#9aa9cc' }} />
            </div>
            <div className="mt-1 text-small text-muted num">
              {formatDay(w.start)} to {formatDay(w.end)}
              {w.days < 7 ? `, ${w.days} of 7 days` : ''}
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-rule pt-4">
        <div>
          <dt className="text-small text-muted">Into the peak</dt>
          <dd className="text-body text-ink num">{formatSigned(rise)} pts</dd>
        </div>
        <div>
          <dt className="text-small text-muted">The week after</dt>
          <dd className={`text-body num ${fall !== null && fall < 0 ? 'text-negative' : 'text-ink'}`}>{formatSigned(fall)} pts</dd>
        </div>
        <div>
          <dt className="text-small text-muted">Kept</dt>
          <dd className="text-body text-ink num">{kept === null ? '—' : `${formatNumber(kept, 0)}%`}</dd>
        </div>
      </dl>
    </Card>
  )
}

function Regions({ term }: { term: TermPayload }) {
  const windows = Object.entries(term.regions)
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {windows.length ? (
        windows.map(([label, w]) => {
          const rows = Object.entries(w.scores)
            .map(([region, value]) => ({ label: region, value }))
            .toSorted((a, b) => b.value - a.value)
          return (
            <Card key={label} title={`Regions, ${label.toLowerCase()}`} aside={<span className="text-small text-muted num">{formatDay(w.start)} to {formatDay(w.end)}</span>}>
              {rows.length ? <BarList rows={rows} /> : <p className="text-body text-muted">Too few searches in this window for Google to rank regions.</p>}
            </Card>
          )
        })
      ) : (
        <Card title="Regions" className="md:col-span-2">
          <p className="text-body text-muted">No regional data was pulled for this term.</p>
        </Card>
      )}
    </div>
  )
}

function Provenance({ term }: { term: TermPayload }) {
  const rows = (['monthly', 'weekly', 'daily'] as const).flatMap((f) => (term.meta[f] ? [[f, term.meta[f]!] as const] : []))
  return (
    <Card title="Where the numbers come from">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-body">
          <thead>
            <tr className="text-left text-small text-muted">
              <th className="pb-2 font-normal">Series</th>
              <th className="pb-2 font-normal">Window</th>
              <th className="pb-2 text-right font-normal">Requests</th>
              <th className="pb-2 text-right font-normal">Pulls averaged</th>
              <th className="pb-2 text-right font-normal">Dropouts masked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([freq, m]) => (
              <tr key={freq} className="border-t border-rule">
                <td className="py-2.5 text-ink">{FREQ_LABEL[freq]}</td>
                <td className="py-2.5 text-ink num">{m.window.replace(' ', ' to ')}</td>
                <td className="py-2.5 text-right text-ink num">{m.request_windows.length}</td>
                <td className="py-2.5 text-right text-ink num">{Math.min(...m.pulls_per_window)}</td>
                <td className="py-2.5 text-right text-ink num">{m.dropouts_masked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-small text-muted">
        Query <code className="font-mono text-ink">{term.query}</code>, geography PH. Dropouts are isolated zeros right after a busy week; they are treated as missing, using past values only.
      </p>
    </Card>
  )
}

export function Term() {
  const { slug } = useParams()
  const { data: term, error, mutate } = useTerm(slug)

  if (error) {
    return (
      <>
        <TitleRow title="Term not found" />
        <ErrorNote message={error.status === 404 ? 'There is no data for this term yet. Search for it to pull it from Google Trends.' : error.message} onRetry={() => mutate()} />
      </>
    )
  }
  if (!term) {
    return (
      <>
        <Bar className="mb-2 h-7 w-56" />
        <Bar className="mb-6 h-5 w-96 max-w-full" />
        <Bar className="h-[110px] w-full" />
        <Bar className="mt-6 h-[380px] w-full" />
      </>
    )
  }

  const c = term.summary.lifecycle
  const phase = term.summary.phase
  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span translate="no">{term.query}</span>
            <PhasePill phase={phase} />
          </span>
        }
        line={term.blurb ?? 'Searched term, pulled live from Google Trends for the Philippines.'}
        action={
          <a
            href={trendsUrl(term.query)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-2 rounded-control border border-control px-3 text-body font-medium text-ink hover:bg-raised"
          >
            Open in Google Trends
            <ExternalIcon />
          </a>
        }
      />
      <KpiStrip
        items={[
          { label: 'Peak day', value: c ? formatDay(c.peak_date) : '—', caption: c ? `From the ${c.resolution} series` : 'No daily or weekly series' },
          { label: 'Rise', value: c?.rise_days ?? '—', unit: c?.rise_days == null ? undefined : 'days', caption: c?.onset_date ? `From 10% of peak on ${formatDay(c.onset_date)}` : 'Already high when the series starts' },
          { label: 'Half-life', value: c?.half_life_days ?? '—', unit: c?.half_life_days == null ? undefined : 'days', caption: `${term.summary.shape} from the peak down to 50%` },
          {
            label: 'Now',
            value: formatNumber(phase.recent_vs_peak_pct, 1),
            unit: phase.recent_vs_peak_pct === undefined ? undefined : '% of peak',
            caption: phase.days_since_peak !== undefined ? `${phase.detail} Peak was ${phase.days_since_peak.toLocaleString('en-PH')} days ago.` : phase.detail,
          },
        ]}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MainChart term={term} />
        <PeakWeeks term={term} />
      </div>
      <div className="mt-6">
        <ForecastReplay key={term.slug} term={term} />
      </div>
      <div className="mt-6">
        <Regions term={term} />
      </div>
      <div className="mt-6">
        <Provenance term={term} />
      </div>
    </>
  )
}
