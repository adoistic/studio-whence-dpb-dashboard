import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageSection } from '@/components/LanguageSection'
import type { Comic } from '@/types/content'

vi.mock('@/lib/downloadDoc', () => ({ downloadKey: vi.fn() }))

const comic = {
  line: 'legacy', slug: 'rajyog', title: 'Rajyog',
  translations: [{
    language: 'English',
    script: { key: 'docs/comics/legacy/y/rajyog/script-en.md', bytes: 10 },
    blank: { key: 'artifacts/comics/legacy/rajyog/rajyog-blank.pdf', bytes: 20, filename: 'R.pdf' },
  }],
} as Comic

describe('LanguageSection', () => {
  test('offers the downloads', () => {
    render(<LanguageSection comic={comic} />)
    expect(screen.getByRole('button', { name: /download english script/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /blank pages/i })).toBeInTheDocument()
  })

  test('no longer offers an inline reader — the script reader does that now', () => {
    render(<LanguageSection comic={comic} />)
    expect(screen.queryByRole('button', { name: /read script/i })).not.toBeInTheDocument()
  })

  test('renders nothing when there are no translations', () => {
    const { container } = render(<LanguageSection comic={{ ...comic, translations: [] } as Comic} />)
    expect(container).toBeEmptyDOMElement()
  })
})
