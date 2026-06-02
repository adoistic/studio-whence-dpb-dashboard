import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResearchReader } from '../ResearchReader'

let mockGated: () => { text: string | null; loading: boolean; error?: Error }
vi.mock('@/lib/useGatedText', () => ({ useGatedText: () => mockGated() }))

beforeEach(() => { mockGated = () => ({ text: null, loading: false }) })

describe('ResearchReader', () => {
  test('with no fileKey, prompts to select a chapter', () => {
    render(<ResearchReader fileKey={null} />)
    expect(screen.getByText(/select a chapter to read/i)).toBeInTheDocument()
  })
  test('renders fetched markdown via react-markdown', () => {
    mockGated = () => ({ text: '# Chapter One\n\nDhirubhai boarded the ship.', loading: false })
    render(<ResearchReader fileKey="research/x.md" />)
    expect(screen.getByRole('heading', { name: /chapter one/i })).toBeInTheDocument()
    expect(screen.getByText(/dhirubhai boarded the ship/i)).toBeInTheDocument()
  })
  test('remaps markdown headings down one level (no second <h1>)', () => {
    mockGated = () => ({ text: '# Big Title', loading: false })
    render(<ResearchReader fileKey="research/x.md" />)
    expect(screen.getByRole('heading', { level: 2, name: /big title/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
  test('loading state', () => {
    mockGated = () => ({ text: null, loading: true })
    render(<ResearchReader fileKey="research/x.md" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
  test('error/404 → graceful note', () => {
    mockGated = () => ({ text: null, loading: false, error: new Error('read failed: 404') })
    render(<ResearchReader fileKey="research/x.md" />)
    expect(screen.getByText(/couldn.t load this file/i)).toBeInTheDocument()
  })
  test('empty but loaded file → "this file is empty", not a load error', () => {
    mockGated = () => ({ text: '', loading: false })
    render(<ResearchReader fileKey="research/x.md" />)
    expect(screen.getByText(/this file is empty/i)).toBeInTheDocument()
    expect(screen.queryByText(/couldn.t load/i)).not.toBeInTheDocument()
  })
})
