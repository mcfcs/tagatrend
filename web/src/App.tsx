import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Shell, TitleRow } from './components/Shell'
import { Bar } from './components/ui'
import { Library } from './pages/Library'
import { Models } from './pages/Models'
import { Overview } from './pages/Overview'
import { Search } from './pages/Search'
import { Term } from './pages/Term'

// The markdown renderer is only needed on /docs.
const Docs = lazy(() => import('./pages/Docs'))

function NotFound() {
  return <TitleRow title="Page not found" line="Use the menu or search for a term." />
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/library" element={<Library />} />
          <Route path="/trend/:slug" element={<Term />} />
          <Route path="/search" element={<Search />} />
          <Route path="/models" element={<Models />} />
          <Route
            path="/docs"
            element={
              <Suspense fallback={<Bar className="h-[600px] w-full max-w-[760px]" />}>
                <Docs />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
