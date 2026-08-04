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
    // A feedback doc authored by the suspended user (to prove they can't even edit own).
    await setDoc(doc(db, 'feedback/banned-doc'), {
      comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'banned@thothica.com', authorName: 'Banned', authorRole: 'allow',
      body: 'before', status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })
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
    // A published root WITH a category, authored by the allowlisted editor —
    // used to prove the author-update branch pins `category`.
    await setDoc(doc(db, 'feedback/cat-doc'), {
      comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'mr.ankitgzb@gmail.com', authorName: 'Ankit', authorRole: 'editor',
      body: 'before', status: 'open', category: 'fact', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })

    // ── Work-allocation seeds ──
    // x@thothica.com is used as a plain MEMBER across the feedback/roles blocks
    // and reads the seeded biographies comic + its version subcollection there.
    // Grant it the biographies line so those existing reads stay green under the
    // new comic/version gate, while it remains a non-moderator for feedback tests.
    await setDoc(doc(db, 'allocations/x@thothica.com'), {
      lines: ['biographies'], figures: ['jrd-tata'], comics: [],
      figures_effective: ['jrd-tata'], updatedBy: 'adnan@thothica.com', updatedAt: '2026-06-03',
    })
    // A dedicated allocated member for the allocation describe block.
    // Granted: line biographies; figure sachin-tendulkar; comic indic__01-ramayana
    // (line indic NOT granted). figures_effective adds dhirubhai-ambani as the
    // subject of the granted comic (UI derives this; rules just read it).
    await setDoc(doc(db, 'allowlist/member@dpb.in'), { role: 'allow' })
    await setDoc(doc(db, 'allocations/member@dpb.in'), {
      lines: ['biographies'], figures: ['sachin-tendulkar'], comics: ['indic__01-ramayana'],
      figures_effective: ['sachin-tendulkar', 'dhirubhai-ambani'],
      updatedBy: 'adnan@thothica.com', updatedAt: '2026-06-03',
    })
    // A member granted ONE comic by id (no raw figure grant). The granted
    // comic's subject (sachin-tendulkar) lands in figures_effective so the
    // figure's RESEARCH is unlocked — but the figure's OTHER comics must stay
    // locked (a comic grant must not cascade to sibling comics).
    await setDoc(doc(db, 'allowlist/comicmember@dpb.in'), { role: 'allow' })
    await setDoc(doc(db, 'allocations/comicmember@dpb.in'), {
      comics: ['biographies__c1'], lines: [], figures: [],
      figures_effective: ['sachin-tendulkar'],
      updatedBy: 'adnan@thothica.com', updatedAt: '2026-06-03',
    })
    // The granted comic + a SIBLING comic with the same subject (NOT granted by id).
    await setDoc(doc(db, 'comics/biographies__c1'), { line: 'biographies', subject_slug: 'sachin-tendulkar', status: 'draft' })
    await setDoc(doc(db, 'comics/biographies__c2'), { line: 'biographies', subject_slug: 'sachin-tendulkar', status: 'draft' })
    // A member granted a whole PROGRAM (series) by program_slug — unlocks every
    // comic + figure with program_slug 'cricket-legends' (current & future) and
    // nothing else. No line/figure/comic grants.
    await setDoc(doc(db, 'allowlist/progmember@dpb.in'), { role: 'allow' })
    await setDoc(doc(db, 'allocations/progmember@dpb.in'), {
      lines: [], figures: [], comics: [], programs: ['cricket-legends'],
      figures_effective: [], updatedBy: 'adnan@thothica.com', updatedAt: '2026-06-30',
    })
    await setDoc(doc(db, 'comics/biographies__cricketc'), { line: 'biographies', subject_slug: 'kapil-dev', program_slug: 'cricket-legends', status: 'draft' })
    await setDoc(doc(db, 'figures/kapil-dev'), { slug: 'kapil-dev', line: 'biographies', program_slug: 'cricket-legends' })
    // A member with NO allocation doc (allowlisted only) → must see no IP.
    await setDoc(doc(db, 'allowlist/noalloc@dpb.in'), { role: 'allow' })
    // Catalog seed docs for allocation assertions.
    await setDoc(doc(db, 'comics/biographies__x'), { line: 'biographies', subject_slug: 'foo', status: 'draft' })
    await setDoc(doc(db, 'comics/indic__01-ramayana'), { line: 'indic', subject_slug: 'ram', status: 'draft' })
    await setDoc(doc(db, 'comics/awareness__y'), { line: 'awareness', subject_slug: 'bar', status: 'draft' })
    await setDoc(doc(db, 'comics/indic__02'), { line: 'indic', subject_slug: 'ram', status: 'draft' })
    await setDoc(doc(db, 'comics/biographies__x/versions/1'), { version: 1, note: 'v' })
    await setDoc(doc(db, 'comics/awareness__y/versions/1'), { version: 1, note: 'v' })
    // Figure docs carry NO line field (matches src/types/content.ts Figure).
    await setDoc(doc(db, 'figures/sachin-tendulkar'), { slug: 'sachin-tendulkar', series: 'cricket' })
    await setDoc(doc(db, 'figures/dhirubhai-ambani'), { slug: 'dhirubhai-ambani', series: 'business' })
    await setDoc(doc(db, 'figures/unrelated'), { slug: 'unrelated', series: 'awareness' })
    await setDoc(doc(db, 'figures/sachin-tendulkar/sources/book-a'), { kind: 'book' })
    await setDoc(doc(db, 'figures/unrelated/sources/book-a'), { kind: 'book' })

    // ── Feedback allocation seeds ──
    // A dedicated published feedback doc on biographies__x (member@dpb.in holds
    // the biographies LINE) — kept separate from feedback/pub, which the roles
    // describe mutates to hidden, so this read stays deterministic.
    await setDoc(doc(db, 'feedback/fb-bio'), {
      comicId: 'biographies__x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'x@thothica.com', authorName: 'X', authorRole: 'allow',
      body: 'bio comment', status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })
    // Published feedback on an awareness comic — member@dpb.in is NOT allocated
    // the awareness line/comic/figure, so they must be DENIED reading it even
    // though it is published. A moderator reads it via the isSubAdmin() bypass.
    await setDoc(doc(db, 'feedback/fb-awareness'), {
      comicId: 'awareness__y', line: 'awareness', parentId: null, anchors: [],
      authorEmail: 'x@thothica.com', authorName: 'X', authorRole: 'allow',
      body: 'awareness comment', status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })
    // Published feedback on biographies__c1 — comicmember@dpb.in holds that comic
    // by id (so may read its feedback) but NOT its sibling biographies__c2.
    await setDoc(doc(db, 'feedback/fb-c1'), {
      comicId: 'biographies__c1', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'x@thothica.com', authorName: 'X', authorRole: 'allow',
      body: 'c1 comment', status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })
    // Published feedback on a sibling comic biographies__c2 — comicmember is NOT
    // granted c2 (a comic grant must not cascade to siblings), so DENIED.
    await setDoc(doc(db, 'feedback/fb-c2'), {
      comicId: 'biographies__c2', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'x@thothica.com', authorName: 'X', authorRole: 'allow',
      body: 'c2 comment', status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null,
    })
    // A DRAFT root authored by member@dpb.in — the author-visibility branch must
    // let the author read their OWN pending comment while other members cannot.
    await setDoc(doc(db, 'feedback/fb-own-draft'), {
      comicId: 'biographies__x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'member@dpb.in', authorName: 'M', authorRole: 'allow',
      body: 'my pending comment', status: 'open', comicVersion: 1, hidden: false, published: false,
      createdAt: '2026-07-01', updatedAt: '2026-07-01', editedAt: null,
    })
    // A moderator-HIDDEN doc authored by member@dpb.in — the author branch must
    // NOT reveal hidden docs, even to their author.
    await setDoc(doc(db, 'feedback/fb-own-hidden'), {
      comicId: 'biographies__x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'member@dpb.in', authorName: 'M', authorRole: 'allow',
      body: 'pruned', status: 'open', comicVersion: 1, hidden: true, published: true,
      createdAt: '2026-07-01', updatedAt: '2026-07-01', editedAt: null,
    })

    // ── Line-grant → figure research seed (#5) ──
    // A figure doc that DOES carry a `line` field (figures now carry line), and a
    // member allocated ONLY that line (no figures_effective entry for it). The
    // line-grant→figure-research branch (previously uncovered) must let them read
    // the figure doc + its sources.
    await setDoc(doc(db, 'figures/bio-line-figure'), { slug: 'bio-line-figure', series: 'business', line: 'biographies' })
    await setDoc(doc(db, 'figures/bio-line-figure/sources/book-a'), { kind: 'book' })
    await setDoc(doc(db, 'allowlist/linemember@dpb.in'), { role: 'allow' })
    await setDoc(doc(db, 'allocations/linemember@dpb.in'), {
      lines: ['biographies'], figures: [], comics: [], figures_effective: [],
      updatedBy: 'adnan@thothica.com', updatedAt: '2026-06-03',
    })

    // ── MediComics open-research figure model seeds ──
    // A medicomics figure flagged openResearch:true (each disease is open
    // research any allowlisted member may read) + one source doc. And a legacy
    // biographies figure with NO openResearch field — the default-false deny
    // must keep it allocation-gated.
    await setDoc(doc(db, 'figures/breast-cancer'), {
      slug: 'breast-cancer', line: 'medicomics', openResearch: true,
      series: 'MediComics', sources_count: 1, words: 1,
    })
    await setDoc(doc(db, 'figures/breast-cancer/sources/s1'), {
      slug: 's1', kind: 'book', title: 'X', words: 1, files: [],
    })
    await setDoc(doc(db, 'figures/legacy-bio'), {
      slug: 'legacy-bio', line: 'biographies', series: 'Y', sources_count: 0, words: 0,
    })
    // AI conversations attached to a medicomics figure: open vs closed, plus a
    // comic-attached one that must stay allocation-gated. noalloc@dpb.in (seeded
    // above, allowlisted with NO allocation) and a member holding the medicomics
    // line exercise the figure branches.
    await setDoc(doc(db, 'allowlist/medmember@dpb.in'), { role: 'allow' })
    await setDoc(doc(db, 'allocations/medmember@dpb.in'), {
      lines: ['medicomics'], figures: [], comics: [], figures_effective: [],
      updatedBy: 'adnan@thothica.com', updatedAt: '2026-06-13',
    })
    await setDoc(doc(db, 'aiConversations/c-open'), {
      attachTo: { kind: 'figure', line: 'medicomics', figureSlug: 'breast-cancer', open: true },
    })
    await setDoc(doc(db, 'aiConversations/c-closed'), {
      attachTo: { kind: 'figure', line: 'medicomics', figureSlug: 'breast-cancer', open: false },
    })
    await setDoc(doc(db, 'aiConversations/c-closed-line'), {
      attachTo: { kind: 'figure', line: 'medicomics', figureSlug: 'breast-cancer', open: false },
    })
    await setDoc(doc(db, 'aiConversations/c-comic'), {
      attachTo: { kind: 'comic', line: 'medicomics', comicSlug: 'x' },
    })

    // ── Idea Drop seeds ──
    // sub@dpb.in (sub_admin) is already seeded above; add a second sub_admin to
    // prove a `private` idea is invisible to a DIFFERENT moderator, and a plain
    // member for recipient/visibility reads.
    await setDoc(doc(db, 'allowlist/sub2@dpb.in'), { role: 'sub_admin' })
    await setDoc(doc(db, 'allowlist/mem@dpb.in'), { role: 'member' })
    const ideaBase = {
      title: 'An idea', bodyMarkdown: 'body', tags: ['x'], status: 'new',
      createdAt: '2026-06-08', updatedAt: '2026-06-08',
    }
    // Authored by sub@dpb.in, visibility private — only author + admin may read.
    await setDoc(doc(db, 'ideas/idea-private'), {
      ...ideaBase, author: 'sub@dpb.in', visibility: 'private', recipients: [],
    })
    await setDoc(doc(db, 'ideas/idea-subadmins'), {
      ...ideaBase, author: 'sub@dpb.in', visibility: 'all_sub_admins', recipients: [],
    })
    await setDoc(doc(db, 'ideas/idea-approved'), {
      ...ideaBase, author: 'sub@dpb.in', visibility: 'all_approved', recipients: [],
    })
    // `specific` idea routed to mem@dpb.in.
    await setDoc(doc(db, 'ideas/idea-specific'), {
      ...ideaBase, author: 'sub@dpb.in', visibility: 'specific', recipients: ['mem@dpb.in'],
    })
    // An idea authored by sub@dpb.in for the update/delete tests.
    await setDoc(doc(db, 'ideas/idea-edit'), {
      ...ideaBase, author: 'sub@dpb.in', visibility: 'private', recipients: [],
    })
    await setDoc(doc(db, 'ideas/idea-del'), {
      ...ideaBase, author: 'sub@dpb.in', visibility: 'private', recipients: [],
    })
    // Idea_reads doc owned by mem@dpb.in (for cross-user denial).
    await setDoc(doc(db, 'idea_reads/mem@dpb.in'), { 'idea-approved': '2026-06-08' })

    // ── ChatGPT share-capture seeds (ideas/{id}/captures/{shareId}) ──
    // Written ONLY by the Admin SDK in production (trigger + sweeper bypass
    // rules); seeded here the same way. Reads must mirror the PARENT idea's
    // read rule; ALL client writes are denied.
    await setDoc(doc(db, 'ideas/idea-private/captures/cap-1'), { status: 'captured', url: 'https://chatgpt.com/share/x' })
    await setDoc(doc(db, 'ideas/idea-subadmins/captures/cap-1'), { status: 'captured', url: 'https://chatgpt.com/share/x' })
    await setDoc(doc(db, 'ideas/idea-approved/captures/cap-1'), { status: 'captured', url: 'https://chatgpt.com/share/x' })
    await setDoc(doc(db, 'ideas/idea-specific/captures/cap-1'), { status: 'captured', url: 'https://chatgpt.com/share/x' })
  })
})
afterAll(async () => { await env.cleanup() })

