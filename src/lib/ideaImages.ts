export const INLINE_THRESHOLD = 50 * 1024 // 50 KB

export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'image'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export type RoutedImage =
  | { kind: 'inline'; dataUri: string }
  | { kind: 'r2'; token: string; key: string; filename: string; contentType: string }

export interface RouteCtx {
  ideaId: string
  upload: (file: File, key: string) => Promise<void>
  toDataUri: (file: File) => Promise<string>
}

export async function routeImage(file: File, ctx: RouteCtx): Promise<RoutedImage> {
  if (file.size < INLINE_THRESHOLD) {
    return { kind: 'inline', dataUri: await ctx.toDataUri(file) }
  }
  const filename = safeFilename(file.name)
  const key = `images/ideas/${ctx.ideaId}/${filename}`
  await ctx.upload(file, key)
  return { kind: 'r2', token: `r2:${key}`, key, filename, contentType: file.type || 'application/octet-stream' }
}

/** Browser helper: File -> data URI (the composer passes this in). */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
