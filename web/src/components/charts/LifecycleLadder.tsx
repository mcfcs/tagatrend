import { scaleLinear } from 'd3-scale'
import { Link } from 'react-router'
import type { LibraryRow } from '../../lib/api'
import { useWidth } from './useWidth'

const NAME_COL = 148
const NUM_COL = 132
const PITCH = 32
const AXIS = 24
const RISE_FILL = '#b3c3e6'

interface Props {
  rows: LibraryRow[]
}

type Resolved = LibraryRow & { lifecycle: NonNullable<LibraryRow['lifecycle']> }

/** Every term on one axis of days around its own peak: how long it took to rise, how fast it fell. */
export function LifecycleLadder({ rows }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const resolved = rows
    .filter((r): r is Resolved => r.lifecycle !== null && r.lifecycle.half_life_days !== null)
    .toSorted((a, b) => a.lifecycle.half_life_days! - b.lifecycle.half_life_days!)
  const narrow = width < 560
  const nameCol = narrow ? 108 : NAME_COL
  const numCol = narrow ? 0 : NUM_COL

  const before = Math.min(120, Math.max(30, ...resolved.map((r) => r.lifecycle.rise_days ?? 0)))
  const after = Math.min(240, Math.max(60, ...resolved.map((r) => r.lifecycle.fade_days ?? r.lifecycle.half_life_days ?? 0)))
  const x = scaleLinear().domain([-before, after]).range([nameCol + 8, Math.max(nameCol + 40, width - numCol - 12)])
  const ticks = x.ticks(narrow ? 4 : 7).filter((t) => t >= -before && t <= after)
  const height = AXIS + resolved.length * PITCH

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label="Rise and decay of each term around its peak, in days" className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={AXIS - 6} y2={height} stroke={t === 0 ? '#c9cbce' : '#f0f1f2'} />
            <text x={x(t)} y={12} textAnchor="middle" className="fill-muted text-[11px] num">
              {t === 0 ? 'Peak' : `${t > 0 ? '+' : '−'}${Math.abs(t)} d`}
            </text>
          </g>
        ))}
        {!narrow ? (
          <>
            <text x={width - numCol + 52} y={12} textAnchor="end" className="fill-muted text-[11px]">Rise</text>
            <text x={width - 8} y={12} textAnchor="end" className="fill-muted text-[11px]">Half-life</text>
          </>
        ) : null}
        {resolved.map((r, i) => {
          const c = r.lifecycle
          const cy = AXIS + i * PITCH + PITCH / 2
          const onset = c.rise_days === null ? null : Math.max(-before, -c.rise_days)
          const half = Math.min(after, c.half_life_days!)
          const fade = c.fade_days === null ? after : Math.min(after, c.fade_days)
          return (
            <g key={r.slug}>
              <Link to={`/trend/${r.slug}`} aria-label={`${r.query}: half-life ${c.half_life_days} days`}>
                <rect x={0} y={cy - PITCH / 2} width={width} height={PITCH} fill="transparent" className="hover:fill-raised" />
                <text x={0} y={cy} dy="0.34em" className="fill-ink text-[13px]">
                  {r.query.length > 18 && narrow ? `${r.query.slice(0, 13)}…` : r.query}
                </text>
                {onset !== null ? <rect x={x(onset)} y={cy - 5} width={Math.max(1, x(0) - x(onset))} height={10} rx={2} fill={RISE_FILL} /> : null}
                <rect x={x(0)} y={cy - 5} width={Math.max(2, x(half) - x(0))} height={10} rx={2} fill="#0038a8" />
                <line x1={x(half)} x2={x(fade)} y1={cy} y2={cy} stroke="#0038a8" strokeWidth={1.5} strokeDasharray={c.fade_days === null ? '3 3' : undefined} />
                {c.fade_days !== null && c.fade_days <= after ? <line x1={x(fade)} x2={x(fade)} y1={cy - 4} y2={cy + 4} stroke="#0038a8" strokeWidth={1.5} /> : null}
                <circle cx={x(0)} cy={cy} r={4} fill="#ce1126" stroke="#fff" strokeWidth={1.5} />
                {!narrow ? (
                  <>
                    <text x={width - numCol + 52} y={cy} dy="0.34em" textAnchor="end" className="fill-ink text-[13px] num">
                      {c.rise_days === null ? '—' : `${c.rise_days} d`}
                    </text>
                    <text x={width - 8} y={cy} dy="0.34em" textAnchor="end" className="fill-ink text-[13px] num">
                      {c.half_life_days} d
                    </text>
                  </>
                ) : null}
              </Link>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** The ladder's legend, drawn with the same marks as the rows. */
export function LadderLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-muted">
      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-[2px]" style={{ background: RISE_FILL }} />Rise from 10%</span>
      <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-peak" />Peak</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-[2px] bg-observed" />Down to half</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-[1.5px] w-4 bg-observed" />Down to 10%</span>
    </div>
  )
}