describe('firestore.rules — catalog', () => {
  it('allowlisted user can read navigation catalog (meta/people)', async () => {
    // meta + people stay isAllowlisted()-only (navigation/structure, no IP).
    const db = env.authenticatedContext('u1', { email: 'x@thothica.com' }).firestore()
    await assertSucceeds(getDoc(doc(db, 'meta/catalog')))
    await assertSucceeds(getDoc(doc(db, 'people/jrd-tata')))
  })
  it('moderator can scan the full comics catalog + a figure sources subcollection', async () => {
    // After work-allocation gating, a FULL comics/sources scan is moderator-only;
    // a plain member must query their allocated subset (covered in the allocation
    // describe block). sub@dpb.in is seeded as a sub_admin → bypasses the gate.
    const db = env.authenticatedContext('mod1', { email: 'sub@dpb.in' }).firestore()
    await assertSucceeds(getDocs(collection(db, 'comics')))
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

  it('allowlisted member can read published feedback (per-comic filtered query)', async () => {
    // A member's real query constrains to a single comicId + published +
    // not-hidden, which the read rule permits when the comic is allocated.
    // (x@thothica.com holds line biographies, so biographies__01-x is allocated.)
    // An unconstrained collection read would now fail — both because of the
    // seeded draft AND because of feedback on non-allocated comics; the member's
    // query is always per-comic, which is why /reviews is moderator-only.
    const q = query(
      collection(allowed(), 'feedback'),
      where('comicId', '==', 'biographies__01-x'),
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
  it('author can edit own body/anchors but cannot mutate category', async () => {
    const db = editor()
    const base = {
      comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'mr.ankitgzb@gmail.com', authorName: 'Ankit', authorRole: 'editor',
      status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-04',
    }
    // Editing body (+ anchors) while keeping category unchanged is allowed.
    await assertSucceeds(setDoc(doc(db, 'feedback/cat-doc'),
      { ...base, body: 'edited', category: 'fact', anchors: [{ kind: 'page', ref: 'p1', page: 1, snapshot: 'Page 1' }], editedAt: '2026-06-04' }))
    // Mutating category is denied.
    await assertFails(setDoc(doc(db, 'feedback/cat-doc'),
      { ...base, body: 'edited', category: 'tone', editedAt: '2026-06-04' }))
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

  // ── Create: replies inherit parent published state ──
  it('member CAN create a published reply under a published root', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...reply } = rootDoc({ parentId: 'pub', published: true })
    await assertSucceeds(setDoc(doc(member(), 'feedback/reply-under-pub'), reply))
  })
  it('member CANNOT create a published reply under a draft root', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...reply } = rootDoc({ parentId: 'draft', published: true })
    await assertFails(setDoc(doc(member(), 'feedback/reply-under-draft'), reply))
  })
  it('member CAN create a draft reply under a draft root', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...reply } = rootDoc({ parentId: 'draft', published: false })
    await assertSucceeds(setDoc(doc(member(), 'feedback/draft-reply-under-draft'), reply))
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
  it('suspended user cannot edit even their own feedback', async () => {
    // the author-update branch is gated on isAllowlisted() (which excludes suspended)
    await assertFails(setDoc(doc(suspended(), 'feedback/banned-doc'), {
      comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
      authorEmail: 'banned@thothica.com', authorName: 'Banned', authorRole: 'allow',
      body: 'edited while suspended', status: 'open', comicVersion: 1, hidden: false, published: true,
      createdAt: '2026-06-03', updatedAt: '2026-06-04', editedAt: '2026-06-04',
    }))
  })
})

describe('firestore.rules — work allocation', () => {
  const member   = () => env.authenticatedContext('al-m', { email: 'member@dpb.in' }).firestore()
  const comicMember = () => env.authenticatedContext('al-cm', { email: 'comicmember@dpb.in' }).firestore()
  const noAlloc  = () => env.authenticatedContext('al-n', { email: 'noalloc@dpb.in' }).firestore()
  const progMember = () => env.authenticatedContext('al-pm', { email: 'progmember@dpb.in' }).firestore()
  const subAdmin = () => env.authenticatedContext('al-sa', { email: 'sub@dpb.in' }).firestore()
  const admin    = () => env.authenticatedContext('al-ad', { email: 'adnan@thothica.com' }).firestore()

  // ── Member comic reads: union of line / comic / figures_effective grants ──
  it('member reads a comic in an allocated LINE (biographies)', async () => {
    await assertSucceeds(getDoc(doc(member(), 'comics/biographies__x')))
  })
  it('member reads a specifically-allocated COMIC even when its line is not granted', async () => {
    // indic line is NOT granted, but indic__01-ramayana is granted by id.
    await assertSucceeds(getDoc(doc(member(), 'comics/indic__01-ramayana')))
  })
  it('member is DENIED a comic outside every grant', async () => {
    await assertFails(getDoc(doc(member(), 'comics/awareness__y')))   // line awareness not granted
    await assertFails(getDoc(doc(member(), 'comics/indic__02')))      // line indic not granted, id not granted
  })
  it('a RAW figure grant unlocks ALL of that figure’s comics', async () => {
    // member@dpb.in has figures:['sachin-tendulkar'] — both sibling comics with
    // that subject are readable (an explicit figure grant cascades to its comics).
    await assertSucceeds(getDoc(doc(member(), 'comics/biographies__c1')))
    await assertSucceeds(getDoc(doc(member(), 'comics/biographies__c2')))
  })

  // ── A COMIC grant must NOT cascade to the figure's SIBLING comics ──
  // comicmember@dpb.in was granted ONLY biographies__c1 by id (figures:[]); the
  // subject sachin-tendulkar is in figures_effective (research follows), but
  // figures_effective must NOT unlock sibling comic biographies__c2.
  it('comic grant unlocks the granted comic but NOT its sibling', async () => {
    await assertSucceeds(getDoc(doc(comicMember(), 'comics/biographies__c1')))   // granted by id
    await assertFails(getDoc(doc(comicMember(), 'comics/biographies__c2')))      // sibling, subject only in figures_effective → DENIED
  })
  it('comic grant DOES unlock the figure’s research (figures_effective)', async () => {
    await assertSucceeds(getDoc(doc(comicMember(), 'figures/sachin-tendulkar')))
    await assertSucceeds(getDoc(doc(comicMember(), 'figures/sachin-tendulkar/sources/book-a')))
  })

  // ── A PROGRAM (series) grant unlocks every comic + figure in that program ──
  it('a program grant unlocks the program’s comics and figures', async () => {
    await assertSucceeds(getDoc(doc(progMember(), 'comics/biographies__cricketc')))
    await assertSucceeds(getDoc(doc(progMember(), 'figures/kapil-dev')))
  })
  it('a program grant does NOT unlock content outside that program', async () => {
    await assertFails(getDoc(doc(progMember(), 'comics/awareness__y')))       // no program_slug match
    await assertFails(getDoc(doc(progMember(), 'figures/dhirubhai-ambani')))  // business series, not cricket-legends
  })

  // ── Version subcollection inherits the parent comic's gate ──
  it('member reads versions of an allocated comic; denied for a non-allocated comic', async () => {
    await assertSucceeds(getDoc(doc(member(), 'comics/biographies__x/versions/1')))
    await assertFails(getDoc(doc(member(), 'comics/awareness__y/versions/1')))
  })

  // ── Figure research reads (gated by slug via figures_effective) ──
  it('member reads research for a granted figure and a figures_effective figure; denied otherwise', async () => {
    await assertSucceeds(getDoc(doc(member(), 'figures/sachin-tendulkar')))   // raw figure grant
    await assertSucceeds(getDoc(doc(member(), 'figures/dhirubhai-ambani')))   // via figures_effective (comic grant)
    await assertFails(getDoc(doc(member(), 'figures/unrelated')))             // not granted
  })
  it('member reads sources of a granted figure; denied for a non-granted figure', async () => {
    await assertSucceeds(getDoc(doc(member(), 'figures/sachin-tendulkar/sources/book-a')))
    await assertFails(getDoc(doc(member(), 'figures/unrelated/sources/book-a')))
  })

  // ── No allocation doc → no IP at all ──
  it('a member with NO allocation doc is denied every comic and figure', async () => {
    await assertFails(getDoc(doc(noAlloc(), 'comics/biographies__x')))
    await assertFails(getDoc(doc(noAlloc(), 'comics/indic__01-ramayana')))
    await assertFails(getDoc(doc(noAlloc(), 'figures/sachin-tendulkar')))
    await assertFails(getDoc(doc(noAlloc(), 'figures/sachin-tendulkar/sources/book-a')))
  })

  // ── Moderators bypass the gate entirely ──
  it('sub_admin reads ALL comics and figures (bypass)', async () => {
    await assertSucceeds(getDoc(doc(subAdmin(), 'comics/awareness__y')))
    await assertSucceeds(getDoc(doc(subAdmin(), 'comics/indic__02')))
    await assertSucceeds(getDoc(doc(subAdmin(), 'figures/unrelated')))
    await assertSucceeds(getDoc(doc(subAdmin(), 'figures/unrelated/sources/book-a')))
  })
  it('admin reads ALL comics and figures (bypass)', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'comics/awareness__y')))
    await assertSucceeds(getDoc(doc(admin(), 'comics/indic__02')))
    await assertSucceeds(getDoc(doc(admin(), 'figures/unrelated')))
  })

  // ── allocations/{email} access control ──
  it('member reads OWN allocation doc; denied someone else’s', async () => {
    await assertSucceeds(getDoc(doc(member(), 'allocations/member@dpb.in')))
    await assertFails(getDoc(doc(member(), 'allocations/x@thothica.com')))
  })
  it('a non-admin cannot write an allocation; admin can', async () => {
    await assertFails(setDoc(doc(member(), 'allocations/member@dpb.in'),
      { lines: ['indic'], figures: [], comics: [], figures_effective: [] }))
    await assertFails(setDoc(doc(subAdmin(), 'allocations/member@dpb.in'),
      { lines: ['indic'], figures: [], comics: [], figures_effective: [] }))
    await assertSucceeds(setDoc(doc(admin(), 'allocations/member@dpb.in'),
      { lines: ['biographies'], figures: ['sachin-tendulkar'], comics: ['indic__01-ramayana'],
        figures_effective: ['sachin-tendulkar', 'dhirubhai-ambani'],
        updatedBy: 'adnan@thothica.com', updatedAt: '2026-06-03' }))
  })

  // ── Line-grant → figure research (#5; previously uncovered) ──
  it('member allocated ONLY a line can read that line’s figure doc + sources', async () => {
    const ctx = env.authenticatedContext('al-line', { email: 'linemember@dpb.in' }).firestore()
    // figures/bio-line-figure carries line:'biographies'; the member holds only
    // lines:['biographies'] (no figures_effective entry) → the line branch unlocks it.
    await assertSucceeds(getDoc(doc(ctx, 'figures/bio-line-figure')))
    await assertSucceeds(getDoc(doc(ctx, 'figures/bio-line-figure/sources/book-a')))
  })
})

