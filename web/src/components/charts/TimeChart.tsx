import { bisector } from 'd3-array'
import { scaleLinear, scaleUtc } from 'd3-scale'
import { area, line } from 'd3-shape'
import { useMemo, useState } from 'react'
import { formatNumber } from '../../lib/format'
import { useWidth } from './useWidth'

export interface Datum {
  t: Date
  v: number | null
}

export interface LineSpec {
  id: string
  label: string
  points: Datum[]
  color: string
  width?: number
  dashed?: boolean
}

export interface BandSpec {
  points: { t: Date; lo: number; hi: number }[]
  color: string
}

export interface SpanSpec {
  start: Date
  end: Date
  label: string
}

export interface MarkerSpec {
  t: Date
  label: string
  color: string
}

interface Props {
  lines: LineSpec[]
  band?: BandSpec
  spans?: SpanSpec[]
  markers?: MarkerSpec[]
  height?: number
  yMax?: number
  label: string
  /** Shown in the tooltip, e.g. "index". */
  unit?: string
}

const MARGIN = { top: 8, right: 12, bottom: 26, left: 32 }
const MARKER_ROW = 18
const DAY = 86_400_000

function tickFormat(span: number) {
  if (span > 3 * 365 * DAY) return new Intl.DateTimeFormat('en-PH', { year: 'numeric', timeZone: 'UTC' })
  if (span > 75 * DAY) return new Intl.DateTimeFormat('en-PH', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  return new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const tooltipDate = new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const byTime = bisector<Datum, Date>((d) => d.t).center

/** One time axis, up to three lines, an optional quantile band, shaded spans and annotated events. */
export function TimeChart({ lines, band, spans = [], markers = [], height = 220, yMax, label, unit = 'index' }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const top = MARGIN.top + (markers.length ? MARKER_ROW : 0)

  const geometry = useMemo(() => {
    const all = lines.flatMap((l) => l.points)
    const bandTimes = band?.points.map((p) => p.t) ?? []
    const times = [...all.map((p) => p.t), ...bandTimes]
    const t0 = new Date(Math.min(...times.map(Number)))
    const t1 = new Date(Math.max(...times.map(Number)))
    const peak = Math.max(
      1,
      ...all.map((p) => p.v ?? 0),
      ...(band?.points.map((p) => p.hi) ?? []),
    )
    const max = Math.max(yMax ?? 0, peak)
    const y = scaleLinear().domain([0, max]).nice(4)
    const ticks = y.ticks(4)
    // Keep the top tick above the data so the line never touches the frame.
    y.domain([0, Math.max(ticks[ticks.length - 1], max) * 1.04])
    const x = scaleUtc().domain([t0, t1]).range([MARGIN.left, Math.max(MARGIN.left + 10, width - MARGIN.right)])
    y.range([height - MARGIN.bottom, top])
    const xTicks = x.ticks(Math.max(3, Math.min(7, Math.floor(width / 120))))
    return { x, y, ticks, xTicks, format: tickFormat(+t1 - +t0) }
  }, [lines, band, yMax, width, height, top])

  const { x, y } = geometry
  const path = line<Datum>()
    .defined((d) => d.v !== null)
    .x((d) => x(d.t))
    .y((d) => y(d.v ?? 0))
  const bandPath = band
    ? area<{ t: Date; lo: number; hi: number }>()
        .x((d) => x(d.t))
        .y0((d) => y(d.lo))
        .y1((d) => y(d.hi))(band.points)
    : null

  const primary = lines[0]?.points ?? []
  const hovered = hover === null ? null : primary[hover]

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const t = x.invert(event.clientX - box.left)
    if (primary.length) setHover(byTime(primary, t))
  }

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="block touch-pan-y select-none"
      >
        {spans.map((s) => (
          <rect
            key={s.label}
            x={x(s.start)}
            y={top}
            width={Math.max(1, x(s.end) - x(s.start))}
            height={height - MARGIN.bottom - top}
            fill="#0038a8"
            opacity={0.06}
          />
        ))}
        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? '#c9cbce' : '#ececed'} />
            <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] num">
              {tick}
            </text>
          </g>
        ))}
        {geometry.xTicks.map((tick, i) => {
          const last = i === geometry.xTicks.length - 1
          return (
            <text
              key={+tick}
              x={x(tick)}
              y={height - 8}
              textAnchor={i === 0 && x(tick) - MARGIN.left < 24 ? 'start' : last && width - MARGIN.right - x(tick) < 24 ? 'end' : 'middle'}
              className="fill-muted text-[11px]"
            >
              {geometry.format.format(tick)}
            </text>
          )
        })}
        {bandPath ? <path d={bandPath} fill={band!.color} opacity={0.16} /> : null}
        {lines.map((l) => (
          <path
            key={l.id}
            d={path(l.points) ?? ''}
            fill="none"
            stroke={l.color}
            strokeWidth={l.width ?? 2}
            strokeDasharray={l.dashed ? '5 4' : undefined}
            strokeLinejoin="round"
          />
        ))}
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={x(m.t)} x2={x(m.t)} y1={top - 4} y2={height - MARGIN.bottom} stroke={m.color} strokeWidth={1} />
            <text
              x={x(m.t) + (x(m.t) > width - 140 ? -6 : 6)}
              y={MARGIN.top + 10}
              textAnchor={x(m.t) > width - 140 ? 'end' : 'start'}
              className="text-[12px] font-medium"
              fill={m.color}
            >
              {m.label}
            </text>
          </g>
        ))}
        {hovered ? (
          <g pointerEvents="none">
            <line x1={x(hovered.t)} x2={x(hovered.t)} y1={top} y2={height - MARGIN.bottom} stroke="#9a9c9e" strokeWidth={1} />
            {lines.map((l) => {
              const d = l.points.find((p) => +p.t === +hovered.t)
              return d && d.v !== null ? <circle key={l.id} cx={x(d.t)} cy={y(d.v)} r={4} fill={l.color} stroke="#fff" strokeWidth={1.5} /> : null
            })}
          </g>
        ) : null}
      </svg>
      {/* The tooltip floats over the chart, so it keeps a shadow. taste-skill-ignore */}
      {hovered ? (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-control bg-primary px-2.5 py-1.5 text-small text-white shadow-[0_4px_16px_rgba(0,0,0,0.18)] num"
          style={x(hovered.t) > width / 2 ? { right: width - x(hovered.t) + 10 } : { left: x(hovered.t) + 10 }}
        >
          <div className="text-[#c9cbce]">{tooltipDate.format(hovered.t)}</div>
          {lines.map((l) => {
            const d = l.points.find((p) => +p.t === +hovered.t)
            return d ? (
              <div key={l.id} className="flex items-center gap-2 whitespace-nowrap">
                <span className="inline-block size-2 rounded-full" style={{ background: l.color }} />
                {l.label} {d.v === null ? '—' : `${formatNumber(d.v, 1)} ${unit}`}
              </div>
            ) : null
          })}
        </div>
      ) : null}
    </div>
  )
}

export const toData = (points: [string, number | null][]): Datum[] =>
  points.map(([date, v]) => ({ t: new Date(`${date}T00:00:00Z`), v }))
