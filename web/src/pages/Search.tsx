import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { mutate } from 'swr'
import { TitleRow } from '../components/Shell'
import { Card, ErrorNote } from '../components/ui'
import { fetchJson, type SearchJob } from '../lib/api'

const STEPS = ['Monthly history', 'Weekly series', 'Daily series around the peak', 'Regions']
// The pipeline reports steps as 'monthly history', 'weekly <dates>', 'daily <dates>', 'regions'.
const PREFIXES = ['monthly', 'weekly', 'daily', 'regions']

/** Pulls a new term from Google Trends through the same pipeline as the library, then opens it. */
export function Search() {
  const [params] = useSearchParams()
  const query = params.get('q')?.trim() ?? ''
  const navigate = useNavigate()
  const [job, setJob] = useState<SearchJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!query) return
    let cancelled = false
    let timer: number | undefined
    setError(null)
    setJob(null)

    async function poll(id: string) {
      try {
        const next = await fetchJson<SearchJob>(`/api/search/${id}`)
        if (cancelled) return
        setJob(next)
        if (next.status === 'running') timer = window.setTimeout(() => poll(id), 1500)
        else if (next.status === 'done') finish(next.slug)
        else setError(next.error ?? 'The search failed.')
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    }
    function finish(slug: string) {
      mutate('/api/trends')
      navigate(`/trend/${slug}`, { replace: true })
    }
    fetchJson<SearchJob>('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
      .then((started) => {
        if (cancelled) return
        setJob(started)
        if (started.status === 'done') finish(started.slug)
        else if (started.id) poll(started.id)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, navigate, attempt])

  const current = Math.max(0, ...(job?.steps ?? []).map((step) => PREFIXES.findIndex((p) => step.startsWith(p))))
  const done = job?.steps?.length ? current + 1 : 0
  return (
    <>
      <TitleRow title={query ? `Pulling “${query}”` : 'Search'} line="Live from Google Trends, Philippines. Each request is spaced out to stay under Google’s rate limit, so this takes a minute or more." />
      {!query ? <p className="text-body text-muted">Type a term in the search bar above.</p> : null}
      {query ? (
        <Card title="Progress" className="max-w-[640px]">
          <ol aria-live="polite" className="flex flex-col">
            {STEPS.map((label, i) => {
              const state = error && i === Math.max(0, done - 1) ? 'failed' : i < done - 1 || job?.status === 'done' ? 'done' : i === done - 1 || (i === 0 && !done) ? 'running' : 'waiting'
              return (
                <li key={label} className="flex h-11 items-center justify-between gap-4 border-b border-rule last:border-0">
                  <span className={state === 'waiting' ? 'text-muted' : 'text-ink'}>{label}</span>
                  <span
                    className={`inline-flex h-5 items-center rounded-full px-2 text-small font-medium ${
                      state === 'done'
                        ? 'bg-pill-positive-bg text-pill-positive-ink'
                        : state === 'failed'
                          ? 'bg-pill-negative-bg text-pill-negative-ink'
                          : state === 'running'
                            ? 'bg-[#e3ecfb] text-[#0b2a66]'
                            : 'bg-pill-neutral-bg text-pill-neutral-ink'
                    }`}
                  >
                    {state === 'done' ? 'Done' : state === 'failed' ? 'Failed' : state === 'running' ? 'Requesting' : 'Waiting'}
                  </span>
                </li>
              )
            })}
          </ol>
          {job?.steps?.length ? <p className="mt-3 text-small text-muted">Last step: {job.steps[job.steps.length - 1]}</p> : null}
          {error ? (
            <div className="mt-4">
              <ErrorNote message={error} onRetry={() => setAttempt((a) => a + 1)} />
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  )
}
