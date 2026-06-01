import { render, screen, fireEvent } from '@testing-library/react'
import { CsvDownloadButton } from '../CsvDownloadButton'
import type { Column } from '../DataTable'

type Row = { name: string; value: string }

const cols: Column<Row>[] = [
  { key: 'name', header: 'Name', get: r => r.name },
  { key: 'value', header: 'Value', get: r => r.value },
]

const rows: Row[] = [
  { name: 'Alice', value: 'foo' },
  { name: 'Bob', value: 'bar' },
]

// Set up URL mocks before each test (URL methods are client-only and not in jsdom by default)
beforeEach(() => {
  global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
  global.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CsvDownloadButton', () => {
  test('renders a button labeled "↓ Download CSV"', () => {
    render(<CsvDownloadButton rows={rows} columns={cols} filename="test.csv" />)
    expect(screen.getByRole('button', { name: /Download CSV/i })).toBeVisible()
  })

  test('clicking the button calls URL.createObjectURL', () => {
    render(<CsvDownloadButton rows={rows} columns={cols} filename="test.csv" />)
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/i }))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  test('clicking the button calls URL.revokeObjectURL to clean up', () => {
    render(<CsvDownloadButton rows={rows} columns={cols} filename="test.csv" />)
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/i }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  test('createObjectURL receives a Blob with text/csv type', () => {
    render(<CsvDownloadButton rows={rows} columns={cols} filename="test.csv" />)
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/i }))
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/csv')
  })

  test('the anchor element is created with the correct download filename', () => {
    const createdElements: HTMLAnchorElement[] = []
    const origCreate = document.createElement.bind(document)

    // Spy on createElement to intercept anchor creation
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        // Intercept .click() on the anchor so it doesn't navigate
        const orig = el.click.bind(el)
        ;(el as HTMLAnchorElement).click = vi.fn()
        void orig
        createdElements.push(el as HTMLAnchorElement)
      }
      return el
    })

    render(<CsvDownloadButton rows={rows} columns={cols} filename="my-output.csv" />)
    // Restore createElement BEFORE clicking so render's own createElement isn't captured
    createSpy.mockRestore()

    // Now re-spy only for the click handler path
    const createSpy2 = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        ;(el as HTMLAnchorElement).click = vi.fn()
        createdElements.push(el as HTMLAnchorElement)
      }
      return el
    })

    fireEvent.click(screen.getByRole('button', { name: /Download CSV/i }))
    createSpy2.mockRestore()

    expect(createdElements.length).toBeGreaterThan(0)
    expect(createdElements[0].download).toBe('my-output.csv')
  })
})
