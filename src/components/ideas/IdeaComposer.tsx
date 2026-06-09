'use client'

import { useMemo, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { htmlToMarkdown } from '@/lib/ideaHtmlToMarkdown'
import { newIdeaRef, createIdea } from '@/lib/ideas'
import { canModerate, type AllowStatus } from '@/lib/auth'
import type { R2Image, Visibility } from '@/types/idea'
import { useIdeaImagePaste } from './useIdeaImagePaste'

// ── Pure helper (unit-tested) ──────────────────────────────────────────────────

export function buildCreateInput(args: {
  title: string
  markdown: string
  r2Images: R2Image[]
  visibility: Visibility
  recipientsRaw: string
}) {
  const recipients =
    args.visibility === 'specific'
      ? args.recipientsRaw
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : []
  return {
    title: args.title.trim() || undefined,
    bodyMarkdown: args.markdown,
    r2Images: args.r2Images,
    visibility: args.visibility,
    recipients,
  }
}

// ── Editor factory ──────────────────────────────────────────────────────────────

// Image extended with a data-r2-key attribute so htmlToMarkdown can emit r2:
// tokens for attached (non-inline) images.
const IdeaImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-r2-key': {
        default: null,
        parseHTML: (el) => el.getAttribute('data-r2-key'),
        renderHTML: (attrs) =>
          attrs['data-r2-key'] ? { 'data-r2-key': attrs['data-r2-key'] } : {},
      },
    }
  },
})

export function makeIdeaEditor() {
  return {
    // immediatelyRender:false is required under Next SSR/static export to avoid
    // a hydration mismatch (Tiptap renders nothing on the server otherwise).
    immediatelyRender: false,
    extensions: [
      // StarterKit v3 already bundles the Link extension — configure it here
      // rather than registering a duplicate (which logs a warning).
      StarterKit.configure({ link: { openOnClick: false } }),
      IdeaImage,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '',
  }
}

// ── Visibility options ──────────────────────────────────────────────────────────

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'all_sub_admins', label: 'All sub-admins' },
  { value: 'all_approved', label: 'All approved' },
  { value: 'specific', label: 'Specific people' },
]

// ── Component ────────────────────────────────────────────────────────────────────

export function IdeaComposer({
  role,
  author,
  onPosted,
}: {
  role: AllowStatus
  author: { email: string; name: string }
  onPosted?: () => void
}) {
  // Mint the idea id once, before any image upload, so R2 keys are stable.
  // useState's lazy initializer runs exactly once and is render-safe (unlike
  // reading a ref's .current during render).
  const [ideaId] = useState<string>(() => newIdeaRef().id)

  const [title, setTitle] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [recipientsRaw, setRecipientsRaw] = useState('')
  const [r2Images, setR2Images] = useState<R2Image[]>([])
  const [posting, setPosting] = useState(false)

  const editorConfig = useMemo(() => makeIdeaEditor(), [])
  const editor = useEditor(editorConfig)

  const { onPaste, onDrop } = useIdeaImagePaste({
    editor: editor as Editor | null,
    ideaId,
    onR2Image: (img) => setR2Images((prev) => [...prev, img]),
  })

  // Parent also gates, but guard here so the controls never render for a member.
  if (!canModerate(role)) return null

  const reset = () => {
    setTitle('')
    setVisibility('private')
    setRecipientsRaw('')
    setR2Images([])
    editor?.commands.clearContent()
  }

  const onPost = async () => {
    if (!editor) return
    setPosting(true)
    try {
      const markdown = htmlToMarkdown(editor.getHTML())
      const input = buildCreateInput({ title, markdown, r2Images, visibility, recipientsRaw })
      await createIdea(ideaId, input, author)
      reset()
      onPosted?.()
    } finally {
      setPosting(false)
    }
  }

  return (
    <section className="rounded-xl border border-brand-pale-dusk bg-white/60 p-4">
      <h2 className="mb-3 font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
        Drop an idea
      </h2>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="mb-3 w-full rounded-md border border-brand-pale-dusk bg-white px-3 py-2 text-sm text-brand-umber"
      />

      <div
        onPaste={onPaste}
        onDrop={onDrop}
        onMouseDown={(e) => {
          // Clicking the box's padding/empty area focuses the editor too — the
          // contenteditable doesn't cover the wrapper's padding. Only act when
          // the click isn't already inside the editor, and keep the default so
          // text selection inside the editor still works.
          if (editor && !(e.target as HTMLElement).closest('.ProseMirror')) {
            editor.commands.focus('end')
          }
        }}
        className="idea-editor mb-3 min-h-[8rem] cursor-text rounded-md border border-brand-pale-dusk bg-white px-3 py-2 text-sm text-brand-umber"
      >
        <EditorContent editor={editor} />
      </div>

      <fieldset className="mb-3">
        <legend className="mb-1.5 font-sans text-[0.65rem] uppercase tracking-label text-brand-slate">
          Visibility
        </legend>
        <div className="flex flex-col gap-1.5">
          {VISIBILITY_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-brand-umber">
              <input
                type="radio"
                name="idea-visibility"
                value={opt.value}
                checked={visibility === opt.value}
                onChange={() => setVisibility(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {visibility === 'specific' && (
        <input
          type="text"
          value={recipientsRaw}
          onChange={(e) => setRecipientsRaw(e.target.value)}
          placeholder="Recipient emails, comma-separated"
          className="mb-3 w-full rounded-md border border-brand-pale-dusk bg-white px-3 py-2 text-sm text-brand-umber"
        />
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onPost}
          disabled={posting}
          className="rounded-md bg-brand-indigo px-4 py-2 font-sans text-[0.7rem] uppercase tracking-label text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {posting ? 'Posting…' : 'Post idea'}
        </button>
      </div>
    </section>
  )
}
