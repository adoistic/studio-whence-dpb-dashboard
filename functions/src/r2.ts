/**
 * r2.ts — R2 accessor: presigned GET/PUT + inline get/put/delete.
 *
 * `/resolve` hands the client a presigned GET URL for an R2 object (after
 * `authorize` + `safeKey` have passed) so the browser can fetch the asset
 * directly from R2 for a short window — no proxying of large binaries through
 * the function. URLs expire after `expiresIn` seconds (default 600 / 10 min).
 *
 * Cloudflare R2 speaks the S3 API, so we use `@aws-sdk/client-s3` with R2's
 * S3-compatible endpoint, region `auto`, and the R2 access-key credentials.
 * The env var names mirror the content-repo `tools/r2_client.py`:
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
 *
 * These are PUBLIC-repo-safe: the credentials live only in Firebase secret
 * config / runtime env, never in source. The client is built LAZILY (first
 * call) so importing this module with no env set never throws — important for
 * tests and for cold-start ordering where secrets are injected at runtime.
 */

import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/** The default presign TTL, in seconds (10 minutes). */
const DEFAULT_EXPIRES_IN = 600

/** Lazy singleton — built on first use, reused for warm-instance efficiency. */
let cachedClient: S3Client | null = null

/** Build (once) and return the R2 S3 client from runtime env.
 *
 * Throws immediately if any required R2 env var is missing or empty, so a
 * misconfigured deployment surfaces a clear error rather than a cryptic 403.
 */
function client(): S3Client {
  if (cachedClient) return cachedClient
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'R2 not configured: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must all be set in Firebase secret config.'
    )
  }
  cachedClient = new S3Client({
    endpoint,
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
  })
  return cachedClient
}

/**
 * Generate a short-lived presigned GET URL for an R2 object key.
 *
 * @param key       The R2 object key (already validated via `safeKey`).
 * @param expiresIn TTL in seconds (default 600 / 10 min).
 * @returns         A presigned URL the client can GET directly from R2.
 */
export function presignGet(
  key: string,
  expiresIn: number = DEFAULT_EXPIRES_IN
): Promise<string> {
  // client() throws if any R2 env var is absent — must be called first so the
  // env guard runs before we read R2_BUCKET for the command.
  const s3 = client()
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
  })
  return getSignedUrl(s3, command, { expiresIn })
}

/**
 * Generate a short-lived presigned PUT URL for an R2 object key. The client
 * PUTs the bytes directly to R2. `contentType` is bound into the signature so
 * the upload must use the same Content-Type.
 */
export function presignPut(
  key: string,
  contentType: string,
  ttlSeconds = 600,
): Promise<string> {
  const s3 = client()
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn: ttlSeconds })
}

/**
 * Fetch an R2 object's bytes + content-type INLINE (not presigned).
 *
 * Used by `/content` (hard-coded `content.json`) and `/read` (a validated text
 * key), where the function returns the bytes itself rather than handing back a
 * presigned URL. Uses the same lazy `client()` (and therefore the same env
 * guard) as `presignGet`.
 *
 * The SDK v3 response `Body` is a streaming blob; `transformToByteArray()` is
 * the cleanest way to drain it to bytes in Node 20.
 *
 * @param key The R2 object key (hard-coded `content.json`, or already validated
 *            via `safeKey`).
 * @returns   `{ body, contentType }` — `body` is a Buffer of the object bytes,
 *            `contentType` is the object's stored Content-Type (or undefined).
 */
export async function getObject(
  key: string
): Promise<{ body: Buffer; contentType: string | undefined }> {
  // client() throws if any R2 env var is absent — call it first so the env
  // guard runs before we read R2_BUCKET for the command.
  const s3 = client()
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
  })
  const response = await s3.send(command)
  if (!response.Body) throw new Error(`R2 returned no body for key: ${key}`)
  const bytes = await response.Body.transformToByteArray()
  return { body: Buffer.from(bytes), contentType: response.ContentType }
}

/** Write a small text object inline (capture transcripts). */
export async function putObject(
  key: string,
  body: string,
  contentType: string
): Promise<void> {
  const s3 = client()
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

/**
 * List every object key under `prefix` (paginated, all pages drained).
 *
 * Used by the `healComicPages` scheduler to read the set of published comic
 * page images (`images/comics/…`) and reconcile Firestore's `pages` blocks
 * against R2 reality. Uses the same lazy `client()` + env guard as the rest of
 * this module. Returns keys in R2's listing order.
 */
export async function listKeysUnderPrefix(prefix: string): Promise<string[]> {
  const s3 = client()
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET!,
        Prefix: prefix,
        ContinuationToken: token,
      })
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

/** Delete one object (idea-delete cleanup of capture transcripts). */
export async function deleteObject(key: string): Promise<void> {
  const s3 = client()
  await s3.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
    })
  )
}
