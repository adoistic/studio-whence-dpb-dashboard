import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// ─── Mocks for firebase-admin modular subpaths ─────────────────────────────────
//
// `firebase-admin/app`     → initializeApp is a no-op; getApps returns [] so the
//                            module-load guard initializes exactly once.
// `firebase-admin/auth`    → getAuth().verifyIdToken is controllable per-test.
// `firebase-admin/firestore` → getFirestore().collection(name).doc().get() is
//                            routed PER COLLECTION: `suspendedGet` answers the
//                            `suspended` lookup, `docGet` answers `allowlist`.
//                            `suspendedGet` defaults to {exists:false} each test
//                            so existing allow paths are unaffected.

const verifyIdToken = vi.fn()
const docGet = vi.fn()
const suspendedGet = vi.fn()

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}))

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken })),
}))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({ get: name === 'suspended' ? suspendedGet : docGet })),
    })),
  })),
}))

// Import after the mocks are registered.
import { authorize } from '../auth'

// Build a minimal request-like object carrying an Authorization header.
function req(authorization?: string) {
  const headers: Record<string, string> = {}
  if (authorization !== undefined) headers.authorization = authorization
  return { headers }
}

// Helper: make verifyIdToken resolve to a decoded token with the given email.
function decodesTo(email: string | undefined) {
  verifyIdToken.mockResolvedValue({ email })
}

// Helper: make the allowlist doc exist (or not), with an optional role field.
// `data()` is supplied so the new moderator-detection path can read `role`.
function allowlistDoc(exists: boolean, role?: string) {
  docGet.mockResolvedValue({ exists, data: () => (exists ? { role } : {}) })
}

// Helper: make the suspended doc exist (or not).
function suspendedDoc(exists: boolean) {
  suspendedGet.mockResolvedValue({ exists })
}

