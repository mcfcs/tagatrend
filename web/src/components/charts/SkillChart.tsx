import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import type { SummaryRow } from '../../lib/api'
import { useWidth } from './useWidth'

const M = { top: 12, right: 92, bottom: 26, left: 40 }

/** Skill against the last-value baseline at each horizon; the selected model in the hue, others grey. */
export function SkillChart({ rows, selected, unit }: { rows: SummaryRow[]; selected: string; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const height = 240
  const models = [...new Set(rows.map((r) => r.model))].filter((m) => m !== 'Naive')
  const horizons = [...new Set(rows.map((r) => r.h!))].toSorted((a, b) => a - b)
  const values = rows.filter((r) => r.model !== 'Naive').map((r) => r.skill_pct)
  const y = scaleLinear().domain([Math.min(-10, ...values), Math.max(10, ...values)]).nice(5).range([height - M.bottom, M.top])
  const x = scaleLinear().domain([horizons[0] ?? 1, horizons[horizons.length - 1] ?? 2]).range([M.left, width - M.right])
  const path = line<SummaryRow>().x((r) => x(r.h!)).y((r) => y(r.skill_pct))
  const ordered = [...models.filter((m) => m !== selected), selected]

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label={`Skill of each model against the last value, by ${unit} ahead`} className="block">
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#8d8f92' : '#ececed'} strokeDasharray={t === 0 ? '4 3' : undefined} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] num">{t > 0 ? `+${t}` : t}%</text>
          </g>
        ))}
        {x.ticks(Math.min(horizons.length, 7)).filter(Number.isInteger).map((t) => (
          <text key={t} x={x(t)} y={height - 8} textAnchor="middle" className="fill-muted text-[11px] num">{t}</text>
        ))}
        <text x={width - M.right} y={height - 8} dx={8} className="fill-muted text-[11px]">{unit} ahead</text>
        <text x={width - M.right + 8} y={y(0)} dy="0.32em" className="fill-muted text-[11px]">Last value</text>
        {ordered.map((m) => {
          const series = rows.filter((r) => r.model === m).toSorted((a, b) => a.h! - b.h!)
          const end = series[series.length - 1]
          const on = m === selected
          return (
            <g key={m}>
              <path d={path(series) ?? ''} fill="none" stroke={on ? '#a86f0c' : '#c3c5c8'} strokeWidth={on ? 2.5 : 1.5} />
              {on && end ? (
                <text x={x(end.h!) + 8} y={y(end.skill_pct) - 12} className="text-[12px] font-medium" fill="#a86f0c">{m}</text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
