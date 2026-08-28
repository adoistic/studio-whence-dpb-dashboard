import { describe, test, expect, afterEach } from 'vitest'
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
    // "JRD" itself now appears twice (once per balloon, once in the figure
    // row) by design -- assert presence, not a single match.
    const jrdLine = within(panel).getByText('I WILL FLY THIS THING.')
    expect(jrdLine).toBeInTheDocument()
    expect(within(panel).getAllByText('JRD').length).toBeGreaterThan(0)
    // Neville's line is likewise scoped to this panel, under his own column.
    expect(within(panel).getByText('YOU ARE MAD.')).toBeInTheDocument()
    expect(within(panel).getAllByText('NEVILLE').length).toBeGreaterThan(0)
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

// The canonical interleaved-turn case: MAYE speaks, ELON replies, MAYE speaks
// again. This is the shape a per-speaker "stack all of MAYE's lines together"
// regression would get wrong: it would place her second line right after her
// first (same or adjacent row, ignoring ELON's turn in between) instead of
// after ELON's, in actual script order.
function canonicalDialoguePanel(rect: [number, number, number, number] = [0, 0, 12, 8]) {
  return {
    number: 1,
    ref: 'p1.pl1',
    rect,
    note: null,
    artRef: 'p1.pl1.art',
    artBrief: '',
    artSrcCount: 0,
    crowded: false,
    turns: 3,
    narration: [],
    sfx: [],
    columns: [
      {
        name: 'MAYE',
        figure: 'woman',
        boxes: [
          { ref: 'p1.pl1.b1', kind: 'dialogue' as const, text: 'you can do this.', speaker: 'MAYE', srcCount: 0, turn: 0, column: 0 },
          { ref: 'p1.pl1.b3', kind: 'dialogue' as const, text: 'i knew it.', speaker: 'MAYE', srcCount: 0, turn: 2, column: 0 },
        ],
      },
      {
        name: 'ELON',
        figure: 'boy',
        boxes: [
          { ref: 'p1.pl1.b2', kind: 'dialogue' as const, text: 'i will try.', speaker: 'ELON', srcCount: 0, turn: 1, column: 1 },
        ],
      },
    ],
  }
}

function dialogueModel(rect: [number, number, number, number] = [0, 0, 12, 8]): PanelModel {
  return {
    schema: 1,
    title: 'Canonical cascade fixture',
    aspect: 1.44,
    grid: { cols: 12, rows: 16 },
    errors: [],
    pages: [{ number: 1, ref: 'p1', layoutId: '1a', panels: [canonicalDialoguePanel(rect)] }],
  }
}

