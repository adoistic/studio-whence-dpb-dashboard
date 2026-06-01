import { loadContent, requireLine } from '@/lib/content'
import { LinePageShell } from '@/components/LinePageShell'
import Intro from '@content/intros/awareness.mdx'

export default function Page() {
  const content = loadContent()
  const line = requireLine('awareness', content)
  return <LinePageShell line={line} introMdx={<Intro />} />
}