describe('firestore.rules — medicomics open-research figures', () => {
  // noalloc@dpb.in: allowlisted, NO allocation doc → the open-research baseline.
  // medmember@dpb.in: allowlisted, holds ONLY the medicomics line.
  // sub@dpb.in: sub_admin (bypass). Plus an unauth context.
  const noAlloc   = () => env.authenticatedContext('mc-n', { email: 'noalloc@dpb.in' }).firestore()
  const medMember = () => env.authenticatedContext('mc-line', { email: 'medmember@dpb.in' }).firestore()
  const signedOut = () => env.unauthenticatedContext().firestore()

  // ── figures + sources ──
  it('a NO-allocation allowlisted member reads an openResearch figure doc + its source', async () => {
    await assertSucceeds(getDoc(doc(noAlloc(), 'figures/breast-cancer')))
    await assertSucceeds(getDoc(doc(noAlloc(), 'figures/breast-cancer/sources/s1')))
  })
  it('a non-allocated member is DENIED a figure with NO openResearch field (default-false deny)', async () => {
    // legacy-bio carries line:'biographies' but no openResearch → biographies stays
    // allocation-gated, and noalloc holds no allocation.
    await assertFails(getDoc(doc(noAlloc(), 'figures/legacy-bio')))
  })

  // ── aiConversations ──
  it('any allowlisted member reads a figure conversation flagged open:true', async () => {
    await assertSucceeds(getDoc(doc(noAlloc(), 'aiConversations/c-open')))
  })
  it('a non-allocated member is DENIED a closed figure conversation', async () => {
    await assertFails(getDoc(doc(noAlloc(), 'aiConversations/c-closed')))
  })
  it('a member holding the medicomics LINE reads a closed figure conversation', async () => {
    await assertSucceeds(getDoc(doc(medMember(), 'aiConversations/c-closed-line')))
  })
  it('a non-allocated member is DENIED a comic-attached conversation (stays gated)', async () => {
    await assertFails(getDoc(doc(noAlloc(), 'aiConversations/c-comic')))
  })
  it('unauth is denied every figure / conversation read', async () => {
    await assertFails(getDoc(doc(signedOut(), 'figures/breast-cancer')))
    await assertFails(getDoc(doc(signedOut(), 'figures/breast-cancer/sources/s1')))
    await assertFails(getDoc(doc(signedOut(), 'aiConversations/c-open')))
    await assertFails(getDoc(doc(signedOut(), 'aiConversations/c-closed')))
    await assertFails(getDoc(doc(signedOut(), 'aiConversations/c-comic')))
  })
})

