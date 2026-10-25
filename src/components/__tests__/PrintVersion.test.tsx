import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Comic } from '@/types/content'

const resolveUrls = vi.fn()
vi.mock('@/lib/dataApi', () => ({ resolveUrls: (keys: string[]) => resolveUrls(keys) }))

import { PrintVersion } from '@/components/PrintVersion'

const prefix = 'artifacts/comics/alpha/sample/print-version'
const comic: Comic = {
  title: 'Sample Hero — The Long Road',
  line: 'alpha',
  status: 'published',
  slug: 'sample',
  subject_slug: null,
  printVersion: {
    label: 'Print version',
    summary: 'A sample summary.',
    press: 'Sample press on sample paper',
    pages: 182,
    files: { pdf: { key: `${prefix}/print.pdf`, bytes: 52_000_000, filename: 'sample-print.pdf' } },
    testPack: { key: `${prefix}/test.pdf`, bytes: 9_000_000, filename: 'sample-test.pdf', pages: [43, 139] },
    compare: {
      viewPrefix: prefix,
      versions: [
        { id: 'as-sent', label: 'As sent' },
        { id: 'print', label: 'Print version' },
      ],
      views: [
        { id: 'file', label: 'Our file', note: 'The page exactly as we send it.' },
        { id: 'press-estimate', label: 'Expected on the paper', note: 'Estimate.' },
      ],
      quickPages: [
        { page: 43, why: 'a dark figure on a dark ground' },
        { page: 139, why: 'a king lying on a dark floor' },
      ],
    },
  },
}

beforeEach(() => {
  resolveUrls.mockReset()
  resolveUrls.mockImplementation(async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, `https://r2/${k}`])))
})

describe('PrintVersion', () => {
  test('renders nothing without a printVersion block', () => {
    const { container } = render(<PrintVersion comic={{ ...comic, printVersion: undefined }} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the downloads and the two sides of the compare', async () => {
    render(<PrintVersion comic={comic} />)
    expect(screen.getByRole('button', { name: /Download print PDF/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test sheet/ })).toBeInTheDocument()
    expect(await screen.findByAltText(/Page 43, As sent, Expected on the paper/)).toHaveAttribute(
      'src',
      `https://r2/${prefix}/as-sent/press-estimate/page-043.jpg`,
    )
    expect(await screen.findByAltText(/Page 43, Print version/)).toBeInTheDocument()
  })

  test('switching page and view changes the keys asked for', async () => {
    render(<PrintVersion comic={comic} />)
    fireEvent.click(screen.getByRole('button', { name: 'p. 139' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Our file' }))
    expect(await screen.findByAltText(/Page 139, Print version, Our file/)).toHaveAttribute(
      'src',
      `https://r2/${prefix}/print/file/page-139.jpg`,
    )
  })
})