describe('authorize', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    // Clear all mock call data and return-value overrides (including any
    // per-test `mockReturnValue` overrides on getFirestore, etc.), while
    // preserving the `vi.mock` factory implementations registered at module
    // scope so module-level mocks remain functional.
    vi.clearAllMocks()
    // Re-establish default return values that the factory doesn't cover
    // (clearAllMocks wipes mockReturnValue/mockResolvedValue overrides).
    verifyIdToken.mockReset()
    docGet.mockReset()
    suspendedGet.mockReset()
    // Default: nobody is suspended, so existing allow paths are unaffected.
    suspendedGet.mockResolvedValue({ exists: false })
    // Default: no allowlist doc. authorize now reads allowlist even for domain
    // users (to detect a sub_admin role), so it must always resolve to a shape
    // carrying `exists` and `data()` rather than undefined.
    docGet.mockResolvedValue({ exists: false, data: () => ({}) })
    delete process.env.ADMIN_EMAIL
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  test('admin email (default adnan@thothica.com) → allowed + moderator + admin', async () => {
    decodesTo('adnan@thothica.com')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'adnan@thothica.com', moderator: true, admin: true })
    // No allowlist lookup needed for admin (short-circuits before it).
    expect(docGet).not.toHaveBeenCalled()
  })

  test('@thothica.com domain → allowed, not moderator, not admin (reads allowlist)', async () => {
    decodesTo('x@thothica.com')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'x@thothica.com', moderator: false, admin: false })
    // Allowlist IS read now (to detect a sub_admin role even for domain users).
    expect(docGet).toHaveBeenCalledTimes(1)
  })

  test('@dpb.in domain → allowed, not moderator, not admin (reads allowlist)', async () => {
    decodesTo('y@dpb.in')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'y@dpb.in', moderator: false, admin: false })
    expect(docGet).toHaveBeenCalledTimes(1)
  })

  test('domain user WITH sub_admin allowlist doc → allowed + moderator, not admin', async () => {
    decodesTo('boss@thothica.com')
    allowlistDoc(true, 'sub_admin')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'boss@thothica.com', moderator: true, admin: false })
    expect(docGet).toHaveBeenCalledTimes(1)
  })

  test('gmail WITH allowlist doc (no role) → allowed, not moderator, not admin', async () => {
    decodesTo('friend@gmail.com')
    allowlistDoc(true)
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'friend@gmail.com', moderator: false, admin: false })
    expect(docGet).toHaveBeenCalledTimes(1)
  })

  test('gmail WITH sub_admin allowlist doc → allowed + moderator, not admin', async () => {
    decodesTo('mod@gmail.com')
    allowlistDoc(true, 'sub_admin')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'mod@gmail.com', moderator: true, admin: false })
    expect(docGet).toHaveBeenCalledTimes(1)
  })

  // ─── Explicit admin / sub_admin / plain user cases for the admin flag ─────────

  test('admin email → admin: true, moderator: true', async () => {
    decodesTo('adnan@thothica.com')
    const result = await authorize(req('Bearer tok'))
    expect(result).toMatchObject({ admin: true, moderator: true })
  })

  test('sub_admin (allowlist doc with sub_admin role) → admin: false, moderator: true', async () => {
    decodesTo('sa@dpb.in')
    allowlistDoc(true, 'sub_admin')
    const result = await authorize(req('Bearer tok'))
    expect(result).toMatchObject({ admin: false, moderator: true })
  })

  test('plain domain user (no special role) → admin: false, moderator: false', async () => {
    decodesTo('plain@dpb.in')
    const result = await authorize(req('Bearer tok'))
    expect(result).toMatchObject({ admin: false, moderator: false })
  })

  test('gmail WITHOUT allowlist doc → denied', async () => {
    decodesTo('stranger@gmail.com')
    allowlistDoc(false)
    const result = await authorize(req('Bearer tok'))
    expect(result).toBeNull()
  })

  test('missing Authorization header → null (verifyIdToken never called)', async () => {
    const result = await authorize(req(undefined))
    expect(result).toBeNull()
    expect(verifyIdToken).not.toHaveBeenCalled()
  })

  test('malformed header "Token abc" → null (verifyIdToken never called)', async () => {
    const result = await authorize(req('Token abc'))
    expect(result).toBeNull()
    expect(verifyIdToken).not.toHaveBeenCalled()
  })

  test('"Bearer" with no token → null (verifyIdToken never called)', async () => {
    const result = await authorize(req('Bearer'))
    expect(result).toBeNull()
    expect(verifyIdToken).not.toHaveBeenCalled()
  })

  test('"Bearer    " (whitespace only) → null', async () => {
    const result = await authorize(req('Bearer    '))
    expect(result).toBeNull()
    expect(verifyIdToken).not.toHaveBeenCalled()
  })

  test('verifyIdToken throws → null (fail closed)', async () => {
    verifyIdToken.mockRejectedValue(new Error('invalid token'))
    const result = await authorize(req('Bearer bad'))
    expect(result).toBeNull()
  })

  test('Firestore .get() throws → null (fail closed)', async () => {
    decodesTo('friend@gmail.com')
    docGet.mockRejectedValue(new Error('firestore down'))
    const result = await authorize(req('Bearer tok'))
    expect(result).toBeNull()
  })

  test('decoded token with no email → null (fail closed)', async () => {
    decodesTo(undefined)
    const result = await authorize(req('Bearer tok'))
    expect(result).toBeNull()
    expect(docGet).not.toHaveBeenCalled()
  })

  test('case-insensitive: Adnan@Thothica.com → admin + moderator, normalized email', async () => {
    decodesTo('Adnan@Thothica.com')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'adnan@thothica.com', moderator: true, admin: true })
    expect(docGet).not.toHaveBeenCalled()
  })

  test('case-insensitive: X@THOTHICA.COM → allowed (domain), normalized', async () => {
    decodesTo('X@THOTHICA.COM')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'x@thothica.com', moderator: false, admin: false })
  })

  test('case-insensitive bearer scheme: "bearer tok" → parsed', async () => {
    decodesTo('x@thothica.com')
    const result = await authorize(req('bearer tok'))
    expect(result).toEqual({ email: 'x@thothica.com', moderator: false, admin: false })
    expect(verifyIdToken).toHaveBeenCalledWith('tok')
  })

  test('ADMIN_EMAIL env override is honored (different admin) → moderator + admin', async () => {
    process.env.ADMIN_EMAIL = 'boss@example.com'
    decodesTo('boss@example.com')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'boss@example.com', moderator: true, admin: true })
    expect(docGet).not.toHaveBeenCalled()
  })

  test('ADMIN_EMAIL override: the default admin then is a plain domain user', async () => {
    // With a custom admin set, adnan@thothica.com is no longer admin — but it
    // still wins on the @thothica.com domain rule, so it is allowed. The
    // allowlist IS read now (to detect a sub_admin role); here it's absent, so
    // moderator is false.
    process.env.ADMIN_EMAIL = 'boss@example.com'
    decodesTo('adnan@thothica.com')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'adnan@thothica.com', moderator: false, admin: false })
    expect(docGet).toHaveBeenCalledTimes(1)
  })

  test('ADMIN_EMAIL override with trailing case/space is normalized → moderator + admin', async () => {
    process.env.ADMIN_EMAIL = '  Boss@Example.com  '
    decodesTo('boss@example.com')
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'boss@example.com', moderator: true, admin: true })
  })

  test('the allowlist doc is looked up under the normalized email', async () => {
    // A gmail with mixed case: lookup must use the lowercased key.
    // Route the suspended lookup to suspendedGet (not suspended → {exists:false})
    // and the allowlist lookup to docGet, both via the per-collection mock.
    const suspendedDocFn = vi.fn(() => ({ get: suspendedGet }))
    const allowDocFn = vi.fn(() => ({ get: docGet }))
    const collection = vi.fn((name: string) => ({
      doc: name === 'suspended' ? suspendedDocFn : allowDocFn,
    }))
    const { getFirestore } = await import('firebase-admin/firestore')
    ;(getFirestore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      collection,
    })
    decodesTo('Mixed.Case@Gmail.com')
    suspendedDoc(false)
    allowlistDoc(true)
    const result = await authorize(req('Bearer tok'))
    expect(result).toEqual({ email: 'mixed.case@gmail.com', moderator: false, admin: false })
    expect(collection).toHaveBeenCalledWith('allowlist')
    expect(allowDocFn).toHaveBeenCalledWith('mixed.case@gmail.com')
  })

  // ─── Suspension (overrides every allow) ──────────────────────────────────────

  test('suspended domain user → denied (even though @thothica.com)', async () => {
    decodesTo('banned@thothica.com')
    suspendedDoc(true)
    const result = await authorize(req('Bearer tok'))
    expect(result).toBeNull()
    // The allowlist is never consulted once suspended.
    expect(docGet).not.toHaveBeenCalled()
  })

  test('suspended admin email → denied', async () => {
    decodesTo('adnan@thothica.com')
    suspendedDoc(true)
    const result = await authorize(req('Bearer tok'))
    expect(result).toBeNull()
  })

  test('suspended allowlisted gmail → denied (allowlist not reached)', async () => {
    decodesTo('friend@gmail.com')
    suspendedDoc(true)
    allowlistDoc(true)
    const result = await authorize(req('Bearer tok'))
    expect(result).toBeNull()
    expect(docGet).not.toHaveBeenCalled()
  })

  test('suspended lookup throws → null (fail closed)', async () => {
    decodesTo('x@thothica.com')
    suspendedGet.mockRejectedValue(new Error('firestore down'))
    const result = await authorize(req('Bearer tok'))
    expect(result).toBeNull()
  })
})
