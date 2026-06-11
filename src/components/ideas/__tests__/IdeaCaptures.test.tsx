/**
 * Tests for the IdeaCaptures panel — ChatGPT conversations rendered below an
 * idea's body. The live hook and the gated transcript fetch are mocked; the
 * markdown pipeline (react-markdown + default rehype-sanitize) runs for real.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { IdeaCapture } from '@/types/idea'

vi.mock('@/lib/ideaCaptures', () => ({ useIdeaCaptures: vi.fn() }))
vi.mock('@/lib/dataApi', () => ({ readIdeaCapture: vi.fn() }))

import { useIdeaCaptures } from '@/lib/ideaCaptures'
import { readIdeaCapture } from '@/lib/dataApi'
import { IdeaCaptures } from '@/components/ideas/IdeaCaptures'

const mockedUse = vi.mocked(useIdeaCaptures)
const mockedRead = vi.mocked(readIdeaCapture)

const cap = (over: Partial<IdeaCapture> = {}): IdeaCapture => ({
  id: 'abc-123',
  url: 'https://chatgpt.com/share/abc-123',
  shareId: 'abc-123',
  status: 'captured',
  error: null,
  title: null,
  model: null,
  messageCount: null,
  charCount: null,
  r2Key: null,
  createdAt: null,
  capturedAt: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('IdeaCaptures', () => {
  it('renders nothing when there are no captures', () => {
    mockedUse.mockReturnValue({ data: [], loading: false })
    const { container } = render(<IdeaCaptures ideaId="idea-1" />)
    expect(container.firstChild).toBeNull()
  })

  it('a captured row shows the title, the message count and the captured date', () => {
    const ms = 1718000000000
    mockedUse.mockReturnValue({
      data: [
        cap({
          title: 'Brainstorm on covers',
          messageCount: 17,
          capturedAt: { toMillis: () => ms } as IdeaCapture['capturedAt'],
        }),
      ],
      loading: false,
    })
    render(<IdeaCaptures ideaId="idea-1" />)
    expect(screen.getByText('Brainstorm on covers')).toBeTruthy()
    expect(screen.getByText('17 messages')).toBeTruthy()
    // Compute the expectation the same way the component does — locale-proof.
    expect(screen.getByText(new Date(ms).toLocaleDateString())).toBeTruthy()
  })

  it('clicking Read fetches and renders the transcript markdown', async () => {
    mockedUse.mockReturnValue({ data: [cap({ title: 'A chat' })], loading: false })
    mockedRead.mockResolvedValue('Hello **transcript** body')

    render(<IdeaCaptures ideaId="idea-1" />)
    fireEvent.click(screen.getByRole('button', { name: /read/i }))

    expect(mockedRead).toHaveBeenCalledWith('idea-1', 'abc-123')
    expect(await screen.findByText('transcript')).toBeTruthy()
    // Rendered as markdown (bold), not as raw text with asterisks.
    expect((await screen.findByText('transcript')).tagName).toBe('STRONG')
  })

  it('a failed row shows the error string and a clickable original link', () => {
    mockedUse.mockReturnValue({
      data: [cap({ status: 'failed', error: 'fetch failed: 404' })],
      loading: false,
    })
    render(<IdeaCaptures ideaId="idea-1" />)
    expect(screen.getByText('fetch failed: 404')).toBeTruthy()

    const link = screen.getByRole('link', { name: /original/i })
    expect(link.getAttribute('href')).toBe('https://chatgpt.com/share/abc-123')
    // The link must stay clickable — it may not sit inside any (disabled) button.
    expect(link.closest('button')).toBeNull()
  })

  it('a pending row shows Capturing…', () => {
    mockedUse.mockReturnValue({ data: [cap({ status: 'pending' })], loading: false })
    render(<IdeaCaptures ideaId="idea-1" />)
    expect(screen.getByText('Capturing…')).toBeTruthy()
  })

  it('sanitizes raw HTML and javascript: URLs in fetched transcripts (regression)', async () => {
    // Both attack vectors in one transcript so a single render covers both.
    const maliciousTranscript = [
      'Safe surrounding text.',
      '<img src=x onerror="alert(1)">',
      '[click](javascript:alert(1))',
      'More safe text.',
    ].join('\n\n')

    mockedUse.mockReturnValue({ data: [cap({ title: 'Malicious chat' })], loading: false })
    mockedRead.mockResolvedValue(maliciousTranscript)

    const { container } = render(<IdeaCaptures ideaId="idea-1" />)
    fireEvent.click(screen.getByRole('button', { name: /read/i }))
    // Wait for the transcript pane to become visible.
    await screen.findByText('Safe surrounding text.')

    // 1. No <img> must exist — raw HTML must be escaped, not parsed.
    expect(container.querySelector('img')).toBeNull()

    // 2. Any "click" anchor must not carry a javascript: href.
    const clickLink = container.querySelector('a[href]')
    if (clickLink) {
      const href = clickLink.getAttribute('href') ?? ''
      expect(href.toLowerCase().startsWith('javascript:')).toBe(false)
    }

    // 3. Sanity: plain text from the same transcript DID render.
    expect(screen.getByText('More safe text.')).toBeTruthy()
  })
})
