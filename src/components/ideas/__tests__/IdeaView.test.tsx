import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/ideas', () => ({ setIdeaStatus: vi.fn(), setIdeaTags: vi.fn(), deleteIdea: vi.fn() }))
vi.mock('@/lib/dataApi', () => ({ resolveUrls: vi.fn(async () => ({})) }))
vi.mock('@/lib/ideaCopy', () => ({ buildClipboardPayload: vi.fn(async () => ({ html: '<p>x</p>', text: 'x' })) }))
vi.mock('@/components/ideas/IdeaMarkdown', () => ({ IdeaMarkdown: ({ markdown }: { markdown: string }) => <div>{markdown}</div> }))
// IdeaCaptures transitively imports the real @/lib/firebase (via its live
// hook), which would crash in jsdom (auth/invalid-api-key) — stub it out.
vi.mock('@/components/ideas/IdeaCaptures', () => ({ IdeaCaptures: () => null }))
import { setIdeaStatus } from '@/lib/ideas'
import { IdeaView } from '@/components/ideas/IdeaView'

const idea = { id: 'i1', author: 'a@dpb.in', authorName: 'A', bodyMarkdown: 'x', r2Images: [], visibility: 'private', recipients: [], status: 'new', tags: [], createdAt: { toMillis: () => 1 }, updatedAt: null, editedAt: null } as any

it('admin can change status', () => {
  render(<IdeaView idea={idea} role="admin" viewerEmail="adnan@thothica.com" />)
  fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'actioned' } })
  expect(setIdeaStatus).toHaveBeenCalledWith('i1', 'actioned')
})

it('copy writes to the clipboard', async () => {
  const write = vi.fn(async () => {})
  // @ts-expect-error test shim
  global.ClipboardItem = class { constructor(public items: any) {} }
  Object.assign(navigator, { clipboard: { write } })
  render(<IdeaView idea={idea} role="allow" viewerEmail="m@dpb.in" />)
  expect(screen.queryByLabelText(/status/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /copy/i }))
  await waitFor(() => expect(write).toHaveBeenCalled())
})
