'use client'

import { useContent, requireLine } from '@/lib/content'
import { LinePageShell } from '@/components/LinePageShell'
import Intro from '@content/intros/indic.mdx'

export default function Page() {
  const { content } = useContent()
  if (!content) return null
  const line = requireLine('indic', content)
  return <LinePageShell line={line} introMdx={<Intro />} />
}
