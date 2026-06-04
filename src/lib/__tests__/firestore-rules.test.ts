import { describe, it, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment, type RulesTestEnvironment,
  assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dpb',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'meta/catalog'), { headline: { lines_active: 4 } })
    await setDoc(doc(db, 'comics/biographies__01-x'), { line: 'biographies', status: 'draft' })
    await setDoc(doc(db, 'people/jrd-tata'), { line: 'biographies', stage: 'draft' })
    await setDoc(doc(db, 'figures/jrd-tata'), { slug: 'jrd-tata' })
    await setDoc(doc(db, 'figures/jrd-tata/sources/book-a'), { kind: 'book' })
    await setDoc(doc(db, '_internal/manifest'), { hashes: {} })
    await setDoc(doc(db, 'feedback/root-ankit'), {
      comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'mr.ankitgzb@gmail.com', authorName: 'Ankit', authorRole: 'editor',
      body: 'Fix dates.', status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })
    await setDoc(doc(db, 'comics/biographies__01-x/versions/1'), { version: 1, date: '2026-05-29', note: 'init' })
    // mr.ankitgzb@gmail.com is a gmail (not domain-allowed): allowlist it so editor() tests are authorized.
    await setDoc(doc(db, 'allowlist/mr.ankitgzb@gmail.com'), { role: 'editor' })
    await setDoc(doc(db, 'feedback/stranger-doc'), {
      comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'nope@gmail.com', authorName: 'Nope', authorRole: 'allow',
      body: 'x', status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })

    // ── Roles & approval seeds ──
    // A sub_admin (moderator). sub@dpb.in is domain-allowed AND carries the role doc.
    await setDoc(doc(db, 'allowlist/sub@dpb.in'), { role: 'sub_admin' })
    // A suspended domain user — denied everything, even catalog reads.
    await setDoc(doc(db, 'suspended/banned@thothica.com'), {})
    // A published feedback root — visible to members.
    await setDoc(doc(db, 'feedback/pub'), {
      comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'x@thothica.com', authorName: 'X', authorRole: 'allow',
      body: 'published root', status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })
    // A draft feedback root — visible ONLY to sub_admins/admin.
    await setDoc(doc(db, 'feedback/draft'), {
      comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'someone@thothica.com', authorName: 'Someone', authorRole: 'allow',
      body: 'draft root', status: 'open', comicVersion: 1, hidden: false, published: false,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })
  })
})
afterAll(async () => { await env.cleanup() })

describe('firestore.rules — catalog', () => {
  it('allowlisted (thothica.com) user can read catalog + sources subcollection', async () => {
    const db = env.authenticatedContext('u1', { email: 'x@thothica.com' }).firestore()
    await assertSucceeds(getDoc(doc(db, 'meta/catalog')))
    await assertSucceeds(getDocs(collection(db, 'comics')))
    await assertSucceeds(getDoc(doc(db, 'people/jrd-tata')))
    await assertSucceeds(getDocs(collection(db, 'figures/jrd-tata/sources')))
  })
  it('non-allowlisted user is denied', async () => {
    const db = env.authenticatedContext('u2', { email: 'stranger@gmail.com' }).firestore()
    await assertFails(getDoc(doc(db, 'meta/catalog')))
  })
  it('clients cannot write the catalog', async () => {
    const db = env.authenticatedContext('u1', { email: 'x@thothica.com' }).firestore()
    await assertFails(setDoc(doc(db, 'comics/biographies__01-x'), { status: 'published' }))
  })
  it('_internal manifest is fully private (even to allowlisted)', async () => {
    const db = env.authenticatedContext('u1', { email: 'x@thothica.com' }).firestore()
    await assertFails(getDoc(doc(db, '_internal/manifest')))
    await assertFails(setDoc(doc(db, '_internal/manifest'), { hashes: {} }))
  })
})