describe('PanelView — dialogue cascade grid placement (regression guard)', () => {
  // These tests read the actual inline `style.gridColumn` / `style.gridRow`
  // off the rendered cells. A prior test asserting only "the last balloon has
  // a tail" cannot distinguish the correct interleaved cascade from a
  // regression back to per-speaker stacking — both would still put a tail on
  // MAYE's second line. These assertions can only pass if turn 0/1/2 land on
  // three DISTINCT rows in script order.
  test("Maye's first line sits at column 1, row 1", () => {
    render(<PanelView model={dialogueModel()} />)
    const cell = screen.getByText('YOU CAN DO THIS.').closest('.pv-dialogue-cell') as HTMLElement
    expect(cell.style.gridColumn).toBe('1')
    expect(cell.style.gridRow).toBe('1')
  })

  test("Elon's reply sits at column 2, row 2", () => {
    render(<PanelView model={dialogueModel()} />)
    const cell = screen.getByText('I WILL TRY.').closest('.pv-dialogue-cell') as HTMLElement
    expect(cell.style.gridColumn).toBe('2')
    expect(cell.style.gridRow).toBe('2')
  })

  test("Maye's second line sits at column 1, row 3 — NOT row 2 stacked under her first line", () => {
    render(<PanelView model={dialogueModel()} />)
    const cell = screen.getByText('I KNEW IT.').closest('.pv-dialogue-cell') as HTMLElement
    expect(cell.style.gridColumn).toBe('1')
    // The failing case for a per-speaker-stack regression: it would land this
    // at row 2 (right after Maye's own first line) instead of row 3 (after
    // Elon's intervening turn, in true script order).
    expect(cell.style.gridRow).toBe('3')
    expect(cell.style.gridRow).not.toBe('2')
  })

  test('the figure/speaker-name row sits strictly below every balloon row (turns + 1)', () => {
    render(<PanelView model={dialogueModel()} />)
    // Each speaker's name now appears twice by design: once on every one of
    // their balloons (.pv-balloon-speaker, so attribution never depends on
    // scrolling to the bottom row) and once in the shared figure row
    // (.pv-figure-cell .pv-speaker-name). Scope to the figure-row instance.
    const mayeFigureCell = screen.getAllByText('MAYE')
      .map((el) => el.closest('.pv-figure-cell'))
      .find((el): el is HTMLElement => el !== null) as HTMLElement
    const elonFigureCell = screen.getAllByText('ELON')
      .map((el) => el.closest('.pv-figure-cell'))
      .find((el): el is HTMLElement => el !== null) as HTMLElement
    // turns is 3, so the figure row is row 4 — one past the highest balloon row (3).
    expect(mayeFigureCell.style.gridRow).toBe('4')
    expect(mayeFigureCell.style.gridColumn).toBe('1')
    expect(elonFigureCell.style.gridRow).toBe('4')
    expect(elonFigureCell.style.gridColumn).toBe('2')
  })

  test('the panel element itself converts a non-trivial zero-based rect to one-based grid placement', () => {
    // rect = [col:6, row:4, w:6, h:5] → CSS grid lines are 1-based, so this
    // must render as column-start 7 spanning 6, row-start 5 spanning 5.
    render(<PanelView model={dialogueModel([6, 4, 6, 5])} />)
    const panelEl = document.querySelector('[data-panel-ref="p1.pl1"]') as HTMLElement
    expect(panelEl.style.gridColumn).toBe('7 / span 6')
    expect(panelEl.style.gridRow).toBe('5 / span 5')
  })
})

// ---------------------------------------------------------------------------
// Task 3 (spec §3.3): the page box is fixed, so a panel never grows past its
// grid row and never scrolls — an over-full box clips, and a small
// "OVERFLOWS" corner tag reveals when that happened. Before this fix,
// `.pv-panel` used `overflow: visible; align-self: start; height: auto;
// min-height: 100%` to let a panel grow instead of clip — but the grid ROW it
// sat in never grew to match, so the grown panel simply painted over the
// panel below it on the page (the overlap bug). There was also no overflow
// tag of any kind. jsdom does no real layout, so scrollHeight/clientHeight
// are mocked directly on HTMLElement.prototype to exercise both branches.
// ---------------------------------------------------------------------------

describe('PanelView — overflow marker (Task 3 regression guard)', () => {
  afterEach(() => {
    // Only remove the override THIS suite adds; leave jsdom's own
    // (unrelated) definitions on Element.prototype alone.
    if (Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'scrollHeight')) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
    }
    if (Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'clientHeight')) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
    }
  })

  function mockOverflow(scrollHeight: number, clientHeight: number) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      value: scrollHeight,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: clientHeight,
    })
  }

  test('a panel whose measured content exceeds its box shows the OVERFLOWS tag', () => {
    mockOverflow(500, 100)
    render(<PanelView model={model()} />)
    expect(screen.getByText('OVERFLOWS')).toBeInTheDocument()
  })

  test('a panel whose measured content fits its box shows no OVERFLOWS tag', () => {
    mockOverflow(100, 100)
    render(<PanelView model={model()} />)
    expect(screen.queryByText('OVERFLOWS')).not.toBeInTheDocument()
  })

  test('the panel clips instead of growing past its grid row (no overlap)', () => {
    // The regression this replaces: `overflow: visible` + `height: auto` let
    // a panel grow past the grid row it was placed in, with nothing
    // reserving that extra space — so it painted over the panel below.
    render(<PanelView model={model()} />)
    const styleText = document.querySelector('style')?.textContent ?? ''
    const panelRule = styleText.split('.pv-panel {')[1]?.split('}')[0] ?? ''
    expect(panelRule).toContain('overflow: hidden')
    expect(panelRule).not.toContain('overflow: visible')
    expect(panelRule).not.toContain('height: auto')
  })
})

