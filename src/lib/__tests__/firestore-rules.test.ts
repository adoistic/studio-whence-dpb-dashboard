import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment, type RulesTestEnvironment,
  assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'

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
      body: 'Fix dates.', status: 'open', comicVersion: 1, hidden: false,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })
    await setDoc(doc(db, 'comics/biographies__01-x/versions/1'), { version: 1, date: '2026-05-29', note: 'init' })
    // mr.ankitgzb@gmail.com is a gmail (not domain-allowed): allowlist it so editor() tests are authorized.
    await setDoc(doc(db, 'allowlist/mr.ankitgzb@gmail.com'), { role: 'editor' })
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
    body: 'hi', status: 'open', comicVersion: 1, hidden: false,
    createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null, ...over,
  })
  // (mr.ankitgzb@gmail.com is allowlisted in the beforeAll seed block above.)

  it('allowlisted user can read the feedback collection', async () => {
    await assertSucceeds(getDocs(collection(allowed(), 'feedback')))
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
    const { status, ...reply } = rootDoc({ parentId: 'root-ankit' })
    await assertSucceeds(setDoc(doc(allowed(), 'feedback/reply1'), reply))
  })
  it('cannot create a hidden comment', async () => {
    await assertFails(setDoc(doc(allowed(), 'feedback/h'), rootDoc({ hidden: true })))
  })
  it('author edits own body but cannot self-resolve', async () => {
    const db = editor()
    await assertSucceeds(setDoc(doc(db, 'feedback/root-ankit'),
      { ...rootDoc({ authorEmail: 'mr.ankitgzb@gmail.com', authorRole: 'editor' }), body: 'edited', editedAt: '2026-06-04' }))
    await assertFails(setDoc(doc(db, 'feedback/root-ankit'),
      { ...rootDoc({ authorEmail: 'mr.ankitgzb@gmail.com', authorRole: 'editor' }), status: 'resolved' }))
  })
  it('admin can resolve and hide', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'feedback/root-ankit'),
      { ...rootDoc({ authorEmail: 'mr.ankitgzb@gmail.com' }), status: 'resolved', hidden: true }))
  })
  it('author deletes own; admin can delete', async () => {
    await assertSucceeds(deleteDoc(doc(admin(), 'feedback/reply1')))
  })
  it('versions subcollection: allowlisted reads, nobody writes via client', async () => {
    await assertSucceeds(getDoc(doc(allowed(), 'comics/biographies__01-x/versions/1')))
    await assertFails(setDoc(doc(allowed(), 'comics/biographies__01-x/versions/1'), { version: 1 }))
  })
})
