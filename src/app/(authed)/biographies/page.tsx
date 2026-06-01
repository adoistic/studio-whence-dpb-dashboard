import { loadContent, requireLine } from '@/lib/content'
import { LinePageShell } from '@/components/LinePageShell'
import Intro from '@content/intros/biographies.mdx'

export default function Page() {
  const content = loadContent()
  const line = requireLine('biographies', content)
  return <LinePageShell line={line} introMdx={<Intro />} />
}
