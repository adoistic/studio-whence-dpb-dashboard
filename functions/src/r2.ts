/**
 * r2.ts — short-lived presigned R2 GET URLs.
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

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/** The default presign TTL, in seconds (10 minutes). */
const DEFAULT_EXPIRES_IN = 600

/** Lazy singleton — built on first use, reused for warm-instance efficiency. */
let cachedClient: S3Client | null = null

/** Build (once) and return the R2 S3 client from runtime env. */
function client(): S3Client {
  if (cachedClient) return cachedClient
  cachedClient = new S3Client({
    endpoint: process.env.R2_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
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
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  })
  return getSignedUrl(client(), command, { expiresIn })
}
