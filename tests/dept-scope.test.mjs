// Run: node --test tests/*.test.mjs
// Tests the manager dept-scope logic exactly as shipped: the code between
// @scope-core-start / @scope-core-end (plus DEPTS and GROUPS) is extracted
// from index.html and evaluated here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const grab = (re, what) => { const m = html.match(re); assert.ok(m, `${what} not found in index.html`); return m[0] }
const src = [
  grab(/const DEPTS=\[[^\]]*\];/, 'DEPTS'),
  grab(/const GROUPS=\[[\s\S]*?\n\];/, 'GROUPS'),
  grab(/\/\/ @scope-core-start[\s\S]*?\/\/ @scope-core-end/, 'scope core'),
].join('\n')
const S = new Function(`${src}
return { GENERAL_DEPT, scopeExpandTag, scopeTags, scopeBuild, scopeCanSee, scopeCanEdit, scopeVisibleFolderIds }`)()

const scope = (...tags) => S.scopeBuild(tags)
const see = (sc, v, all) => S.scopeCanSee(sc, v, all)
const edit = (sc, v) => S.scopeCanEdit(sc, v)

test('full access (null scope) sees and edits everything', () => {
  assert.equal(see(null, 'אלן קאר'), true)
  assert.equal(see(null, ''), true)
  assert.equal(edit(null, 'all'), true)
  assert.equal(edit(null, []), true)
})

test('tags parse from arrays, JSON strings and comma lists', () => {
  assert.deepEqual(S.scopeTags(['א', ' ב ']), ['א', 'ב'])
  assert.deepEqual(S.scopeTags('["כללית אקטיב","מאוחדת"]'), ['כללית אקטיב', 'מאוחדת'])
  assert.deepEqual(S.scopeTags('כללית אקטיב,עובדים בריא, לאומית FIT'), ['כללית אקטיב', 'עובדים בריא', 'לאומית FIT'])
  assert.deepEqual(S.scopeTags(''), [])
  assert.deepEqual(S.scopeTags(null), [])
})

test('group key expands to its depts', () => {
  assert.deepEqual([...scope('מובמנט')].sort(), ['כללית אקטיב', 'לאומית FIT', 'מעוף לעמית', 'מעוף לעמית מכירות', 'עובדים בריא'].sort())
  assert.deepEqual([...scope('סחר')], ['מחלקת סחר'])
  assert.equal(S.scopeExpandTag('all'), null)
  assert.equal(S.scopeExpandTag('כולם'), null)
})

test('single-dept manager: sees own dept only', () => {
  const sc = scope('כללית אקטיב')
  assert.equal(see(sc, 'כללית אקטיב'), true)
  assert.equal(see(sc, 'עובדים בריא'), false)
  assert.equal(see(sc, 'אלן קאר'), false)
  assert.equal(see(sc, 'פריפיט שירות'), false)
})

test('כללי is visible/editable only when assigned', () => {
  assert.equal(see(scope('כללית אקטיב'), 'כללי'), false)
  assert.equal(edit(scope('כללית אקטיב'), 'כללי'), false)
  assert.equal(see(scope('כללית אקטיב', 'כללי'), 'כללי'), true)
  assert.equal(edit(scope('כללית אקטיב', 'כללי'), 'כללי'), true)
})

test('group-wide item: visible to a partial manager, editable only with the whole group', () => {
  const partial = scope('כללית אקטיב')
  assert.equal(see(partial, 'מובמנט'), true)
  assert.equal(edit(partial, 'מובמנט'), false)
  const whole = scope('מובמנט')
  assert.equal(edit(whole, 'מובמנט'), true)
  assert.equal(edit(whole, 'כללית אקטיב'), true)
  // all five depts picked one by one == the group
  const fivePicked = scope('כללית אקטיב', 'עובדים בריא', 'מעוף לעמית', 'מעוף לעמית מכירות', 'לאומית FIT')
  assert.equal(edit(fivePicked, 'מובמנט'), true)
})

