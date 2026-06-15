'use client'

import { useState } from 'react'
import { resolveUrls } from '@/lib/dataApi'

interface EditablePptButtonProps {
  editablePpt: { key: string; bytes: number; filename: string }
}

/** Download the gated editable .pptx: presign the artifacts key via /resolve,
 * then trigger a browser download. Gated identically to the comic's pages. */
export function EditablePptButton({ editablePpt }: EditablePptButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function handleClick() {
    setBusy(true)
    setError(false)
    try {
      const urls = await resolveUrls([editablePpt.key])
      const url = urls[editablePpt.key]
      if (!url) throw new Error('no url')
      const a = document.createElement('a')
      a.href = url
      a.download = editablePpt.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const mb = (editablePpt.bytes / (1024 * 1024)).toFixed(1)

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-1.5 font-sans text-[0.7rem] font-semibold uppercase tracking-label text-brand-gold transition-colors hover:bg-brand-gold/20 disabled:opacity-50"
    >
      {busy ? 'Preparing…' : error ? 'Retry download' : `↓ Editable PPT · ${mb} MB`}
    </button>
  )
}
