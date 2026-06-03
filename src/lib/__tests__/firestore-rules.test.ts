import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment, type RulesTestEnvironment,
  assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'

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
