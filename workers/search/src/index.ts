/**
 * The gated search Worker.
 *
 *   GET /search?q=…&limit=&offset=  → { total, hits[] }
 *
 * THE GUARANTEE: results are filtered by the caller's allocation BEFORE the
 * response is written, so a member's browser never receives one byte of text
 * from a comic they are not allocated. That is why the index lives under an R2
 * prefix which is not presignable, and why search does not ship to the client.
 *
 * This Worker is also the first step of the migration off Firebase: it verifies
 * a Firebase login and enforces the allocation gate with NO privileged
 * credential of its own. Every later route should follow the same pattern.
 */
import { bearer, corsHeaders, verifyToken } from './auth'
import { readCaller, comicAllowed } from './allocation'
import { parseQuery } from './query'
import { searchDocs, type IndexDoc } from './search'

export interface Env {
  SEARCH_BUCKET: R2Bucket
  INDEX_CACHE: KVNamespace
  FIREBASE_PROJECT_ID: string
  ADMIN_EMAIL: string
  ALLOWED_ORIGINS: string
}

const INDEX_KEY = 'search/comics/index.json'
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

// Isolate-lifetime cache. The index changes only on publish, and a cold isolate
// simply re-reads it — an R2 read from a Worker is fast, and this keeps the
// invalidation story to "there isn't one".
let cachedDocs: { docs: IndexDoc[]; at: number } | null = null
const INDEX_TTL_MS = 10 * 60 * 1000

async function loadIndex(env: Env): Promise<IndexDoc[]> {
  const now = Date.now()
  if (cachedDocs && now - cachedDocs.at < INDEX_TTL_MS) return cachedDocs.docs
  const obj = await env.SEARCH_BUCKET.get(INDEX_KEY)
  if (!obj) throw new Error('search index missing')
  const parsed = JSON.parse(await obj.text()) as { docs: IndexDoc[] }
  cachedDocs = { docs: parsed.docs ?? [], at: now }
  return cachedDocs.docs
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req.headers.get('Origin'), env.ALLOWED_ORIGINS)
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: cors })

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '3600',
        },
      })
    }

    const url = new URL(req.url)
    if (req.method !== 'GET' || !url.pathname.replace(/\/+$/, '').endsWith('/search')) {
      return json({ error: 'not found' }, 404)
    }

    const token = bearer(req)
    const verified = token ? await verifyToken(token, env.FIREBASE_PROJECT_ID) : null
    if (!verified || !token) return json({ error: 'forbidden' }, 403)

    const resolved = await readCaller(
      token, verified.email, env.FIREBASE_PROJECT_ID, env.ADMIN_EMAIL)
    if (!resolved) return json({ error: 'forbidden' }, 403)

    const raw = (url.searchParams.get('q') ?? '').trim()
    if (!raw) return json({ error: 'q is required' }, 400)

    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(url.searchParams.get('limit') ?? '', 10) || DEFAULT_LIMIT))
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '', 10) || 0)

    let docs: IndexDoc[]
    try {
      docs = await loadIndex(env)
    } catch {
      return json({ error: 'search unavailable' }, 503)
    }

    // THE GATE — before ranking, before the response. Nothing the caller is not
    // allocated is ever considered, let alone serialized.
    const { caller, alloc } = resolved
    const readable = docs.filter((d) => comicAllowed(d, caller, alloc))

    const { total, hits } = searchDocs(readable, parseQuery(raw), limit, offset)
    return json({
      total,
      hits: hits.map((h) => ({
        comicId: h.doc.comicId,
        line: h.doc.line,
        slug: h.doc.slug,
        title: h.doc.title,
        lang: h.doc.lang,
        page: h.doc.page,
        snippet: h.snippet,
        refs: h.doc.refs,
      })),
    })
  },
}
