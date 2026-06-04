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
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a note', 'fact', undefined))
})

it('shows the category select in comment mode and passes the chosen category', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CommentComposer {...baseProps} onSubmit={onSubmit} />)
  const select = screen.getByRole('combobox', { name: /category/i })
  expect(select).toBeInTheDocument()
  fireEvent.change(select, { target: { value: 'tone' } })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'voice issue' } })
  fireEvent.click(screen.getByRole('button', { name: /post/i }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('voice issue', 'tone', undefined))
})

it('hides the category select in reply mode and submits no category', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CommentComposer {...baseProps} mode="reply" onSubmit={onSubmit} />)
  expect(screen.queryByRole('combobox', { name: /category/i })).toBeNull()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a reply' } })
  fireEvent.click(screen.getByRole('button', { name: /post/i }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a reply', undefined, undefined))
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

it('hides the publish control + sends undefined published for members (no canPublishDirectly)', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CommentComposer {...baseProps} onSubmit={onSubmit} />)
  expect(screen.queryByRole('combobox', { name: /visibility/i })).toBeNull()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'member note' } })
  fireEvent.click(screen.getByRole('button', { name: /post/i }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('member note', 'fact', undefined))
})

it('shows the publish control only when canPublishDirectly and defaults to published===true', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CommentComposer {...baseProps} canPublishDirectly onSubmit={onSubmit} />)
  expect(screen.getByRole('combobox', { name: /visibility/i })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'mod note' } })
  fireEvent.click(screen.getByRole('button', { name: /post/i }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('mod note', 'fact', true))
})

it('selecting "Send for approval" makes onSubmit receive published===false and shows the helper note', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CommentComposer {...baseProps} canPublishDirectly onSubmit={onSubmit} />)
  // Default "Publish directly" → no approval helper.
  expect(screen.queryByText(/sent for approval/i)).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: /visibility/i }), { target: { value: 'approval' } })
  expect(screen.getByText(/sent for approval/i)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'needs review' } })
  fireEvent.click(screen.getByRole('button', { name: /post/i }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('needs review', 'fact', false))
})

it('shows the approval helper note for members (no publish control)', () => {
  render(<CommentComposer {...baseProps} />)
  expect(screen.getByText(/sent for approval/i)).toBeInTheDocument()
})

it('keeps the body and shows an error when submit rejects', async () => {
  const onSubmit = vi.fn().mockRejectedValue(new Error('nope'))
  render(<CommentComposer {...baseProps} onSubmit={onSubmit} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keep me' } })
  fireEvent.click(screen.getByRole('button', { name: /post/i }))
  await waitFor(() => expect(screen.getByText(/couldn't post|error|failed/i)).toBeInTheDocument())
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('keep me')
})
