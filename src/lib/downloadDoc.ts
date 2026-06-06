'use client'

import { resolveUrls } from '@/lib/dataApi'

/**
 * Resolve a single R2 doc key to a presigned URL, fetch it, and trigger a
 * browser download under a friendly filename (presign → blob → anchor click).
 */
export async function downloadKey(key: string, filename: string): Promise<void> {
  const urls = await resolveUrls([key])
  const url = urls[key]
  if (!url) throw new Error('could not resolve doc url')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const blob = await res.blob()
  const obj = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = obj
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(obj)
  }
}
