import { describe, test, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PanelView } from '../PanelView'
import { parsePanelModel, panelsKeyFor, type PanelModel } from '@/lib/panelModel'

function model(): PanelModel {
  return {
    schema: 1,
    title: 'The Sky-High Dreamer',
    aspect: 1.44,
    grid: { cols: 12, rows: 16 },
    errors: [],
    pages: [
      {
        number: 8,
        ref: 'p8',
        layoutId: '4a',
        panels: [
          {
            number: 1,
            ref: 'p8.pl1',
            rect: [0, 0, 12, 8],
            note: null,
            artRef: 'p8.pl1.art',
            artBrief: 'jrd on the runway, dawn light',
            artSrcCount: 1,
            crowded: false,
            turns: 2,
            narration: [
              { ref: 'p8.pl1.b1', kind: 'caption', text: 'bombay, 1929.', speaker: null, srcCount: 1, turn: null, column: null },
            ],
            sfx: [
              { ref: 'p8.pl1.b2', kind: 'sfx', text: 'vroom', speaker: null, srcCount: 0, turn: null, column: null },
            ],
            columns: [
              {
                name: 'JRD',
                figure: 'man',
                boxes: [
                  { ref: 'p8.pl1.b3', kind: 'dialogue', text: 'i will fly this thing.', speaker: 'JRD', srcCount: 1, turn: 0, column: 0 },
                  { ref: 'p8.pl1.b5', kind: 'dialogue', text: 'watch me.', speaker: 'JRD', srcCount: 0, turn: 2, column: 0 },
                ],
              },
              {
                name: 'NEVILLE',
                figure: 'man',
                boxes: [
                  { ref: 'p8.pl1.b4', kind: 'dialogue', text: 'you are mad.', speaker: 'NEVILLE', srcCount: 0, turn: 1, column: 1 },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('PanelView', () => {
  test('every panel renders with its data-panel-ref', () => {
    render(<PanelView model={model()} />)
    expect(document.querySelector('[data-panel-ref="p8.pl1"]')).toBeInTheDocument()
  })

  test('the page container carries data-page-ref', () => {
    render(<PanelView model={model()} />)
    expect(document.querySelector('[data-page-ref="p8"]')).toBeInTheDocument()
  })

  test('every box (narration, sfx, dialogue, art brief) renders with its data-beat-ref', () => {
    render(<PanelView model={model()} />)
    for (const ref of ['p8.pl1.b1', 'p8.pl1.b2', 'p8.pl1.b3', 'p8.pl1.b4', 'p8.pl1.b5', 'p8.pl1.art']) {
      expect(document.querySelector(`[data-beat-ref="${ref}"]`)).toBeInTheDocument()
    }
  })

  test('box text renders uppercase', () => {
    render(<PanelView model={model()} />)
    expect(screen.getByText('BOMBAY, 1929.')).toBeInTheDocument()
    expect(screen.getByText('VROOM')).toBeInTheDocument()
    expect(screen.getByText('I WILL FLY THIS THING.')).toBeInTheDocument()
    expect(screen.queryByText('bombay, 1929.')).not.toBeInTheDocument()
  })

  test('a dialogue box renders inside the panel alongside the column whose name matches its speaker', () => {
    render(<PanelView model={model()} />)
    const panel = document.querySelector('[data-panel-ref="p8.pl1"]') as HTMLElement
    // JRD's first line and JRD's column label both live under the same panel.
    const jrdLine = within(panel).getByText('I WILL FLY THIS THING.')
    expect(jrdLine).toBeInTheDocument()
    expect(within(panel).getByText('JRD')).toBeInTheDocument()
    // Neville's line is likewise scoped to this panel, under his own column.
    expect(within(panel).getByText('YOU ARE MAD.')).toBeInTheDocument()
    expect(within(panel).getByText('NEVILLE')).toBeInTheDocument()
  })

  test("a speaker's last balloon carries the down-tail, earlier ones do not", () => {
    render(<PanelView model={model()} />)
    const firstLine = screen.getByText('I WILL FLY THIS THING.')
    const lastLine = screen.getByText('WATCH ME.')
    const firstCell = firstLine.closest('.pv-dialogue-cell') as HTMLElement
    const lastCell = lastLine.closest('.pv-dialogue-cell') as HTMLElement
    expect(firstCell.querySelector('.pv-balloon-tail')).not.toBeInTheDocument()
    expect(lastCell.querySelector('.pv-balloon-tail')).toBeInTheDocument()
  })

  test('renders script errors when present', () => {
    const m = model()
    m.errors = ['page 12: target_length_pages mismatch']
    render(<PanelView model={m} />)
    expect(screen.getByText(/target_length_pages mismatch/i)).toBeInTheDocument()
  })
})

describe('parsePanelModel', () => {
  test('returns null for non-JSON text', () => {
    expect(parsePanelModel('not json')).toBeNull()
  })

  test('returns null for a null input', () => {
    expect(parsePanelModel(null)).toBeNull()
  })

  test('returns null for a schema other than 1', () => {
    const stale = JSON.stringify({ ...model(), schema: 2 })
    expect(parsePanelModel(stale)).toBeNull()
  })

  test('parses a valid v1 model', () => {
    const text = JSON.stringify(model())
    const parsed = parsePanelModel(text)
    expect(parsed).not.toBeNull()
    expect(parsed?.pages[0].panels[0].ref).toBe('p8.pl1')
  })
})

describe('panelsKeyFor', () => {
  test('builds the exact R2 key', () => {
    expect(panelsKeyFor('biographies', '01-the-sky-high-dreamer')).toBe(
      'panels/biographies/01-the-sky-high-dreamer.json',
    )
  })
})
