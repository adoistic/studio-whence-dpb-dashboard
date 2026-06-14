/**
 * Tests for src/components/FooterWithData.tsx
 *
 * FooterWithData reads `source_sha`/`generated_at` from the Firestore catalog
 * meta (useHeadline) and feeds them to the presentational <Footer>. The
 * Footer slices the sha to 7 chars and guards each line on its prop being
 * present, so a null meta → a footer without the build/date lines.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FooterWithData } from '../FooterWithData'
import { useHeadline } from '@/lib/catalog'

vi.mock('@/lib/catalog', () => ({
  useHeadline: vi.fn(),
}))

const mockUseHeadline = vi.mocked(useHeadline)

describe('FooterWithData', () => {
  beforeEach(() => {
    mockUseHeadline.mockReset()
  })

  test('passes the sha (sliced) and date through to Footer when catalog meta is present', () => {
    mockUseHeadline.mockReturnValue({
      data: {
        source_sha: 'abc1234deadbeef',
        generated_at: '2026-06-01',
        // The rest of CatalogMeta is irrelevant to FooterWithData.
      },
      loading: false,
    } as ReturnType<typeof useHeadline>)

    render(<FooterWithData />)

    // Footer slices the sha to 7 chars and prefixes "build · ".
    expect(screen.getByText('build · abc1234')).toBeInTheDocument()
    expect(screen.getByText('data refreshed · 2026-06-01')).toBeInTheDocument()
  })

  test('renders without the build/date lines when catalog meta is null (mid-load)', () => {
    mockUseHeadline.mockReturnValue({
      data: null,
      loading: true,
    } as ReturnType<typeof useHeadline>)

    render(<FooterWithData />)

    // The footer still renders (the brand lockup tagline is always present)…
    expect(screen.getByText('Stories in becoming.')).toBeInTheDocument()
    // …and the Diamond Books co-brand ("Produced for" the client) is always credited.
    expect(screen.getByAltText('Diamond Books')).toBeInTheDocument()
    expect(screen.getByText(/produced for/i)).toBeInTheDocument()
    // …but no build/date provenance lines.
    expect(screen.queryByText(/^build · /)).not.toBeInTheDocument()
    expect(screen.queryByText(/^data refreshed · /)).not.toBeInTheDocument()
  })
})
