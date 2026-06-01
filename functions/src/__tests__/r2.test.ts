import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// ─── Mocks for the AWS SDK ─────────────────────────────────────────────────────
//
// We mock `@aws-sdk/s3-request-presigner`'s `getSignedUrl` so no network or real
// signing happens, and `@aws-sdk/client-s3`'s `S3Client` + `GetObjectCommand`.
// `GetObjectCommand` is a class in the real SDK; here we stub it as a class that
// stashes its input on `.input`, so the test can assert what Bucket/Key reached
// it. `S3Client` is stubbed as a constructor that records its config.
//
// `vi.mock` factories are hoisted to the top of the file, so they cannot close
// over module-scope variables. We therefore define the fakes INSIDE each factory
// and read them back via the (mocked) module imports for assertions.

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(
    async () =>
      'https://acct.r2.cloudflarestorage.com/studio-whence-dpb/images/x.jpg?X-Amz-Signature=abc'
  ),
}))

vi.mock('@aws-sdk/client-s3', () => {
  const configs: unknown[] = []
  class FakeGetObjectCommand {
    input: Record<string, unknown>
    constructor(input: Record<string, unknown>) {
      this.input = input
    }
  }
  return {
    // Exposed for assertions (not part of the real SDK surface).
    __configs: configs,
    S3Client: class {
      config: unknown
      constructor(config: unknown) {
        this.config = config
        configs.push(config)
      }
    },
    GetObjectCommand: FakeGetObjectCommand,
  }
})

// `r2.ts` caches the S3 client in a module-level lazy singleton for warm-instance
// efficiency. To assert "built once" cleanly per test, we reset the module
// registry before each test and dynamically re-import — so every test starts
// with a fresh, uncached client and a fresh `__configs` record.

type PresignGet = (key: string, expiresIn?: number) => Promise<string>
type CommandCtor = new (input: Record<string, unknown>) => {
  input: Record<string, unknown>
}

let presignGet: PresignGet
let getSignedUrl: ReturnType<typeof vi.fn>
let FakeGetObjectCommand: CommandCtor
let s3ClientConfigs: unknown[]

describe('presignGet', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(async () => {
    vi.resetModules()
    // The lazy client reads these on first use — set them so it builds cleanly.
    process.env.R2_ENDPOINT = 'https://acct.r2.cloudflarestorage.com'
    process.env.R2_ACCESS_KEY_ID = 'test-access-key'
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key'
    process.env.R2_BUCKET = 'studio-whence-dpb'

    // Re-import the (freshly reset) mocked SDK modules and the unit under test.
    const clientS3 = await import('@aws-sdk/client-s3')
    const presigner = await import('@aws-sdk/s3-request-presigner')
    presignGet = (await import('../r2')).presignGet
    getSignedUrl = presigner.getSignedUrl as unknown as ReturnType<typeof vi.fn>
    FakeGetObjectCommand = (
      clientS3 as unknown as { GetObjectCommand: CommandCtor }
    ).GetObjectCommand
    s3ClientConfigs = (clientS3 as unknown as { __configs: unknown[] }).__configs

    // `vi.resetModules()` gives a fresh `../r2` (uncached singleton) but does
    // NOT re-run the `vi.mock` factories, so the mock's call history and the
    // `__configs` record persist across tests. Reset both here.
    getSignedUrl.mockClear()
    s3ClientConfigs.length = 0
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  test('returns a URL string containing the bucket, key, and X-Amz-Signature', async () => {
    const url = await presignGet('images/x.jpg')
    expect(typeof url).toBe('string')
    expect(url).toContain('studio-whence-dpb')
    expect(url).toContain('images/x.jpg')
    expect(url).toContain('X-Amz-Signature')
  })

  test('passes a GetObjectCommand with the right Bucket and Key, and default expiresIn 600', async () => {
    await presignGet('research/dhirubhai/ch01.md')

    expect(getSignedUrl).toHaveBeenCalledTimes(1)
    const [, command, options] = getSignedUrl.mock.calls[0]
    expect(command).toBeInstanceOf(FakeGetObjectCommand)
    expect((command as { input: Record<string, unknown> }).input).toMatchObject({
      Bucket: 'studio-whence-dpb',
      Key: 'research/dhirubhai/ch01.md',
    })
    expect(options).toEqual({ expiresIn: 600 })
  })

  test('a custom expiresIn is passed through', async () => {
    await presignGet('drafts/x.md', 300)
    const [, , options] = getSignedUrl.mock.calls[0]
    expect(options).toEqual({ expiresIn: 300 })
  })

  test('builds the S3Client from R2_* env (endpoint, region auto, creds)', async () => {
    await presignGet('images/y.png')
    expect(s3ClientConfigs.length).toBeGreaterThanOrEqual(1)
    expect(s3ClientConfigs[0]).toMatchObject({
      endpoint: 'https://acct.r2.cloudflarestorage.com',
      region: 'auto',
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      },
    })
  })

  test('the S3Client is a lazy singleton (built once, reused across calls)', async () => {
    await presignGet('images/a.jpg')
    await presignGet('images/b.jpg')
    expect(s3ClientConfigs.length).toBe(1)
  })
})