describe('firestore.rules — feedback allocation gate', () => {
  // member@dpb.in: lines ['biographies'], figures ['sachin-tendulkar'],
  //   comics ['indic__01-ramayana'] — so biographies feedback is line-allocated.
  // comicmember@dpb.in: comics ['biographies__c1'] only (no line/figure grant).
  const member      = () => env.authenticatedContext('fb-m', { email: 'member@dpb.in' }).firestore()
  const comicMember = () => env.authenticatedContext('fb-cm', { email: 'comicmember@dpb.in' }).firestore()
  const progMember  = () => env.authenticatedContext('fb-pm', { email: 'progmember@dpb.in' }).firestore()
  const subAdmin    = () => env.authenticatedContext('fb-sa', { email: 'sub@dpb.in' }).firestore()

  const fbDoc = (over = {}) => ({
    comicId: 'biographies__01-x', line: 'biographies', parentId: null, anchors: [],
    authorEmail: 'member@dpb.in', authorName: 'M', authorRole: 'allow',
    body: 'hi', status: 'open', comicVersion: 1, hidden: false, published: false,
    createdAt: '2026-06-03', updatedAt: '2026-06-03', editedAt: null, ...over,
  })

  // ── READ ──
  it('member allocated comic X can read X’s published feedback', async () => {
    // fb-bio is on biographies__x, inside the allocated biographies line.
    await assertSucceeds(getDoc(doc(member(), 'feedback/fb-bio')))
  })
  it('member NOT allocated comic X is DENIED reading X’s feedback (even published)', async () => {
    // awareness__y is outside every grant for member@dpb.in.
    await assertFails(getDoc(doc(member(), 'feedback/fb-awareness')))
  })
  it('a single-comic grant reads that comic’s feedback but NOT a sibling’s', async () => {
    // comicmember holds biographies__c1 by id; c2 is a sibling (subject only in
    // figures_effective) → its feedback must stay denied.
    await assertSucceeds(getDoc(doc(comicMember(), 'feedback/fb-c1')))
    await assertFails(getDoc(doc(comicMember(), 'feedback/fb-c2')))
  })
  it('moderator reads any feedback (bypass)', async () => {
    await assertSucceeds(getDoc(doc(subAdmin(), 'feedback/fb-awareness')))
    await assertSucceeds(getDoc(doc(subAdmin(), 'feedback/fb-c2')))
  })

  // ── CREATE ──
  it('member allocated comic X can CREATE feedback on X', async () => {
    await assertSucceeds(setDoc(doc(member(), 'feedback/fb-create-ok'), fbDoc()))
  })
  it('member NOT allocated a comic cannot create feedback on it', async () => {
    await assertFails(setDoc(doc(member(), 'feedback/fb-create-bad'),
      fbDoc({ comicId: 'awareness__y', line: 'awareness' })))
  })
  it('single-comic-grant member cannot create feedback on a sibling comic', async () => {
    await assertFails(setDoc(doc(comicMember(), 'feedback/fb-create-sib'),
      fbDoc({ comicId: 'biographies__c2', authorEmail: 'comicmember@dpb.in' })))
  })
  it('moderator can create feedback on any comic (bypass)', async () => {
    await assertSucceeds(setDoc(doc(subAdmin(), 'feedback/fb-create-mod'),
      fbDoc({ comicId: 'awareness__y', line: 'awareness', authorEmail: 'sub@dpb.in', published: true })))
  })
  it('a PROGRAM-granted member can create feedback on a program comic; denied outside it', async () => {
    // progmember@dpb.in holds only programs:['cricket-legends'];
    // biographies__cricketc carries that program_slug, awareness__y does not.
    await assertSucceeds(setDoc(doc(progMember(), 'feedback/fb-create-prog'),
      fbDoc({ comicId: 'biographies__cricketc', authorEmail: 'progmember@dpb.in' })))
    await assertFails(setDoc(doc(progMember(), 'feedback/fb-create-prog-bad'),
      fbDoc({ comicId: 'awareness__y', line: 'awareness', authorEmail: 'progmember@dpb.in' })))
  })

  // ── Author visibility (own drafts) ──
  it('an author reads their OWN draft; another member cannot', async () => {
    await assertSucceeds(getDoc(doc(member(), 'feedback/fb-own-draft')))
    await assertFails(getDoc(doc(comicMember(), 'feedback/fb-own-draft')))
  })
  it('an author cannot read their own moderator-hidden comment', async () => {
    await assertFails(getDoc(doc(member(), 'feedback/fb-own-hidden')))
  })
  it('the member own-comments list query (comicId + authorEmail + !hidden) is accepted', async () => {
    await assertSucceeds(getDocs(query(
      collection(member(), 'feedback'),
      where('comicId', '==', 'biographies__x'),
      where('authorEmail', '==', 'member@dpb.in'),
      where('hidden', '==', false),
    )))
  })
})

