import { useDeferredValue, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLibrary } from '../lib/api'
import { SearchIcon } from './icons'

/** Search the library as you type; Enter on a new term pulls it live from Google Trends. */
export function SearchBox({ onDone, autoFocus = false }: { onDone?: () => void; autoFocus?: boolean }) {
  const { data } = useLibrary()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const deferred = useDeferredValue(query)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        event.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const needle = deferred.trim().toLowerCase()
  const known: { slug: string; query: string; peak_month?: string | null }[] = [...(data?.trends ?? []), ...(data?.searched ?? [])]
  const matches = needle ? known.filter((t) => t.query.toLowerCase().includes(needle)).slice(0, 6) : []
  const exact = known.find((t) => t.query.toLowerCase() === needle)
  const options = [
    ...matches.map((t) => ({
      key: t.slug,
      label: t.query,
      hint: t.peak_month ? `Peaked ${t.peak_month.slice(0, 4)}` : 'Searched',
      go: () => navigate(`/trend/${t.slug}`),
    })),
    ...(needle && !exact
      ? [{ key: '__live', label: `Pull “${query.trim()}” from Google Trends`, hint: 'About a minute', go: () => navigate(`/search?q=${encodeURIComponent(query.trim())}`) }]
      : []),
  ]

  function choose(index: number) {
    const option = options[index]
    if (!option) return
    option.go()
    setQuery('')
    setOpen(false)
    input.current?.blur()
    onDone?.()
  }

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(event) => {
        event.preventDefault()
        choose(exact ? options.findIndex((o) => o.label === exact.query) : Math.min(active, options.length - 1))
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">Search a term</label>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><SearchIcon /></span>
      <input
        ref={input}
        id={`${listId}-input`}
        autoFocus={autoFocus}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)) }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          if (event.key === 'Escape') { setOpen(false); input.current?.blur() }
        }}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search a term, e.g. Marites or a new one…"
        className="h-8 w-full rounded-control border border-control bg-sheet pl-9 pr-10 text-body text-ink placeholder:text-faint focus:border-observed focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-[4px] border border-edge px-1.5 text-small text-muted sm:block">/</kbd>
      {open && options.length ? (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-10 z-30 overflow-hidden rounded-card border border-edge bg-sheet py-1 shadow-[0_8px_28px_rgba(0,0,0,0.12)]">
          {options.map((o, i) => (
            <li
              key={o.key}
              role="option"
              aria-selected={i === active}
              onMouseDown={(event) => { event.preventDefault(); choose(i) }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-4 px-3 py-2 text-body ${i === active ? 'bg-active' : ''}`}
            >
              <span className={`truncate ${o.key === '__live' ? 'font-medium text-observed' : 'text-ink'}`}>{o.label}</span>
              <span className="flex-none text-small text-muted">{o.hint}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  )
}
