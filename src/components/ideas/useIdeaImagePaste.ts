'use client'

import { useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { routeImage, fileToDataUri } from '@/lib/ideaImages'
import { uploadIdeaImage, resolveUrls } from '@/lib/dataApi'
import type { R2Image } from '@/types/idea'

/**
 * Image paste/drop handling for the idea composer. Extracted so the composer
 * stays readable: for every actual image File in a paste/drop event, route it
 * (inline data-uri for small files; R2 upload for large ones) and insert the
 * matching image node into the Tiptap editor. Non-image pastes are ignored.
 */
export function useIdeaImagePaste(args: {
  editor: Editor | null
  ideaId: string
  onR2Image: (img: R2Image) => void
}) {
  const { editor, ideaId, onR2Image } = args

  const insertImage = useCallback(
    (attrs: { src: string; 'data-r2-key'?: string | null }) => {
      if (!editor) return
      editor.chain().focus().setImage(attrs as { src: string }).run()
    },
    [editor],
  )

  const handleFile = useCallback(
    async (file: File) => {
      // CROSS-CHUNK GUARD: only actual image files; the /upload-url route
      // rejects a non-image contentType.
      if (!file.type.startsWith('image/')) return

      // The server re-derives the stored object key in /upload-url and returns
      // it from uploadIdeaImage. That server key — not routeImage's local
      // derivation — is the single source of truth for the R2 reference, so the
      // recorded data-r2-key / r2:token can never drift from where the bytes
      // actually live. We capture it here as the upload runs.
      let serverKey: string | null = null
      const routed = await routeImage(file, {
        ideaId,
        upload: async (f) => {
          serverKey = await uploadIdeaImage(ideaId, f)
        },
        toDataUri: fileToDataUri,
      })

      if (routed.kind === 'inline') {
        insertImage({ src: routed.dataUri })
        return
      }

      // r2: use the server-authoritative key (fall back to routeImage's local
      // key only if the upload somehow returned nothing).
      const key = serverKey ?? routed.key
      const img: R2Image = {
        token: `r2:${key}`,
        key,
        filename: routed.filename,
        contentType: routed.contentType,
      }
      onR2Image(img)
      let preview = ''
      try {
        const urls = await resolveUrls([key])
        preview = urls[key] ?? ''
      } catch {
        preview = ''
      }
      insertImage({ src: preview, 'data-r2-key': key })
    },
    [ideaId, insertImage, onR2Image],
  )

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) await handleFile(file)
      }
    },
    [handleFile],
  )

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) return
      e.preventDefault()
      void handleFiles(files)
    },
    [handleFiles],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) return
      e.preventDefault()
      void handleFiles(files)
    },
    [handleFiles],
  )

  return { onPaste, onDrop, handleFiles }
}