describe('firestore.rules — ideas & idea_reads', () => {
  const admin    = () => env.authenticatedContext('id-ad', { email: 'adnan@thothica.com' }).firestore()
  const subAdmin = () => env.authenticatedContext('id-sa', { email: 'sub@dpb.in' }).firestore()
  const subAdmin2 = () => env.authenticatedContext('id-sa2', { email: 'sub2@dpb.in' }).firestore()
  const member   = () => env.authenticatedContext('id-m', { email: 'mem@dpb.in' }).firestore()
  const signedOut = () => env.unauthenticatedContext().firestore()

  // Defaults mirror the seeded `idea-*` docs (tags ['x'], status 'new', private)
  // so an author-update that changes only bodyMarkdown keeps every frozen field
  // (status/tags/visibility/recipients/author) byte-identical to the stored doc.
  const ideaDoc = (over = {}) => ({
    title: 'An idea', bodyMarkdown: 'b', tags: ['x'], status: 'new',
    author: 'sub@dpb.in', visibility: 'private', recipients: [],
    createdAt: '2026-06-08', updatedAt: '2026-06-08', ...over,
  })

  // ── CREATE ──
  it('admin can create an idea (author == self)', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'ideas/c-admin'),
      ideaDoc({ author: 'adnan@thothica.com' })))
  })
  it('sub_admin can create an idea (author == self)', async () => {
    await assertSucceeds(setDoc(doc(subAdmin(), 'ideas/c-sub'), ideaDoc({ author: 'sub@dpb.in' })))
  })
  it('member CANNOT create an idea', async () => {
    await assertFails(setDoc(doc(member(), 'ideas/c-mem'), ideaDoc({ author: 'mem@dpb.in' })))
  })
  it('signed-out CANNOT create an idea', async () => {
    await assertFails(setDoc(doc(signedOut(), 'ideas/c-out'), ideaDoc()))
  })
  it('create with author != self is denied', async () => {
    await assertFails(setDoc(doc(subAdmin(), 'ideas/c-forge'), ideaDoc({ author: 'someone@dpb.in' })))
  })

  // ── READ: private ──
  it('author can read own private idea; admin can; other sub_admin + member cannot', async () => {
    await assertSucceeds(getDoc(doc(subAdmin(), 'ideas/idea-private')))   // author
    await assertSucceeds(getDoc(doc(admin(), 'ideas/idea-private')))      // admin
    await assertFails(getDoc(doc(subAdmin2(), 'ideas/idea-private')))     // other moderator
    await assertFails(getDoc(doc(member(), 'ideas/idea-private')))        // member
  })

  // ── READ: all_sub_admins ──
  it('all_sub_admins idea: sub_admin ✅, admin ✅, member ❌', async () => {
    await assertSucceeds(getDoc(doc(subAdmin2(), 'ideas/idea-subadmins')))
    await assertSucceeds(getDoc(doc(admin(), 'ideas/idea-subadmins')))
    await assertFails(getDoc(doc(member(), 'ideas/idea-subadmins')))
  })

  // ── READ: all_approved ──
  it('all_approved idea: member ✅, sub_admin ✅', async () => {
    await assertSucceeds(getDoc(doc(member(), 'ideas/idea-approved')))
    await assertSucceeds(getDoc(doc(subAdmin2(), 'ideas/idea-approved')))
  })

  // ── READ: specific ──
  it('specific idea: a recipient ✅, a non-recipient ❌ (admin still ✅)', async () => {
    await assertSucceeds(getDoc(doc(member(), 'ideas/idea-specific')))     // mem is a recipient
    await assertFails(getDoc(doc(subAdmin2(), 'ideas/idea-specific')))     // not a recipient, not author/admin
    await assertSucceeds(getDoc(doc(admin(), 'ideas/idea-specific')))      // admin
  })

  // ── UPDATE ──
  it('author may change bodyMarkdown', async () => {
    await assertSucceeds(setDoc(doc(subAdmin(), 'ideas/idea-edit'),
      ideaDoc({ author: 'sub@dpb.in', bodyMarkdown: 'edited' })))
  })
  it('author CANNOT change status', async () => {
    await assertFails(setDoc(doc(subAdmin(), 'ideas/idea-edit'),
      ideaDoc({ author: 'sub@dpb.in', status: 'shipped' })))
  })
  it('admin CAN change status', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'ideas/idea-edit'),
      ideaDoc({ author: 'sub@dpb.in', status: 'shipped' })))
  })

  // ── DELETE ──
  it('author can delete; admin can delete; unrelated member cannot', async () => {
    await assertFails(deleteDoc(doc(member(), 'ideas/idea-del')))         // unrelated
    await assertSucceeds(deleteDoc(doc(subAdmin(), 'ideas/idea-del')))    // author
  })
  it('admin can delete an idea', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'ideas/idea-del2'),
        ideaDoc({ author: 'sub@dpb.in' }))
    })
    await assertSucceeds(deleteDoc(doc(admin(), 'ideas/idea-del2')))
  })

  // ── idea_reads/{email} ──
  it('idea_reads: owner reads + writes own; another user cannot', async () => {
    await assertSucceeds(getDoc(doc(member(), 'idea_reads/mem@dpb.in')))
    await assertSucceeds(setDoc(doc(member(), 'idea_reads/mem@dpb.in'), { 'idea-x': '2026-06-08' }))
    await assertFails(getDoc(doc(subAdmin(), 'idea_reads/mem@dpb.in')))
    await assertFails(setDoc(doc(subAdmin(), 'idea_reads/mem@dpb.in'), { 'idea-x': '2026-06-08' }))
  })

  // ── LIST-query safety (critical) ──
  it('member: recipients array-contains me list query is accepted', async () => {
    const q = query(collection(member(), 'ideas'), where('recipients', 'array-contains', 'mem@dpb.in'))
    await assertSucceeds(getDocs(q))
  })
  it('member: visibility == all_approved list query is accepted', async () => {
    const q = query(collection(member(), 'ideas'), where('visibility', '==', 'all_approved'))
    await assertSucceeds(getDocs(q))
  })
  it('member: visibility == all_sub_admins list query is DENIED', async () => {
    const q = query(collection(member(), 'ideas'), where('visibility', '==', 'all_sub_admins'))
    await assertFails(getDocs(q))
  })
})