test('multi-dept item (briefing doc / test)', () => {
  const sc = scope('כללית אקטיב')
  const doc = 'כללית אקטיב,עובדים בריא,מעוף לעמית,לאומית FIT'
  assert.equal(see(sc, doc), true)        // touches my dept
  assert.equal(edit(sc, doc), false)      // also other depts
  assert.equal(see(sc, '["פריפיט שירות"]'), false)
  assert.equal(edit(scope('מובמנט'), doc), true)
})

test('for-everyone items: visible, never editable by a scoped manager', () => {
  const sc = scope('אלן קאר')
  assert.equal(see(sc, 'all'), true)          // briefing doc dept 'all'
  assert.equal(edit(sc, 'all'), false)
  assert.equal(see(sc, [], true), true)       // test with no targetDepts
  assert.equal(see(sc, [], false), false)     // agent with no depts
  assert.equal(edit(sc, []), false)           // publishing to "everyone"
})

test('unknown / other tags stay hidden (e.g. discipline dept "מנהל")', () => {
  assert.equal(see(scope('מובמנט', 'כללי'), 'מנהל'), false)
})

test('agent visibility by depts array', () => {
  const sc = scope('מאוחדת')
  assert.equal(see(sc, ['מאוחדת']), true)
  assert.equal(see(sc, ['מעוף לעמית מכירות']), false)
  assert.equal(see(sc, ['מעוף לעמית מכירות', 'מאוחדת']), true)
  assert.equal(edit(sc, ['מעוף לעמית מכירות', 'מאוחדת']), false) // shared agent
})

test('folders: own dept, holders of visible articles, and their ancestors', () => {
  const folders = [
    { id: 'mov', name: 'מובמנט', parent_id: null, dept: 'מובמנט' },
    { id: 'ca', name: 'כללית אקטיב', parent_id: 'mov', dept: 'כללית אקטיב' },
    { id: 'ca-links', name: 'קישורים', parent_id: 'ca', dept: 'כללית אקטיב' },
    { id: 'wb', name: 'עובדים בריא', parent_id: 'mov', dept: 'עובדים בריא' },
    { id: 'ff', name: 'FREEFIT', parent_id: null, dept: 'פריפיט' },
    { id: 'ff-srv', name: 'שירות', parent_id: 'ff', dept: 'פריפיט שירות' },
    { id: 'fix', name: 'תיקוני תשובות AI', parent_id: null, dept: null },
  ]
  const ids = (sc, arts) => [...S.scopeVisibleFolderIds(sc, folders, arts)].sort()

  // כללית אקטיב manager: own folders + parent 'מובמנט' (group folder is visible to partial manager anyway)
  assert.deepEqual(ids(scope('כללית אקטיב'), []), ['ca', 'ca-links', 'mov'].sort())
  // Allen Carr manager: Allen Carr articles filed under FREEFIT › שירות → that path only
  assert.deepEqual(ids(scope('אלן קאר'), [{ id: 'a1', folder_id: 'ff-srv', dept: 'אלן קאר' }]), ['ff', 'ff-srv'].sort())
  // undeptted folder shows only through its articles
  assert.deepEqual(ids(scope('מאוחדת'), []), [])
  assert.deepEqual(ids(scope('מאוחדת'), [{ id: 'x', folder_id: 'fix', dept: 'מאוחדת' }]), ['fix'])
  // full access
  assert.equal(S.scopeVisibleFolderIds(null, folders, []).size, folders.length)
})

test('folder ancestor walk survives a parent cycle', () => {
  const loop = [
    { id: 'a', parent_id: 'b', dept: 'מאוחדת' },
    { id: 'b', parent_id: 'a', dept: null },
  ]
  assert.deepEqual([...S.scopeVisibleFolderIds(scope('מאוחדת'), loop, [])].sort(), ['a', 'b'])
})
