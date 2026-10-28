import { useDeferredValue } from 'react'
import { Link, useSearchParams } from 'react-router'
import { TitleRow } from '../components/Shell'
import { Bar, ErrorNote, PhasePill, Segmented } from '../components/ui'
import { useLibrary, type LibraryRow } from '../lib/api'
import { formatDay, formatNumber } from '../lib/format'

type Sort = 'peak' | 'half' | 'name'

/** The yearly mean of the monthly backbone as a strip of 2px columns: when the term mattered. */
function YearStrip({ row }: { row: LibraryRow }) {
  const years = row.yearly.filter(([d]) => d >= '2008')
  const max = Math.max(1, ...years.map(([, v]) => v ?? 0))
  return (
    <svg width={years.length * 5} height={20} aria-label={`Yearly interest for ${row.query}, 2008 to 2026`} role="img" className="block">
      {years.map(([d, v], i) => {
        const h = Math.max(1, (18 * (v ?? 0)) / max)
        return <rect key={d} x={i * 5} y={20 - h} width={3} height={h} fill={v === max ? '#0038a8' : '#b9bbbe'} />
      })}
    </svg>
  )
}

export function Library() {
  const { data, error, mutate } = useLibrary()
  const [params, setParams] = useSearchParams()
  const sort = (['peak', 'half', 'name'].includes(params.get('sort') ?? '') ? params.get('sort') : 'peak') as Sort
  const filter = params.get('q') ?? ''
  const update = (key: string, value: string, fallback: string) =>
    setParams((p) => {
      if (value === fallback) p.delete(key)
      else p.set(key, value)
      return p
    }, { replace: true })
  const setSort = (value: Sort) => update('sort', value, 'peak')
  const setFilter = (value: string) => update('q', value, '')
  const needle = useDeferredValue(filter).trim().toLowerCase()
  const rows = (data?.trends ?? [])
    .filter((r) => !needle || r.query.toLowerCase().includes(needle) || r.blurb.toLowerCase().includes(needle))
    .toSorted((a, b) =>
      sort === 'name'
        ? a.query.localeCompare(b.query)
        : sort === 'half'
          ? (a.lifecycle?.half_life_days ?? 1e9) - (b.lifecycle?.half_life_days ?? 1e9)
          : (b.peak_month ?? '').localeCompare(a.peak_month ?? ''),
    )

  return (
    <>
      <TitleRow
        title="Library"
        line={data ? `${data.trends.length} terms: the four set trends from the notebooks and ${data.trends.length - 4} more Filipino viral terms from 2010 to 2025.` : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="w-full sm:w-[316px]">
          <span className="sr-only">Filter the library</span>
          <input
            name="filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or meaning…"
            className="h-8 w-full rounded-control border border-control px-3 text-body placeholder:text-faint focus:border-observed focus:outline-none focus-visible:ring-2 focus-visible:ring-observed/25"
          />
        </label>
        <Segmented
          label="Sort by"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'peak', label: 'Newest peak' },
            { value: 'half', label: 'Fastest fade' },
            { value: 'name', label: 'Name' },
          ]}
        />
      </div>
      {error ? <ErrorNote message="Couldn't load the library." onRetry={() => mutate()} /> : null}
      <div className="overflow-hidden rounded-card border border-edge">
        <table className="w-full text-body">
          <thead className="hidden md:table-header-group">
            <tr className="text-left text-small text-muted">
              <th className="px-4 py-2.5 font-normal">Term</th>
              <th className="px-4 py-2.5 font-normal">Interest by year</th>
              <th className="px-4 py-2.5 text-right font-normal">Peak day</th>
              <th className="px-4 py-2.5 text-right font-normal">Rise</th>
              <th className="px-4 py-2.5 text-right font-normal">Half-life</th>
              <th className="px-4 py-2.5 font-normal">Now</th>
            </tr>
          </thead>
          <tbody>
            {!data && !error
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-t border-rule">
                    <td colSpan={6} className="px-4 py-4"><Bar className="h-4 w-full" /></td>
                  </tr>
                ))
              : null}
            {rows.map((r) => (
              <tr key={r.slug} className="border-t border-rule first:border-t-0 hover:bg-raised md:first:border-t">
                <td className="max-w-[360px] px-4 py-3">
                  <Link to={`/trend/${r.slug}`} translate="no" className="font-medium text-ink hover:text-observed">{r.query}</Link>
                  {r.group === 'core' ? <span className="ml-2 text-small text-muted">Set trend</span> : null}
                  <div className="mt-0.5 line-clamp-2 text-small text-muted">{r.blurb}</div>
                  <div className="mt-2 flex items-center gap-3 text-small text-muted md:hidden num">
                    <PhasePill phase={r.phase} />
                    <span>Peak {formatDay(r.lifecycle?.peak_date ?? r.peak_month)}</span>
                    <span>Half-life {r.lifecycle?.half_life_days ?? '—'} d</span>
                  </div>
                </td>
                <td className="hidden px-4 py-3 md:table-cell"><YearStrip row={r} /></td>
                <td className="hidden px-4 py-3 text-right text-ink md:table-cell num">{formatDay(r.lifecycle?.peak_date ?? (r.peak_month ? `${r.peak_month}-01` : null))}</td>
                <td className="hidden px-4 py-3 text-right text-ink md:table-cell num">{r.lifecycle?.rise_days == null ? '—' : `${formatNumber(r.lifecycle.rise_days, 0)} d`}</td>
                <td className="hidden px-4 py-3 text-right text-ink md:table-cell num">{r.lifecycle?.half_life_days == null ? '—' : `${formatNumber(r.lifecycle.half_life_days, 0)} d`}</td>
                <td className="hidden px-4 py-3 md:table-cell"><PhasePill phase={r.phase} /></td>
              </tr>
            ))}
            {data && !rows.length ? (
              <tr><td colSpan={6} className="px-4 py-6 text-body text-muted">No term matches “{filter}”. Use the search bar to pull it from Google Trends.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  )
}