describe('firestore.rules — idea captures subcollection', () => {
  // All four seeded ideas are authored by sub@dpb.in. sub2@dpb.in is a second
  // sub_admin (NOT the author); mem@dpb.in is a plain member and the sole
  // recipient of idea-specific. Each idea carries captures/cap-1.
  const admin     = () => env.authenticatedContext('cap-ad', { email: 'adnan@thothica.com' }).firestore()
  const author    = () => env.authenticatedContext('cap-au', { email: 'sub@dpb.in' }).firestore()
  const subAdmin2 = () => env.authenticatedContext('cap-sa2', { email: 'sub2@dpb.in' }).firestore()
  const member    = () => env.authenticatedContext('cap-m', { email: 'mem@dpb.in' }).firestore()

  // ── READ mirrors the PARENT idea's read rule ──
  it('admin reads a private idea’s capture', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'ideas/idea-private/captures/cap-1')))
  })
  it('the idea author reads own private idea’s capture; a plain member cannot', async () => {
    await assertSucceeds(getDoc(doc(author(), 'ideas/idea-private/captures/cap-1')))
    await assertFails(getDoc(doc(member(), 'ideas/idea-private/captures/cap-1')))
  })
  it('all_sub_admins idea capture: sub_admin ✅, plain member ❌', async () => {
    await assertSucceeds(getDoc(doc(subAdmin2(), 'ideas/idea-subadmins/captures/cap-1')))
    await assertFails(getDoc(doc(member(), 'ideas/idea-subadmins/captures/cap-1')))
  })
  it('all_approved idea capture: member reads it', async () => {
    await assertSucceeds(getDoc(doc(member(), 'ideas/idea-approved/captures/cap-1')))
  })
  it('specific idea capture: the named recipient ✅, a non-recipient ❌', async () => {
    await assertSucceeds(getDoc(doc(member(), 'ideas/idea-specific/captures/cap-1')))     // mem is a recipient
    await assertFails(getDoc(doc(subAdmin2(), 'ideas/idea-specific/captures/cap-1')))     // not recipient/author/admin
  })

  // ── WRITE: denied for EVERY client, including the admin (Admin SDK only) ──
  it('no client may write a capture — not even the admin', async () => {
    const cap = { status: 'captured', url: 'https://chatgpt.com/share/x' }
    await assertFails(setDoc(doc(admin(), 'ideas/idea-approved/captures/cap-new'), cap))
    await assertFails(setDoc(doc(author(), 'ideas/idea-private/captures/cap-new'), cap))
    await assertFails(setDoc(doc(member(), 'ideas/idea-approved/captures/cap-new'), cap))
    // Overwriting an existing capture is also denied.
    await assertFails(setDoc(doc(admin(), 'ideas/idea-approved/captures/cap-1'), cap))
  })

  // ── LIST: the UI live-queries the whole subcollection of a readable idea ──
  it('member LIST-queries an all_approved idea’s captures', async () => {
    await assertSucceeds(getDocs(collection(member(), 'ideas/idea-approved/captures')))
  })
})

