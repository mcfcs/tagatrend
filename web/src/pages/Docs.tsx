import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bar, ErrorNote } from '../components/ui'
import { useDocs } from '../lib/api'

// HTML comments mark generated sections in the file; they are not content.
const COMMENT = /<!--[\s\S]*?-->/g

/** docs/PIPELINE.md, served by Flask so the page and the file never drift apart. */
export default function Docs() {
  const { data, error, mutate } = useDocs()
  if (error) return <ErrorNote message="Couldn't load the docs." onRetry={() => mutate()} />
  if (!data) return <Bar className="h-[600px] w-full max-w-[760px]" />
  return (
    <article className="doc mx-auto max-w-[760px]">
      <Markdown remarkPlugins={[remarkGfm]}>{data.markdown.replace(COMMENT, '')}</Markdown>
    </article>
  )
}
