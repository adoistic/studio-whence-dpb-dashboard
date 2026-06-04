import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommentComposer } from '@/components/feedback/CommentComposer'

const baseProps = {
  mode: 'comment' as const, anchors: [], onAddAnchor: () => {}, onRemoveAnchor: () => {},
  onSubmit: vi.fn().mockResolvedValue(undefined), onCancel: () => {},
}

it('disables Post when empty, enables when text entered, submits the body + default category', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CommentComposer {...baseProps} onSubmit={onSubmit} />)
  const post = screen.getByRole('button', { name: /post/i })
  expect(post).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a note' } })
  expect(post).toBeEnabled()
  fireEvent.click(post)
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a note', 'fact'))
})

it('shows the category select in comment mode and passes the chosen category', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CommentComposer {...baseProps} onSubmit={onSubmit} />)
  const select = screen.getByRole('combobox', { name: /category/i })
  expect(select).toBeInTheDocument()
  fireEvent.change(select, { target: { value: 'tone' } })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'voice issue' } })
  fireEvent.click(screen.getByRole('button', { name: /post/i }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('voice issue', 'tone'))
})

it('hides the category select in reply mode and submits no category', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CommentComposer {...baseProps} mode="reply" onSubmit={onSubmit} />)
  expect(screen.queryByRole('combobox', { name: /category/i })).toBeNull()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a reply' } })
  fireEvent.click(screen.getByRole('button', { name: /post/i }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a reply', undefined))
})

it('renders removable anchor chips and the add-location button in comment mode', () => {
  const onRemoveAnchor = vi.fn()
  render(<CommentComposer {...baseProps}
    anchors={[{ kind: 'beat', ref: 'p13.pl1.b1', page: 13, panel: 1, snapshot: 'x' }]}
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
