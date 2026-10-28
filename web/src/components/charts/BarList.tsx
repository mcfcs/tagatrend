interface Row {
  label: string
  value: number
}

/** A sorted horizontal bar list on a 0-100 scale; the top row in the data hue, the rest grey. */
export function BarList({ rows, max = 100, limit = 8 }: { rows: Row[]; max?: number; limit?: number }) {
  const shown = rows.slice(0, limit)
  return (
    <ol className="flex flex-col gap-2.5">
      {shown.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-3">
          <div className="min-w-0">
            <div className="truncate text-body text-ink">{r.label}</div>
            <div className="mt-1 h-1.5 rounded-full" style={{ width: `${Math.max(1.5, (88 * r.value) / max)}%`, background: i === 0 ? '#0038a8' : '#b9bbbe' }} />
          </div>
          <div className="text-right text-body text-ink num">{Math.round(r.value)}</div>
        </li>
      ))}
    </ol>
  )
}
