import type { ReactNode } from 'react'
import type { Phase } from '../lib/api'

export function Card({ title, aside, children, className = '', id }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`min-w-0 rounded-card border border-edge bg-sheet p-5 ${className}`}>
      {title || aside ? (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title ? <h2 className="text-section font-semibold text-ink">{title}</h2> : <span />}
          {aside}
        </header>
      ) : null}
      {children}
    </section>
  )
}

const PHASE_STYLE: Record<Phase['phase'], string> = {
  Rising: 'bg-pill-positive-bg text-pill-positive-ink',
  Peaking: 'bg-pill-negative-bg text-pill-negative-ink',
  Fading: 'bg-pill-warning-bg text-pill-warning-ink',
  Evergreen: 'bg-[#e3ecfb] text-[#0b2a66]',
  Dormant: 'bg-pill-neutral-bg text-pill-neutral-ink',
  'No signal': 'bg-pill-neutral-bg text-pill-neutral-ink',
}

export function PhasePill({ phase }: { phase: Phase }) {
  return (
    <span title={phase.detail} className={`inline-flex h-5 flex-none items-center whitespace-nowrap rounded-full px-2 text-small font-medium ${PHASE_STYLE[phase.phase]}`}>
      {phase.phase}
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 flex-none rounded-control bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-[5px] px-3 text-small font-medium transition-colors disabled:cursor-not-allowed disabled:text-faint/60 ${
            value === o.value ? 'bg-sheet text-ink ring-1 ring-edge' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface Kpi {
  label: string
  value: ReactNode
  unit?: string
  caption?: ReactNode
}

/** One container split by 1px dividers: label over value, a caption naming the baseline. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-card border border-edge bg-sheet md:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ '--n': items.length } as React.CSSProperties}>
      {items.map((k, i) => (
        <div
          key={k.label}
          className={`min-w-0 border-edge px-5 py-4 ${i % 2 === 1 ? 'border-l' : ''} ${i >= 2 ? 'border-t md:border-t-0' : ''} ${i > 0 ? 'md:border-l' : ''} ${
            items.length % 2 === 1 && i === items.length - 1 ? 'col-span-2 md:col-span-1' : ''
          }`}
        >
          <div className="text-body font-medium text-muted">{k.label}</div>
          <div className="mt-1 text-kpi text-ink num">
            {k.value}
            {k.unit ? <span className="ml-1 text-body text-muted">{k.unit}</span> : null}
          </div>
          {k.caption ? <div className="mt-1 text-small text-muted">{k.caption}</div> : null}
        </div>
      ))}
    </div>
  )
}

/** Loading placeholder at the real size of what will arrive. */
export function Bar({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block rounded-[4px] bg-raised ${className}`} />
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-control px-4 py-3 text-body text-ink">
      <span className="inline-block size-2 flex-none rounded-full bg-negative" />
      <span>{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="font-medium text-observed hover:underline">
          Retry
        </button>
      ) : null}
    </div>
  )
}
