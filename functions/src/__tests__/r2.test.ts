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
  // A controllable `send` shared by every S3Client instance the mock builds —
  // exposed as `__send` so `getObject` tests can stage a fake response stream.
  const send = vi.fn()
  class FakeGetObjectCommand {
    input: Record<string, unknown>
    constructor(input: Record<string, unknown>) {
      this.input = input
    }
  }
  return {
    // Exposed for assertions (not part of the real SDK surface).
    __configs: configs,
    __send: send,
    S3Client: class {
      config: unknown
      send = send
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
type GetObject = (
  key: string
) => Promise<{ body: Buffer; contentType: string | undefined }>
type CommandCtor = new (input: Record<string, unknown>) => {
  input: Record<string, unknown>
}

let presignGet: PresignGet
let getSignedUrl: ReturnType<typeof vi.fn>
let FakeGetObjectCommand: CommandCtor
let s3ClientConfigs: unknown[]
let s3Send: ReturnType<typeof vi.fn>

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
    s3Send = (clientS3 as unknown as { __send: ReturnType<typeof vi.fn> }).__send

    // `vi.resetModules()` gives a fresh `../r2` (uncached singleton) but does
    // NOT re-run the `vi.mock` factories, so the mock's call history and the
    // `__configs` record persist across tests. Reset both here.
    getSignedUrl.mockClear()
    s3Send.mockReset()
    s3ClientConfigs.length = 0
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  test('returns exactly the value the presigner resolves with (wiring check)', async () => {
    const url = await presignGet('images/x.jpg')
    expect(url).toBe(
      'https://acct.r2.cloudflarestorage.com/studio-whence-dpb/images/x.jpg?X-Amz-Signature=abc'
    )
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
    expect(s3ClientConfigs.length).toBe(1)
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

  test('throws with a clear error when R2 env vars are missing', async () => {
    // Re-reset the module so this test gets its own clean singleton state, with
    // no cached client from the beforeEach presignGet calls above.
    vi.resetModules()
    // Wipe all four required vars so the guard fires.
    vi.stubEnv('R2_ENDPOINT', '')
    vi.stubEnv('R2_ACCESS_KEY_ID', '')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', '')
    vi.stubEnv('R2_BUCKET', '')
    const { presignGet: presignGetFresh } = await import('../r2')
    // client() throws synchronously (before getSignedUrl), so we use the
    // synchronous .toThrow form — not .rejects.toThrow.
    expect(() => presignGetFresh('images/x.jpg')).toThrow(/R2 not configured/)
  })
})

describe('getObject', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(async () => {
    vi.resetModules()
    process.env.R2_ENDPOINT = 'https://acct.r2.cloudflarestorage.com'
    process.env.R2_ACCESS_KEY_ID = 'test-access-key'
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key'
    process.env.R2_BUCKET = 'studio-whence-dpb'

    const clientS3 = await import('@aws-sdk/client-s3')
    FakeGetObjectCommand = (
      clientS3 as unknown as { GetObjectCommand: CommandCtor }
    ).GetObjectCommand
    s3ClientConfigs = (clientS3 as unknown as { __configs: unknown[] }).__configs
    s3Send = (clientS3 as unknown as { __send: ReturnType<typeof vi.fn> }).__send
    s3Send.mockReset()
    s3ClientConfigs.length = 0
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  // A fake SDK-v3 streaming Body: only `transformToByteArray` is exercised.
  function fakeBody(bytes: Uint8Array) {
    return { transformToByteArray: vi.fn(async () => bytes) }
  }

  test('returns the object bytes as a Buffer and its content-type', async () => {
    const bytes = new TextEncoder().encode('{"k":"v"}')
    s3Send.mockResolvedValue({
      Body: fakeBody(bytes),
      ContentType: 'application/json',
    })
    const { getObject } = await import('../r2')
    const result: { body: Buffer; contentType: string | undefined } =
      await (getObject as GetObject)('content.json')
    expect(Buffer.isBuffer(result.body)).toBe(true)
    expect(result.body.toString('utf8')).toBe('{"k":"v"}')
    expect(result.contentType).toBe('application/json')
  })

  test('passes a GetObjectCommand with the right Bucket and Key', async () => {
    s3Send.mockResolvedValue({
      Body: fakeBody(new Uint8Array()),
      ContentType: 'text/markdown',
    })
    const { getObject } = await import('../r2')
    await (getObject as GetObject)('research/dhirubhai/ch01.md')
    expect(s3Send).toHaveBeenCalledTimes(1)
    const command = s3Send.mock.calls[0][0]
    expect(command).toBeInstanceOf(FakeGetObjectCommand)
    expect((command as { input: Record<string, unknown> }).input).toMatchObject({
      Bucket: 'studio-whence-dpb',
      Key: 'research/dhirubhai/ch01.md',
    })
  })

  test('contentType is undefined when the object has none', async () => {
    s3Send.mockResolvedValue({ Body: fakeBody(new Uint8Array([1, 2, 3])) })
    const { getObject } = await import('../r2')
    const result = await (getObject as GetObject)('drafts/x.md')
    expect(result.contentType).toBeUndefined()
    expect([...result.body]).toEqual([1, 2, 3])
  })

  test('propagates the SDK error when send rejects (e.g. NoSuchKey)', async () => {
    const err = Object.assign(new Error('not found'), { name: 'NoSuchKey' })
    s3Send.mockRejectedValue(err)
    const { getObject } = await import('../r2')
    await expect((getObject as GetObject)('research/missing.md')).rejects.toThrow(
      /not found/
    )
  })

  test('throws with a clear error when R2 env vars are missing', async () => {
    vi.resetModules()
    vi.stubEnv('R2_ENDPOINT', '')
    vi.stubEnv('R2_ACCESS_KEY_ID', '')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', '')
    vi.stubEnv('R2_BUCKET', '')
    const { getObject: getObjectFresh } = await import('../r2')
    await expect((getObjectFresh as GetObject)('research/x.md')).rejects.toThrow(
      /R2 not configured/
    )
  })
})
