import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentComposer } from '@/components/feedback/CommentComposer'

const LANGS = [
  { code: 'en', label: 'English', draftKey: 'a', isOriginal: true },
  { code: 'hi', label: 'हिंदी', draftKey: 'b', isOriginal: false },
]

function setup(props: Partial<React.ComponentProps<typeof CommentComposer>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <CommentComposer
      mode="comment" anchors={[]} onAddAnchor={() => {}} onRemoveAnchor={() => {}}
      onSubmit={onSubmit} onCancel={() => {}} languages={LANGS} activeLang="hi"
      {...props}
    />,
  )
  return { onSubmit }
}

describe('composer language scope', () => {
  test('defaults to this language only', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A note' } })
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }))
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('A note', 'fact', undefined, 'hi'))
  })

  test('choosing all languages submits the all scope', async () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('radio', { name: /all languages/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A note' } })
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }))
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('A note', 'fact', undefined, 'all'))
  })

  test('the control names the language you are reading', () => {
    setup()
    expect(screen.getByRole('radio', { name: /हिंदी only/i })).toBeInTheDocument()
  })

  test('a single-language comic shows no control at all', () => {
    setup({ languages: [LANGS[0]], activeLang: 'en' })
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  test('a reply shows no control — it inherits its root', () => {
    setup({ mode: 'reply' })
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})