describe('firestore.rules — access gate self-checks', () => {
  // The (authed) layout's useAllowStatus runs, for EVERY signed-in non-admin
  // user, Promise.all([getDoc(suspended/{email}), getDoc(allowlist/{email})]).
  // If EITHER read is denied, the Promise.all rejects and the gate fails closed
  // to /pending. So a plain member MUST be able to read its OWN suspended doc
  // (absent → "not suspended") and its OWN allowlist doc — otherwise a correctly
  // allowlisted member is wrongly bounced to the "Access pending" screen.
  const domainMember = () => env.authenticatedContext('gate-d', { email: 'member@dpb.in' }).firestore()
  const gmailMember  = () => env.authenticatedContext('gate-g', { email: 'mr.ankitgzb@gmail.com' }).firestore()

  it('a domain member can read its OWN suspended doc (absent → not suspended)', async () => {
    await assertSucceeds(getDoc(doc(domainMember(), 'suspended/member@dpb.in')))
  })
  it('an allowlisted gmail member can read its OWN suspended doc', async () => {
    await assertSucceeds(getDoc(doc(gmailMember(), 'suspended/mr.ankitgzb@gmail.com')))
  })
  it('a member can read its OWN allowlist doc', async () => {
    await assertSucceeds(getDoc(doc(domainMember(), 'allowlist/member@dpb.in')))
  })
  it("a member still CANNOT read someone ELSE's suspended doc", async () => {
    await assertFails(getDoc(doc(domainMember(), 'suspended/banned@thothica.com')))
  })
})

describe('firestore.rules — pricing (what a page is worth)', () => {
  const member   = () => env.authenticatedContext('pr-m', { email: 'x@thothica.com' }).firestore()
  const subAdmin = () => env.authenticatedContext('pr-sa', { email: 'sub@dpb.in' }).firestore()
  const stranger = () => env.authenticatedContext('pr-s', { email: 'nope@gmail.com' }).firestore()

  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'pricing/config'), { defaultRatePerPage: 250, lines: {}, comics: {} })
    })
  })

  it('an allowlisted member READS the rates (the status table shows value to everyone)', async () => {
    await assertSucceeds(getDoc(doc(member(), 'pricing/config')))
  })
  it('a stranger cannot read the rates', async () => {
    await assertFails(getDoc(doc(stranger(), 'pricing/config')))
  })
  it('a plain member cannot WRITE rates — commercial terms are admin-side only', async () => {
    await assertFails(setDoc(doc(member(), 'pricing/config'), { defaultRatePerPage: 1 }, { merge: true }))
  })
  it('a sub_admin sets rates', async () => {
    await assertSucceeds(setDoc(doc(subAdmin(), 'pricing/config'), { defaultRatePerPage: 300 }, { merge: true }))
  })
})

