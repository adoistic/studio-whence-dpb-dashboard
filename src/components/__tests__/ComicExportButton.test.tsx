import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ComicExportButton } from '@/components/ComicExportButton'
import type { Comic } from '@/types/content'

const comic = {
  title: 'Test Comic', line: 'biographies', slug: 'test-comic', status: 'approved', subject_slug: null,
  pages: { hasPages: true, count: 2, coverKey: 'images/comics/biographies/test-comic/cover.jpg' },
} as unknown as Comic
const noPages = { ...comic, pages: undefined } as unknown as Comic

describe('ComicExportButton', () => {
  it('renders nothing when the comic has no published pages', () => {
    const { container } = render(<ComicExportButton comic={noPages} threads={[]} draftHtml={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('opens the dialog with three formats and the resolved toggle off', () => {
    render(<ComicExportButton comic={comic} threads={[]} draftHtml={'<div/>'} />)
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    expect(screen.getByLabelText(/LLM-ready ZIP/i)).toBeChecked()
    expect(screen.getByLabelText(/Author Word/i)).not.toBeChecked()
    expect(screen.getByLabelText(/Side-by-side Word/i)).not.toBeChecked()
    expect(screen.getByLabelText(/resolved/i)).not.toBeChecked()
  })

  it('hides the Script checkbox for script-less comics', () => {
    render(<ComicExportButton comic={comic} threads={[]} draftHtml={null} />)
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    expect(screen.queryByLabelText(/^Script$/)).toBeNull()
    expect(screen.getByLabelText(/^Comments$/)).toBeChecked()
  })

  it('disables Generate when both Comments and Script are unchecked', () => {
    render(<ComicExportButton comic={comic} threads={[]} draftHtml={'<div/>'} />)
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    fireEvent.click(screen.getByLabelText(/^Comments$/))
    fireEvent.click(screen.getByLabelText(/^Script$/))
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })
})
