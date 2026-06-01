import type { Content, Line, LineSlug } from '@/types/content'
import data from '../../public/data/content.json'

export function loadContent(): Content {
  return data as unknown as Content
}

export function findLine(slug: LineSlug, content: Content): Line | undefined {
  return content.lines.find((l) => l.slug === slug)
}

export function findComic(
  line: LineSlug,
  slug: string,
  content: Content
) {
  return findLine(line, content)?.comics.find((c) => c.slug === slug)
}
