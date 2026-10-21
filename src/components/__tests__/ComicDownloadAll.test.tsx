/**
 * ComicDownloadAll — the "Download all" button on a comic's page.
 *
 * Pinned: closed until asked; open, it lists what the book has with sizes, every row
 * ticked; unticking a row takes it out of the total and out of the zip; the download
 * starts from the click with exactly the ticked groups; progress shows while it runs and
 * Cancel stops it; the official cover is looked up once the panel is open.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ZipProgress, ZipResult } from '@/lib/downloads'
import type { BundleGroupId } from '@/lib/downloadAll'

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, googleProvider: {} }))
vi.mock('@/lib/dataApi', () => ({ resolveUrls: async () => ({}), readMarkdown: async () => '' }))
const fetchCoverChoice = vi.fn<(id: string) => Promise<null>>(async () => null)
vi.mock('@/lib/coverChoice', () => ({
  coverChoiceDocId: (comicId: string, lang?: string, original = 'en') => (!lang || lang === original ? comicId : `${comicId}__${lang}`),
  fetchCoverChoice: (id: string) => fetchCoverChoice(id),
}))

type RunArgs = { selected: Set<BundleGroupId>; onProgress?: (p: ZipProgress) => void; signal?: AbortSignal }
let finish: (r: ZipResult) => void = () => {}
const runDownloadAll = vi.fn((args: RunArgs) => {
  void args
  return new Promise<ZipResult>((resolve) => { finish = resolve })
})
vi.mock('@/lib/downloadAllRun', () => ({ runDownloadAll: (a: RunArgs) => runDownloadAll(a) }))

import { COVER_CHOICE_WAIT_MS, ComicDownloadAll } from '@/components/ComicDownloadAll'
import { cast, figure, fullComic, threads } from '@/lib/__tests__/downloadAll.fixture'

function renderIt() {
  return render(
    <ComicDownloadAll comic={fullComic()} figure={figure()} cast={cast()} threads={threads} />,
  )
}

async function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: /download all/i }))
  await waitFor(() => expect(screen.getByRole('region', { name: /download all files/i })).toBeInTheDocument())
  await waitFor(() => expect(screen.queryByText(/checking what this book has/i)).not.toBeInTheDocument())
  return screen.getByRole('region', { name: /download all files/i })
}

beforeEach(() => {
  runDownloadAll.mockClear()
  fetchCoverChoice.mockClear()
})

describe('ComicDownloadAll', () => {
  test('is a single button until it is opened', () => {
    renderIt()
    expect(screen.getByRole('button', { name: /download all/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(fetchCoverChoice).not.toHaveBeenCalled()
  })

  test('opened, it lists every kind of file the book has, ticked, with sizes and a total', async () => {
    renderIt()
    const panel = await openPanel()
    expect(fetchCoverChoice).toHaveBeenCalledWith('alpha__01-the-long-road')
    expect(fetchCoverChoice).toHaveBeenCalledWith('alpha__01-the-long-road__hi')
    const boxes = within(panel).getAllByRole('checkbox')
    expect(boxes.length).toBe(12)
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true)
    expect(within(panel).getByText('InDesign')).toBeInTheDocument()
    expect(within(panel).getByText('Research')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /download everything · ≈ \d/i })).toBeEnabled()
  })

  test('unticking a row takes it out of the total, and the download carries exactly the ticked rows', async () => {
    renderIt()
    const panel = await openPanel()
    const before = within(panel).getByRole('button', { name: /download everything/i }).textContent
    fireEvent.click(within(panel).getByRole('checkbox', { name: /InDesign at 6\.25/ }))
    const btn = within(panel).getByRole('button', { name: /download the ticked files/i })
    expect(btn.textContent).not.toBe(before)
    fireEvent.click(btn)
    expect(runDownloadAll).toHaveBeenCalledTimes(1)
    const selected = runDownloadAll.mock.calls[0][0].selected
    expect(selected.has('indesignTrim')).toBe(false)
    expect(selected.has('indesign')).toBe(true)
    expect(selected.size).toBe(11)
  })

  test('a cover lookup that never answers does not hold the download up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      fetchCoverChoice.mockImplementation(() => new Promise<null>(() => {}))
      renderIt()
      fireEvent.click(screen.getByRole('button', { name: /download all/i }))
      expect(await screen.findByText(/checking what this book has/i)).toBeInTheDocument()
      await act(async () => { vi.advanceTimersByTime(COVER_CHOICE_WAIT_MS + 100) })
      await waitFor(() => expect(screen.queryByText(/checking what this book has/i)).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: /download everything/i })).toBeEnabled()
    } finally {
      fetchCoverChoice.mockImplementation(async () => null)
      vi.useRealTimers()
    }
  })

  test('shows progress while it runs, Cancel aborts, and the result is reported', async () => {
    renderIt()
    const panel = await openPanel()
    fireEvent.click(within(panel).getByRole('button', { name: /download everything/i }))
    const { onProgress, signal } = runDownloadAll.mock.calls[0][0]
    act(() => onProgress?.({ done: 3, total: 10, bytesDone: 50_000_000, bytesTotal: 100_000_000, current: 'Root/01 Comic/Page images/Page 03.jpg' }))
    expect(within(panel).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(within(panel).getByText('Now: Page 03.jpg')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: /cancel/i }))
    expect(signal?.aborted).toBe(true)
    await act(async () => finish({ failed: ['Root/x.jpg'], cancelled: false, streamedToDisk: true, written: {} }))
    expect(within(panel).getByText(/1 file could not be fetched/)).toBeInTheDocument()
  })
})
