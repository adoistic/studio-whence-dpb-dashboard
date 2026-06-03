'use client'

import { useState } from 'react'
import type { Anchor } from '@/lib/feedbackTypes'
import { anchorLabel } from '@/lib/feedbackTypes'
import { PinIcon } from '@/components/feedback/icons'

export interface CommentComposerProps {
  mode: 'comment' | 'reply'
  anchors: Anchor[]
  onAddAnchor: () => void
  onRemoveAnchor: (ref: string) => void
  onSubmit: (body: string) => Promise<void>
  onCancel: () => void
  busy?: boolean
  /** Hide the "+ add another location" button (select-mode picks units in the
      script, not from the composer). */
  hideAddAnchor?: boolean
}

export function CommentComposer({
  mode,
  anchors,
  onAddAnchor,
  onRemoveAnchor,
  onSubmit,
  onCancel,
  busy = false,
  hideAddAnchor = false,
}: CommentComposerProps) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = body.trim()
  const isDisabled = !trimmed || submitting || busy

  async function handlePost() {
    if (isDisabled) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      setBody('')
    } catch {
      setError("Couldn't post. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[2px] border border-brand-pale-dusk bg-brand-threshold p-3 shadow-sm">
      {/* Anchor chips */}
      {anchors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {anchors.map((anchor) => (
            <span
              key={anchor.ref}
              className="inline-flex items-center gap-1 rounded-full border border-brand-lavender/30 bg-brand-pale-dusk px-2 py-0.5 font-sans text-[0.65rem] text-brand-indigo"
            >
              <PinIcon className="h-3 w-3" />
              <span>{anchorLabel(anchor)}</span>
              <button
                type="button"
                aria-label="remove anchor"
                onClick={() => onRemoveAnchor(anchor.ref)}
                className="ml-0.5 rounded-full p-0.5 leading-none text-brand-lavender transition-colors hover:bg-brand-lavender/20 hover:text-brand-indigo"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Textarea */}
      <label className="sr-only" htmlFor="comment-composer-body">
        {mode === 'reply' ? 'Reply…' : 'Add a comment…'}
      </label>
      <textarea
        id="comment-composer-body"
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          if (error) setError(null)
        }}
        placeholder={mode === 'reply' ? 'Reply…' : 'Add a comment…'}
        rows={3}
        className="w-full resize-none rounded-[2px] border border-brand-pale-dusk bg-white px-2.5 py-2 font-sans text-sm text-brand-deep placeholder:text-brand-slate/60 focus:border-brand-lavender focus:outline-none focus:ring-1 focus:ring-brand-lavender/40"
      />

      {/* Inline error */}
      {error && (
        <p className="font-sans text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Actions row */}
      <div className="flex items-center justify-between gap-2">
        {/* Add-location — comment mode only (hidden in select-mode) */}
        {mode === 'comment' && !hideAddAnchor && (
          <button
            type="button"
            aria-label="add another location"
            onClick={onAddAnchor}
            className="inline-flex items-center gap-1 rounded-[2px] px-2 py-1 font-sans text-[0.7rem] text-brand-lavender transition-colors hover:bg-brand-pale-dusk hover:text-brand-indigo"
          >
            <span aria-hidden>+</span> add another location
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[2px] px-3 py-1 font-sans text-xs text-brand-slate transition-colors hover:bg-brand-pale-dusk hover:text-brand-deep"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePost}
            disabled={isDisabled}
            className="rounded-[2px] bg-brand-indigo px-3 py-1 font-sans text-xs text-brand-pale-dusk transition-colors hover:bg-brand-twilight-mid disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