describe('firestore.rules — accounts (the advances ledger)', () => {
  const member   = () => env.authenticatedContext('ac-m', { email: 'x@thothica.com' }).firestore()
  const subAdmin = () => env.authenticatedContext('ac-sa', { email: 'sub@dpb.in' }).firestore()
  const stranger = () => env.authenticatedContext('ac-s', { email: 'nope@gmail.com' }).firestore()

  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'accounts/advances'), {
        items: [{ id: 'a1', date: '2026-05-13', company: 'X', amount: 100, tdsDeducted: false }],
      })
    })
  })

  it('an allowlisted member READS the ledger (the Accounts tab shows it)', async () => {
    await assertSucceeds(getDoc(doc(member(), 'accounts/advances')))
  })
  it('a stranger cannot read the ledger', async () => {
    await assertFails(getDoc(doc(stranger(), 'accounts/advances')))
  })
  it('a plain member cannot WRITE the ledger — it is our bank record', async () => {
    await assertFails(setDoc(doc(member(), 'accounts/advances'), { items: [] }, { merge: true }))
  })
  it('a sub_admin records a receipt', async () => {
    await assertSucceeds(setDoc(doc(subAdmin(), 'accounts/advances'), { items: [] }, { merge: true }))
  })
})

describe('firestore.rules — diamondApprovals (the sign-off ledger)', () => {
  // member@dpb.in is domain-allowed with NO allowlist role doc: pure "Diamond".
  const diamond  = () => env.authenticatedContext('da-d', { email: 'member@dpb.in' }).firestore()
  const member   = () => env.authenticatedContext('da-m', { email: 'x@thothica.com' }).firestore()
  const subAdmin = () => env.authenticatedContext('da-sa', { email: 'sub@dpb.in' }).firestore()
  const stranger = () => env.authenticatedContext('da-s', { email: 'nope@gmail.com' }).firestore()
  const suspendedDiamond = () => env.authenticatedContext('da-x', { email: 'banned@dpb.in' }).firestore()
  // viewer@dpb.in has an allowlist doc with role 'viewer': the read-everything,
  // act-on-nothing role — a Diamond address that must NOT be able to approve.
  const viewer   = () => env.authenticatedContext('da-v', { email: 'viewer@dpb.in' }).firestore()

  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'diamondApprovals/biographies__seeded'), {
        stages: { script: { by: 'e@dpb.in', at: '2026-08-04T00:00:00Z' } },
      })
      await setDoc(doc(db, 'suspended/banned@dpb.in'), {})
      await setDoc(doc(db, 'allowlist/viewer@dpb.in'), { role: 'viewer' })
    })
  })

  it('any allowlisted member READS the ledger (the table shows approval state to all)', async () => {
    await assertSucceeds(getDoc(doc(member(), 'diamondApprovals/biographies__seeded')))
    await assertSucceeds(getDocs(collection(member(), 'diamondApprovals')))
  })
  it('a stranger cannot read the ledger', async () => {
    await assertFails(getDoc(doc(stranger(), 'diamondApprovals/biographies__seeded')))
  })
  it('a VIEWER at @dpb.in reads the ledger but cannot approve — read-everything, act-on-nothing', async () => {
    await assertSucceeds(getDoc(doc(viewer(), 'diamondApprovals/biographies__seeded')))
    await assertFails(
      setDoc(
        doc(viewer(), 'diamondApprovals/biographies__seeded'),
        { stages: { covers: { by: 'viewer@dpb.in', at: '2026-08-04T00:00:00Z' } } },
        { merge: true },
      ),
    )
    await assertFails(
      setDoc(
        doc(viewer(), 'diamondApprovals/biographies__seeded'),
        { invoice: { approved: { by: 'viewer@dpb.in', at: '2026-08-04T00:00:00Z' } } },
        { merge: true },
      ),
    )
  })
  // Approvals are PER STAGE: the doc holds a `stages` map, merge-written one
  // stage at a time so two people signing off different stages of the same book
  // cannot overwrite each other.
  const stagePatch = (stage: string, by: string) => ({
    stages: { [stage]: { by, at: '2026-08-04T00:00:00Z' } }, updatedBy: by, updatedAt: '2026-08-04T00:00:00Z',
  })

  it('Diamond (@dpb.in) approves ONE stage', async () => {
    await assertSucceeds(
      setDoc(doc(diamond(), 'diamondApprovals/biographies__01-x'), stagePatch('illustration', 'member@dpb.in'), { merge: true }),
    )
  })
  it('Diamond approves a second stage without disturbing the first (merge)', async () => {
    await assertSucceeds(
      setDoc(doc(diamond(), 'diamondApprovals/biographies__01-x'), stagePatch('covers', 'member@dpb.in'), { merge: true }),
    )
  })
  it('Diamond withdraws a stage by rewriting the surviving map', async () => {
    await assertSucceeds(
      setDoc(doc(diamond(), 'diamondApprovals/biographies__seeded'), { stages: {}, updatedBy: 'member@dpb.in', updatedAt: 'now' }, { merge: true }),
    )
  })
  it('a sub_admin can also act (fixing a mis-click from our side)', async () => {
    await assertSucceeds(
      setDoc(doc(subAdmin(), 'diamondApprovals/biographies__sa'), stagePatch('script', 'sub@dpb.in'), { merge: true }),
    )
  })
  it('a plain member cannot touch the ledger', async () => {
    await assertFails(
      setDoc(doc(member(), 'diamondApprovals/biographies__01-x'), stagePatch('script', 'x@thothica.com'), { merge: true }),
    )
  })
  it('a suspended @dpb.in account cannot approve', async () => {
    await assertFails(
      setDoc(doc(suspendedDiamond(), 'diamondApprovals/biographies__01-x'), stagePatch('script', 'banned@dpb.in'), { merge: true }),
    )
  })
})
