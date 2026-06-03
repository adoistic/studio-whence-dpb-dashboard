import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommentComposer } from '@/components/feedback/CommentComposer'

const baseProps = {
  mode: 'comment' as const, anchors: [], onAddAnchor: () => {}, onRemoveAnchor: () => {},
  onSubmit: vi.fn().mockResolvedValue(undefined), onCancel: () => {},
}

it('disables Post when empty, enables when text entered, submits the body', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CommentComposer {...baseProps} onSubmit={onSubmit} />)
  const post = screen.getByRole('button', { name: /post/i })
  expect(post).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a note' } })
  expect(post).toBeEnabled()
  fireEvent.click(post)
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a note'))
})

it('renders removable anchor chips and the add-location button in comment mode', () => {
  const onRemoveAnchor = vi.fn()
  render(<CommentComposer {...baseProps}
    anchors={[{ beatRef: 'p13.pl1.b1', page: 13, panel: 1, snapshot: 'x' }]}
    onRemoveAnchor={onRemoveAnchor} />)
  expect(screen.getByText(/P13/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /remove anchor/i }))
  expect(onRemoveAnchor).toHaveBeenCalledWith('p13.pl1.b1')
  expect(screen.getByRole('button', { name: /add another location/i })).toBeInTheDocument()
})

it('hides add-location in reply mode', () => {
  render(<CommentComposer {...baseProps} mode="reply" />)
  expect(screen.queryByRole('button', { name: /add another location/i })).toBeNull()
})

it('keeps the body and shows an error when submit rejects', async () => {
  const onSubmit = vi.fn().mockRejectedValue(new Error('nope'))
  render(<CommentComposer {...baseProps} onSubmit={onSubmit} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keep me' } })
  fireEvent.click(screen.getByRole('button', { name: /post/i }))
  await waitFor(() => expect(screen.getByText(/couldn't post|error|failed/i)).toBeInTheDocument())
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('keep me')
})
