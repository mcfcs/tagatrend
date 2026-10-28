import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useLibrary } from '../lib/api'
import { formatDay } from '../lib/format'
import { CloseIcon, DocsIcon, LibraryIcon, MenuIcon, ModelsIcon, Mark, OverviewIcon } from './icons'
import { SearchBox } from './SearchBox'

const DATA_END = '2026-10-27'

const NAV = [
  { to: '/', label: 'Overview', icon: <OverviewIcon />, end: true },
  { to: '/library', label: 'Library', icon: <LibraryIcon /> },
  { to: '/models', label: 'Models', icon: <ModelsIcon /> },
  { to: '/docs', label: 'Docs', icon: <DocsIcon /> },
]

function navClass({ isActive }: { isActive: boolean }) {
  return `flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-body transition-colors ${
    isActive ? 'bg-active font-medium text-ink' : 'text-muted hover:bg-active/60 hover:text-ink'
  }`
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useLibrary()
  const core = data?.trends.filter((t) => t.group === 'core') ?? []
  const searched = data?.searched.slice(0, 5) ?? []
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={navClass} onClick={onNavigate}>
          <span className="text-muted">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
      <h2 className="mb-1.5 mt-7 px-2.5 text-small text-muted">The four set trends</h2>
      {core.map((t) => (
        <NavLink key={t.slug} to={`/trend/${t.slug}`} className={navClass} onClick={onNavigate}>
          <span translate="no" className="truncate">{t.query}</span>
        </NavLink>
      ))}
      {searched.length ? (
        <>
          <h2 className="mb-1.5 mt-7 px-2.5 text-small text-muted">Your searches</h2>
          {searched.map((t) => (
            <NavLink key={t.slug} to={`/trend/${t.slug}`} className={navClass} onClick={onNavigate}>
              <span translate="no" className="truncate">{t.query}</span>
            </NavLink>
          ))}
        </>
      ) : null}
    </nav>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-control px-2.5">
      <Mark />
      <span className="leading-tight">
        <span translate="no" className="block text-body font-semibold text-ink">Tagatrend</span>
        <span className="block text-small text-muted">Google Trends, Philippines</span>
      </span>
    </Link>
  )
}

/**
 * Framed sheet: the sidebar and the 48px top bar share one tinted frame with no rule between them;
 * the page is a white sheet inset 8px from the window's right and bottom edges.
 * Grid: 228px sidebar + sheet. Inside the sheet, 24px padding and one 24px gutter.
 */
export function Shell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false)
  const location = useLocation()
  useEffect(() => setMenu(false), [location.pathname])
  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : ''
  }, [menu])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[228px_minmax(0,1fr)] lg:grid-rows-[48px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-sheet focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop frame */}
      <div className="hidden items-center lg:flex"><Brand /></div>
      <header className="sticky top-0 z-20 hidden h-12 items-center justify-center bg-frame px-6 lg:flex">
        <div className="w-full max-w-[548px]"><SearchBox /></div>
      </header>
      <aside className="hidden flex-col justify-between px-3 pb-6 pt-4 lg:sticky lg:top-12 lg:flex lg:h-[calc(100dvh-48px)]">
        <Nav />
        <p className="px-2.5 text-small text-muted">Data to {formatDay(DATA_END)}</p>
      </aside>

      {/* Phone and tablet bar */}
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 bg-frame px-4 lg:hidden">
        <Brand />
        <button type="button" onClick={() => setMenu(true)} aria-label="Open menu" className="grid size-11 place-items-center rounded-control text-ink hover:bg-active">
          <MenuIcon />
        </button>
      </header>
      {menu ? (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-40 flex flex-col gap-6 overflow-y-auto overscroll-contain bg-frame px-4 pb-8 pt-2 lg:hidden">
          <div className="flex h-12 items-center justify-between">
            <Brand />
            <button type="button" onClick={() => setMenu(false)} aria-label="Close menu" className="grid size-11 place-items-center rounded-control hover:bg-active">
              <CloseIcon />
            </button>
          </div>
          <SearchBox onDone={() => setMenu(false)} />
          <Nav onNavigate={() => setMenu(false)} />
          <p className="px-2.5 text-small text-muted">Data to {formatDay(DATA_END)}</p>
        </div>
      ) : null}

      <main id="main" className="min-w-0 bg-sheet lg:mb-2 lg:mr-2 lg:rounded-sheet lg:border lg:border-edge">
        <div className="mx-auto max-w-[1312px] px-4 pb-16 pt-6 sm:px-6">{children}</div>
      </main>
    </div>
  )
}

export function TitleRow({ title, line, action }: { title: ReactNode; line?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-[760px]">
        <h1 className="text-title font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {line ? <p className="mt-1 text-body text-muted sm:text-[15px] sm:leading-[22px]">{line}</p> : null}
      </div>
      {action}
    </div>
  )
}
