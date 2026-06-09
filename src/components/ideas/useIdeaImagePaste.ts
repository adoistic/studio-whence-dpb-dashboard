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

      const routed = await routeImage(file, {
        ideaId,
        upload: (f) => uploadIdeaImage(ideaId, f).then(() => {}),
        toDataUri: fileToDataUri,
      })

      if (routed.kind === 'inline') {
        insertImage({ src: routed.dataUri })
        return
      }

      // r2: record the image and insert a node carrying the r2 key + a preview.
      const img: R2Image = {
        token: routed.token,
        key: routed.key,
        filename: routed.filename,
        contentType: routed.contentType,
      }
      onR2Image(img)
      let preview = ''
      try {
        const urls = await resolveUrls([routed.key])
        preview = urls[routed.key] ?? ''
      } catch {
        preview = ''
      }
      insertImage({ src: preview, 'data-r2-key': routed.key })
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
