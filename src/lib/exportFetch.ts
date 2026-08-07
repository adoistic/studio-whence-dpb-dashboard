// The export flow's only impure module: presign keys via the gated Function,
// fetch bytes (1200px web variant first, 2000px master as fallback), and
// measure pixel dimensions for docx sizing. Deps are injectable for tests.
import type { Comic } from '@/types/content'
import { comicPageKeys, webVariantKey } from '@/lib/comicPageKeys'
import { resolveUrls } from '@/lib/dataApi'
import type { FetchedImage, ImageMap, ImageRef } from '@/lib/exportZip'

export interface FetchResult { images: ImageMap; failed: ImageRef[] }
export interface FetchDeps {
  resolve: (keys: string[]) => Promise<Record<string, string>>
  fetchBytes: (url: string) => Promise<Uint8Array | null>
  measure: (bytes: Uint8Array) => Promise<{ width: number; height: number }>
}

export function exportImagePlan(comic: Comic): { ref: ImageRef; webKey: string; masterKey: string }[] {
  const masters = comicPageKeys(comic)
  const hasCover = !!comic.pages?.coverKey
  return masters.map((masterKey, i) => ({
    ref: hasCover ? (i === 0 ? ('cover' as const) : i) : i + 1,
    webKey: webVariantKey(masterKey),
    masterKey,
  }))
}

async function defaultFetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

async function defaultMeasure(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const bitmap = await createImageBitmap(new Blob([buffer]))
  const dims = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return dims
}

export async function fetchExportImages(comic: Comic, deps?: Partial<FetchDeps>): Promise<FetchResult> {
  const resolve = deps?.resolve ?? resolveUrls
  const fetchBytes = deps?.fetchBytes ?? defaultFetchBytes
  const measure = deps?.measure ?? defaultMeasure

  const plan = exportImagePlan(comic)
  const urls = await resolve(plan.flatMap((p) => [p.webKey, p.masterKey]))

  const images: ImageMap = new Map()
  const failed: ImageRef[] = []
  // Small batches: 60+ parallel full-page fetches can stall the tab.
  const BATCH = 6
  for (let i = 0; i < plan.length; i += BATCH) {
    await Promise.all(plan.slice(i, i + BATCH).map(async (p) => {
      let bytes: Uint8Array | null = null
      const webUrl = urls[p.webKey]
      if (webUrl) bytes = await fetchBytes(webUrl)
      if (!bytes) {
        const masterUrl = urls[p.masterKey]
        if (masterUrl) bytes = await fetchBytes(masterUrl)
      }
      if (!bytes) { failed.push(p.ref); return }
      const dims = await measure(bytes)
      const img: FetchedImage = { bytes, width: dims.width, height: dims.height }
      images.set(p.ref, img)
    }))
  }
  failed.sort((a, b) => (a === 'cover' ? -1 : b === 'cover' ? 1 : (a as number) - (b as number)))
  return { images, failed }
}
