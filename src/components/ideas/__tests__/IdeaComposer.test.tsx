import { describe, it, expect, vi } from 'vitest'
import { buildCreateInput } from '@/components/ideas/IdeaComposer'

describe('buildCreateInput', () => {
  it('normalizes specific recipients and excludes empties', () => {
    const out = buildCreateInput({
      title: 'Hi', markdown: 'body', r2Images: [],
      visibility: 'specific', recipientsRaw: 'A@DPB.in, , b@x.io',
    })
    expect(out.visibility).toBe('specific')
    expect(out.recipients).toEqual(['a@dpb.in', 'b@x.io'])
  })
  it('clears recipients for non-specific visibility', () => {
    const out = buildCreateInput({ title: '', markdown: 'b', r2Images: [], visibility: 'all_approved', recipientsRaw: 'x@y.io' })
    expect(out.recipients).toEqual([])
  })
})

// ── Render test: the visibility UI reveals a recipient input only for Specific ──

vi.mock('@tiptap/react', () => ({
  useEditor: () => ({
    getHTML: () => '<p>body</p>',
    commands: {},
    chain: () => ({ focus: () => ({ run: () => {} }) }),
  }),
  EditorContent: () => <div data-testid="editor" />,
}))
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/ideas', () => ({
  newIdeaRef: () => ({ id: 'idea-1' }),
  createIdea: vi.fn(async () => {}),
}))
vi.mock('@/lib/dataApi', () => ({ uploadIdeaImage: vi.fn(async () => 'k'), resolveUrls: vi.fn(async () => ({})) }))

import { render, screen, fireEvent } from '@testing-library/react'
import { IdeaComposer } from '@/components/ideas/IdeaComposer'

it('reveals recipient input only for Specific', () => {
  render(<IdeaComposer role="sub_admin" author={{ email: 'a@dpb.in', name: 'A' }} />)
  expect(screen.queryByPlaceholderText(/email/i)).toBeNull()
  fireEvent.click(screen.getByLabelText(/specific/i))
  expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
})