describe('PanelView — every balloon carries its own speaker label (Adnan, 2026-08-28)', () => {
  // A comic reader complained: with the speaker's name shown only once, in
  // the shared figure row at the very bottom of the cascade, "who is
  // speaking when" was not clear -- especially once a panel's content is
  // tall enough that the figure row scrolls out of view or gets clipped.
  // Every balloon now carries its own speaker label directly, so attribution
  // never depends on tracing back to a row that may not even be visible.
  test('each dialogue balloon shows its own speaker name, not just the bottom row', () => {
    render(<PanelView model={dialogueModel()} />)
    // canonicalDialoguePanel is MAYE(turn0) / ELON(turn1) / MAYE(turn2) -- three
    // balloons, three labels. DOM order is grouped by COLUMN (Maye's two boxes,
    // then Elon's), not by turn -- grid-row is what fixes visual/reading order,
    // independent of source order -- so this reads the label paired with each
    // balloon's OWN gridRow rather than assuming DOM order is turn order.
    const cells = Array.from(document.querySelectorAll<HTMLElement>('.pv-dialogue-cell'))
    expect(cells.length).toBe(3)
    const byTurn = new Map(
      cells.map((cell) => [
        Number(cell.style.gridRow),
        cell.querySelector('.pv-balloon-speaker')?.textContent,
      ]),
    )
    expect(byTurn.get(1)).toBe('MAYE')
    expect(byTurn.get(2)).toBe('ELON')
    expect(byTurn.get(3)).toBe('MAYE')
  })

  test("a balloon's own label sits inside that balloon, not the shared figure row", () => {
    render(<PanelView model={dialogueModel()} />)
    const balloon = document.querySelector('.pv-box-dialogue') as HTMLElement
    const label = within(balloon).getByText('MAYE')
    expect(label.className).toContain('pv-balloon-speaker')
    // The figure row's OWN copy of the name lives in a different box entirely.
    expect(balloon.closest('.pv-figure-cell')).toBeNull()
  })
})

describe('PanelView — page height is content-driven, not clipped to a fixed aspect ratio', () => {
  // A comic script has 6+ panels of wildly different dialogue density sharing
  // one page. A page locked to a fixed aspect ratio (width alone determining
  // height) forces every panel's row track back to a fraction of that fixed
  // height regardless of content -- which is what produced the illegible
  // 6-7px fonts and near-universal OVERFLOWS tags this suite guards against.
  test('the page grid has no fixed aspect-ratio and its rows are not a bare 1fr split', () => {
    render(<PanelView model={model()} />)
    const page = document.querySelector('.pv-comic-page') as HTMLElement
    expect(page.style.aspectRatio).toBe('')
    const styleText = document.querySelector('style')?.textContent ?? ''
    const pageRule = styleText.split('.pv-comic-page {')[1]?.split('}')[0] ?? ''
    expect(pageRule).not.toMatch(/grid-template-rows:\s*repeat\(16,\s*1fr\)/)
    expect(pageRule).toMatch(/grid-template-rows:\s*repeat\(16,\s*minmax\(/)
  })

  test('the aspect value is still carried on the page element (not simply dropped)', () => {
    render(<PanelView model={model()} />)
    const page = document.querySelector('.pv-comic-page') as HTMLElement
    expect(page.getAttribute('data-aspect')).toBe('1.44')
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
