/**
 * Regression: posting a second idea without reloading the page silently
 * OVERWROTE the first.
 *
 * `ideaId` was minted once on mount and never regenerated, and `createIdea`
 * uses setDoc (no merge) — so the second post replaced the first idea's
 * document wholesale. Reported by Shruti (Diamond) on 2026-08-21: she posted an
 * Emami idea, then a Haldiram's idea, and only Haldiram's survived. The Emami
 * text was unrecoverable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let nextId = 0
const createIdea = vi.fn(async (_id: string, _input: unknown, _author: unknown) => {})

vi.mock('@tiptap/react', () => ({
  useEditor: () => ({
    getHTML: () => '<p>body</p>',
    commands: { clearContent: () => {} },
    chain: () => ({ focus: () => ({ run: () => {} }) }),
  }),
  EditorContent: () => <div data-testid="editor" />,
}))
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/ideas', () => ({
  // A REAL id generator: each call mints a new one, as Firestore's doc() does.
  newIdeaRef: () => ({ id: `idea-${++nextId}` }),
  createIdea: (id: string, input: unknown, author: unknown) => createIdea(id, input, author),
}))
vi.mock('@/lib/dataApi', () => ({ uploadIdeaImage: vi.fn(async () => 'k'), resolveUrls: vi.fn(async () => ({})) }))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IdeaComposer } from '@/components/ideas/IdeaComposer'

beforeEach(() => { nextId = 0; createIdea.mockClear() })

describe('posting two ideas in one session', () => {
  it('writes each to its OWN document', async () => {
    render(<IdeaComposer role="sub_admin" author={{ email: 'shruti@dpb.in', name: 'Shruti Gupta' }} />)
    const post = () => fireEvent.click(screen.getByRole('button', { name: /post/i }))

    post()
    await waitFor(() => expect(createIdea).toHaveBeenCalledTimes(1))
    post()
    await waitFor(() => expect(createIdea).toHaveBeenCalledTimes(2))

    const firstId = createIdea.mock.calls[0][0]
    const secondId = createIdea.mock.calls[1][0]
    expect(secondId).not.toBe(firstId)   // the whole bug in one assertion
  })
})