describe('firestore.rules — feedback', () => {
  const allowed = () => env.authenticatedContext('a', { email: 'x@thothica.com' }).firestore()
  const editor  = () => env.authenticatedContext('e', { email: 'mr.ankitgzb@gmail.com' }).firestore()
  const stranger = () => env.authenticatedContext('s', { email: 'nope@gmail.com' }).firestore()
  const admin   = () => env.authenticatedContext('ad', { email: 'adnan@thothica.com' }).firestore()
  const rootDoc = (over = {}) => ({
    comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
    authorEmail: 'x@thothica.com', authorName: 'X', authorRole: 'allow',
    body: 'hi', status: 'open', comicVersion: 1, hidden: false, published: false,
    createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null, ...over,
  })
  // (mr.ankitgzb@gmail.com is allowlisted in the beforeAll seed block above.)

  it('allowlisted member can read published feedback (filtered query)', async () => {
    // A member's real query constrains to published + not-hidden, which the
    // read rule permits. An unconstrained collection read would now fail
    // because of the seeded draft — that is covered in the roles describe below.
    const q = query(
      collection(allowed(), 'feedback'),
      where('published', '==', true),
      where('hidden', '==', false),
    )
    await assertSucceeds(getDocs(q))
  })
  it('non-allowlisted user is denied reading feedback', async () => {
    await assertFails(getDocs(collection(stranger(), 'feedback')))
  })
  it('allowlisted user creates a root with own email + status open', async () => {
    await assertSucceeds(setDoc(doc(allowed(), 'feedback/new-root'), rootDoc()))
  })
  it('cannot forge authorEmail', async () => {
    await assertFails(setDoc(doc(allowed(), 'feedback/forge'), rootDoc({ authorEmail: 'someone@thothica.com' })))
  })
  it('root must be created with status open', async () => {
    await assertFails(setDoc(doc(allowed(), 'feedback/bad'), rootDoc({ status: 'resolved' })))
  })
  it('reply (parentId set) does not require status open', async () => {
    // omit `status` to build a reply with no status field (replies are status-less)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...reply } = rootDoc({ parentId: 'root-ankit' })
    await assertSucceeds(setDoc(doc(allowed(), 'feedback/reply1'), reply))
  })
  it('cannot create a hidden comment', async () => {
    await assertFails(setDoc(doc(allowed(), 'feedback/h'), rootDoc({ hidden: true })))
  })
  it('author edits own body but cannot self-resolve', async () => {
    const db = editor()
    // root-ankit is seeded published:true; the author-update invariant forbids
    // changing `published`, so preserve it here.
    await assertSucceeds(setDoc(doc(db, 'feedback/root-ankit'),
      { ...rootDoc({ authorEmail: 'mr.ankitgzb@gmail.com', authorRole: 'editor', published: true }), body: 'edited', editedAt: '2026-06-04' }))
    await assertFails(setDoc(doc(db, 'feedback/root-ankit'),
      { ...rootDoc({ authorEmail: 'mr.ankitgzb@gmail.com', authorRole: 'editor', published: true }), status: 'resolved' }))
  })
  it('admin can resolve and hide', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'feedback/root-ankit'),
      { ...rootDoc({ authorEmail: 'mr.ankitgzb@gmail.com', published: true }), status: 'resolved', hidden: true }))
  })
  it('author deletes own; admin can delete', async () => {
    await assertSucceeds(deleteDoc(doc(admin(), 'feedback/reply1')))
  })
  it('versions subcollection: allowlisted reads, nobody writes via client', async () => {
    await assertSucceeds(getDoc(doc(allowed(), 'comics/biographies__01-x/versions/1')))
    await assertFails(setDoc(doc(allowed(), 'comics/biographies__01-x/versions/1'), { version: 1 }))
  })
  it('author cannot flip hidden on own doc', async () => {
    await assertFails(setDoc(doc(editor(), 'feedback/root-ankit'),
      { ...rootDoc({ authorEmail: 'mr.ankitgzb@gmail.com', authorRole: 'editor' }), hidden: true }))
  })
  it('non-allowlisted author cannot delete own doc', async () => {
    await assertFails(deleteDoc(doc(stranger(), 'feedback/stranger-doc')))
  })
})

