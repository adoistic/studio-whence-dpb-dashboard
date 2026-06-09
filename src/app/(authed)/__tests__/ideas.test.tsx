import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { email: 'a@dpb.in', displayName: 'A' }, loading: false }),
  useAllowStatus: () => 'sub_admin',
  canModerate: (s: string) => s === 'admin' || s === 'sub_admin',
}))
vi.mock('@/lib/ideas', () => ({
  useInboxIdeas: () => ({ data: [], loading: false }),
  useIdeaReads: () => ({}),
  useUnreadIdeaCount: () => 0,
  markIdeaSeen: vi.fn(),
  newIdeaRef: () => ({ id: 'idea-1' }),
  createIdea: vi.fn(async () => {}),
}))
vi.mock('@/lib/dataApi', () => ({ uploadIdeaImage: vi.fn(async () => 'k'), resolveUrls: vi.fn(async () => ({})) }))
vi.mock('@tiptap/react', () => ({
  useEditor: () => ({ getHTML: () => '<p>body</p>', commands: {}, chain: () => ({ focus: () => ({ run: () => {} }) }) }),
  EditorContent: () => <div data-testid="editor" />,
}))

import IdeasPage from '@/app/(authed)/ideas/page'

describe('IdeasPage', () => {
  it('shows the composer for a sub-admin', () => {
    render(<IdeasPage />)
    // The composer surfaces both a "Drop an idea" heading and a "Post idea"
    // button; either proves it rendered for a sub-admin.
    expect(screen.getAllByText(/new idea|drop an idea|post|share an idea/i).length).toBeGreaterThan(0)
  })
})
