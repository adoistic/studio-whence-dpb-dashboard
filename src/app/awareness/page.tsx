import { loadContent, findLine } from '@/lib/content'
import { LinePageShell } from '@/components/LinePageShell'
import { Footer } from '@/components/Footer'
import Intro from '@content/intros/awareness.mdx'

export default function Page() {
  const content = loadContent()
  const line = findLine('awareness', content)!
  return (
    <>
      <LinePageShell line={line} introMdx={<Intro />} />
      <Footer sha={content.source_sha} lastUpdate={content.generated_at} />
    </>
  )
}