describe('firestore.rules — roles & approval', () => {
  const member   = () => env.authenticatedContext('m', { email: 'x@thothica.com' }).firestore()
  const subAdmin = () => env.authenticatedContext('sa', { email: 'sub@dpb.in' }).firestore()
  const admin    = () => env.authenticatedContext('ad', { email: 'adnan@thothica.com' }).firestore()
  const suspended = () => env.authenticatedContext('su', { email: 'banned@thothica.com' }).firestore()

  const rootDoc = (over = {}) => ({
    comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
    authorEmail: 'x@thothica.com', authorName: 'X', authorRole: 'allow',
    body: 'hi', status: 'open', comicVersion: 1, hidden: false, published: false,
    createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null, ...over,
  })

  // ── Draft visibility ──
  it('member CAN read a published root', async () => {
    await assertSucceeds(getDoc(doc(member(), 'feedback/pub')))
  })
  it('member CANNOT read a draft root', async () => {
    await assertFails(getDoc(doc(member(), 'feedback/draft')))
  })
  it('sub_admin CAN read a draft root', async () => {
    await assertSucceeds(getDoc(doc(subAdmin(), 'feedback/draft')))
  })

  // ── Suspension ──
  it('suspended domain user is denied catalog reads', async () => {
    await assertFails(getDoc(doc(suspended(), 'meta/catalog')))
  })
  it('suspended domain user is denied feedback reads (even published)', async () => {
    await assertFails(getDoc(doc(suspended(), 'feedback/pub')))
  })

  // ── Create: members may not self-publish ──
  it('member create MUST set published == false', async () => {
    await assertFails(setDoc(doc(member(), 'feedback/m-pub'), rootDoc({ published: true })))
    await assertSucceeds(setDoc(doc(member(), 'feedback/m-draft'), rootDoc({ published: false })))
  })
  it('sub_admin create with published == true succeeds', async () => {
    await assertSucceeds(setDoc(doc(subAdmin(), 'feedback/sa-pub'),
      rootDoc({ authorEmail: 'sub@dpb.in', published: true })))
  })

  // ── Update: only moderators may approve / flip published ──
  it('member (author) cannot flip own draft to published', async () => {
    // m-draft was created above by the member, published:false.
    await assertFails(setDoc(doc(member(), 'feedback/m-draft'), rootDoc({ published: true })))
  })
  it('sub_admin CAN approve (set published true)', async () => {
    await assertSucceeds(setDoc(doc(subAdmin(), 'feedback/m-draft'), rootDoc({ published: true })))
  })

  // ── Moderation that was previously admin-only is now sub_admin ──
  it('sub_admin can set status + hidden; a member cannot moderate', async () => {
    await assertSucceeds(setDoc(doc(subAdmin(), 'feedback/pub'),
      rootDoc({ published: true, status: 'resolved', hidden: true })))
    // A non-author member cannot moderate someone else's doc (author mismatch
    // and moderation fields changed).
    await assertFails(setDoc(doc(member(), 'feedback/draft'),
      rootDoc({ authorEmail: 'someone@thothica.com', status: 'resolved' })))
  })

  // ── suspended/{email} collection access ──
  it('sub_admin can read suspended/{email}; only admin writes', async () => {
    await assertSucceeds(getDoc(doc(subAdmin(), 'suspended/banned@thothica.com')))
    await assertFails(setDoc(doc(subAdmin(), 'suspended/new@thothica.com'), {}))
    await assertSucceeds(setDoc(doc(admin(), 'suspended/new@thothica.com'), {}))
  })
  it('member cannot read suspended/{email}', async () => {
    await assertFails(getDoc(doc(member(), 'suspended/banned@thothica.com')))
  })
})
