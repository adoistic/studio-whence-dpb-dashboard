/**
 * Tests for src/components/FooterWithData.tsx
 *
 * FooterWithData reads `source_sha`/`generated_at` from the gated content
 * channel (useContent) and feeds them to the presentational <Footer>. The
 * Footer slices the sha to 7 chars and guards each line on its prop being
 * present, so a null content → a footer without the build/date lines.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FooterWithData } from '../FooterWithData'
import { useContent } from '@/lib/content'

vi.mock('@/lib/content', () => ({
  useContent: vi.fn(),
}))

const mockUseContent = vi.mocked(useContent)

describe('FooterWithData', () => {
  beforeEach(() => {
    mockUseContent.mockReset()
  })

  test('passes the sha (sliced) and date through to Footer when content is present', () => {
    mockUseContent.mockReturnValue({
      content: {
        source_sha: 'abc1234deadbeef',
        generated_at: '2026-06-01',
        // The rest of Content is irrelevant to FooterWithData.
      },
      loading: false,
    } as ReturnType<typeof useContent>)

    render(<FooterWithData />)

    // Footer slices the sha to 7 chars and prefixes "build · ".
    expect(screen.getByText('build · abc1234')).toBeInTheDocument()
    expect(screen.getByText('data refreshed · 2026-06-01')).toBeInTheDocument()
  })

  test('renders without the build/date lines when content is null (mid-load)', () => {
    mockUseContent.mockReturnValue({
      content: null,
      loading: true,
    } as ReturnType<typeof useContent>)

    render(<FooterWithData />)

    // The footer still renders (the brand lockup tagline is always present)…
    expect(screen.getByText('Stories in becoming.')).toBeInTheDocument()
    // …but no build/date provenance lines.
    expect(screen.queryByText(/^build · /)).not.toBeInTheDocument()
    expect(screen.queryByText(/^data refreshed · /)).not.toBeInTheDocument()
  })
})
