import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { SkillChart } from '../components/charts/SkillChart'
import { TitleRow } from '../components/Shell'
import { Bar, Card, ErrorNote, KpiStrip, Segmented } from '../components/ui'
import { useLibrary, useModels, type ForecastFreq, type SummaryRow } from '../lib/api'
import { formatNumber, formatSigned } from '../lib/format'

const ORDER = ['Ensemble', 'TimesFM', 'XGBoost', 'MLP', 'Drift', 'Mean of last 7', 'Naive']
const PHASES = ['Rise', 'Peak', 'Decay']

const byOrder = (a: SummaryRow, b: SummaryRow) => ORDER.indexOf(a.model) - ORDER.indexOf(b.model)

function SkillCell({ value }: { value: number }) {
  const tone = value >= 5 ? 'text-positive' : value <= -5 ? 'text-negative' : 'text-muted'
  return <span className={`num ${tone}`}>{formatSigned(value, 0)}%</span>
}

export function Models() {
  const { data, error, mutate } = useModels()
  const { data: library } = useLibrary()
  const available = (['weekly', 'daily'] as const).filter((f) => data?.[f])
  const [params, setParams] = useSearchParams()
  const freq: ForecastFreq = params.get('freq') === 'daily' ? 'daily' : 'weekly'
  const setFreq = (value: ForecastFreq) => setParams(value === 'weekly' ? {} : { freq: value }, { replace: true })
  const active = data?.[freq] ? freq : available[0]
  const report = active ? data?.[active] : undefined
  const [model, setModel] = useState('Ensemble')
  const names = Object.fromEntries((library?.trends ?? []).map((t) => [t.slug, t.query]))

  if (error) return <ErrorNote message="Couldn't load the model report." onRetry={() => mutate()} />
  if (!data) return <Bar className="h-[480px] w-full" />
  if (!report) {
    return (
      <>
        <TitleRow title="Models" />
        <p className="text-body text-muted">No backtest yet. Run <code className="font-mono">python scripts/train_models.py</code> after building the dataset.</p>
      </>
    )
  }

  const m = report.metrics
  const unit = active === 'daily' ? 'days' : 'weeks'
  const buckets = [...new Set(m.by_bucket.map((r) => r.bucket!))]
  const first = buckets[0]
  const learned = m.by_bucket.filter((r) => r.bucket === first && r.model !== 'Naive').toSorted((a, b) => a.mae_index - b.mae_index)
  const best = learned[0]
  const ensemble = m.overall.find((r) => r.model === 'Ensemble')
  const models = m.overall.toSorted(byOrder)
  const rise = m.by_phase.find((r) => r.model === 'Ensemble' && r.phase === 'Rise')

  return (
    <>
      <TitleRow
        title="Models"
        line={
          best
            ? `Forecasting a term the models never trained on, ${best.model} misses by ${formatNumber(best.mae_index, 1)} points ${first.replace('-', ' to ')} ahead, ${formatSigned(best.skill_pct, 0)}% against repeating the last value.${
                rise ? ` During the rise, the ensemble is ${formatSigned(rise.skill_pct, 0)}%: an explosion is hard to see coming.` : ''
              }`
            : undefined
        }
        action={available.length > 1 ? <Segmented label="Resolution" value={active!} onChange={setFreq} options={available.map((f) => ({ value: f, label: f === 'daily' ? 'Daily, 28 days' : 'Weekly, 12 weeks' }))} /> : null}
      />
      <KpiStrip
        items={[
          { label: 'Forecasts scored', value: m.origins.toLocaleString('en-PH'), caption: `Forecast dates across ${m.trends.length} terms` },
          { label: `Best at ${first}`, value: best?.model ?? '—', caption: best ? `${formatNumber(best.mae_index, 1)} pts mean absolute error` : undefined },
          { label: 'Ensemble skill', value: ensemble ? `${formatSigned(ensemble.skill_pct, 0)}%` : '—', caption: `vs last value, all ${m.horizon} ${unit}` },
          { label: '80% band coverage', value: ensemble ? `${formatNumber(100 * ensemble.coverage_80, 0)}%` : '—', caption: 'Share of outcomes inside the ensemble band' },
        ]}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title={`Skill by ${unit} ahead`}
          aside={
            <Segmented
              label="Highlight model"
              value={model}
              onChange={setModel}
              options={ORDER.filter((o) => o !== 'Naive' && m.overall.some((r) => r.model === o)).map((o) => ({ value: o, label: o }))}
            />
          }
        >
          <SkillChart rows={m.by_horizon} selected={model} unit={unit} />
          <p className="mt-2 text-small text-muted">Above the dashed line the model beats repeating the last observed value. Grey lines are the other models.</p>
        </Card>
        <Card title="By lifecycle phase">
          <table className="w-full text-body">
            <thead>
              <tr className="text-small text-muted">
                <th className="pb-2 text-left font-normal">Model</th>
                {PHASES.map((p) => <th key={p} className="pb-2 text-right font-normal">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {models.filter((r) => r.model !== 'Naive').map((r) => (
                <tr key={r.model} className="border-t border-rule">
                  <td className="py-2 text-ink">{r.model}</td>
                  {PHASES.map((p) => {
                    const cell = m.by_phase.find((x) => x.model === r.model && x.phase === p)
                    return <td key={p} className="py-2 text-right">{cell ? <SkillCell value={cell.skill_pct} /> : '—'}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-small text-muted">Skill against the last value. Rise is before the term&rsquo;s peak, Peak the two weeks after it, Decay the rest.</p>
        </Card>
      </div>

      <Card className="mt-6" title="Error by horizon">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-body">
            <thead>
              <tr className="text-small text-muted">
                <th className="pb-2 text-left font-normal">Model</th>
                {buckets.map((b) => <th key={b} className="pb-2 text-right font-normal">{b}</th>)}
                <th className="pb-2 text-right font-normal">80% coverage</th>
              </tr>
            </thead>
            <tbody>
              {models.map((r) => (
                <tr key={r.model} className="border-t border-rule">
                  <td className="py-2.5 text-ink">{r.model}</td>
                  {buckets.map((b) => {
                    const cell = m.by_bucket.find((x) => x.model === r.model && x.bucket === b)!
                    return (
                      <td key={b} className="py-2.5 text-right num">
                        <span className="text-ink">{formatNumber(cell.mae_index, 2)}</span>
                        {r.model !== 'Naive' ? <span className="ml-2 inline-block w-12 text-small"><SkillCell value={cell.skill_pct} /></span> : <span className="ml-2 inline-block w-12 text-small text-muted">base</span>}
                      </td>
                    )
                  })}
                  <td className="py-2.5 text-right text-ink num">{['Naive', 'Drift', 'Mean of last 7'].includes(r.model) ? '—' : `${formatNumber(100 * r.coverage_80, 0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-small text-muted">Mean absolute error in index points on each term&rsquo;s own 0-100 scale, with skill against the last value beside it. Google&rsquo;s own sampling noise between pull days is about 6 points.</p>
      </Card>

      <Card className="mt-6" title="By term" aside={<span className="text-small text-muted">Ensemble, held out</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-body">
            <thead>
              <tr className="text-small text-muted">
                <th className="pb-2 text-left font-normal">Term</th>
                <th className="pb-2 text-right font-normal">Ensemble error</th>
                <th className="pb-2 text-right font-normal">Last value error</th>
                <th className="pb-2 text-right font-normal">Skill</th>
                <th className="pb-2 text-right font-normal">Forecasts</th>
              </tr>
            </thead>
            <tbody>
              {m.by_trend
                .filter((r) => r.model === 'Ensemble')
                .toSorted((a, b) => b.skill_pct - a.skill_pct)
                .map((r) => {
                  const naive = m.by_trend.find((x) => x.model === 'Naive' && x.trend === r.trend)
                  return (
                    <tr key={r.trend} className="border-t border-rule">
                      <td className="py-2.5"><Link to={`/trend/${r.trend}`} className="text-ink hover:text-observed">{names[r.trend!] ?? r.trend}</Link></td>
                      <td className="py-2.5 text-right text-ink num">{formatNumber(r.mae_index, 2)}</td>
                      <td className="py-2.5 text-right text-ink num">{formatNumber(naive?.mae_index, 2)}</td>
                      <td className="py-2.5 text-right"><SkillCell value={r.skill_pct} /></td>
                      <td className="py-2.5 text-right text-muted num">{r.n.toLocaleString('en-PH')}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-small text-muted">
          Each term is forecast by models trained on every other term; same-era terms are held out together. Read the method in the <Link to="/docs" className="text-observed hover:underline">docs</Link>.
        </p>
      </Card>
    </>
  )
}
