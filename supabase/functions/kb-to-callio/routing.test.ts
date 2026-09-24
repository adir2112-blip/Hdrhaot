// Run: node --test supabase/functions/kb-to-callio/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ORGS, orgDepts, orgsFor, planChange } from './routing.ts'

const keys = (d: string[] | null) => orgsFor(d).map((o) => o.key)
const plan = (n: string[] | null, o: string[] | null) =>
  planChange(n, o).map((s) => `${s.org.key}:${s.event}`)

test('routes depts to the right org', () => {
  assert.deepEqual(keys(['אלן קאר']), ['allen_carr'])
  assert.deepEqual(keys(['כללי']), ['movement'])
  assert.deepEqual(keys(['מאוחדת']), ['movement'])
  assert.deepEqual(keys(['פריפיט שירות']), [])
  assert.deepEqual(keys(null), [])
})

test('multi-dept and all-depts items', () => {
  assert.deepEqual(keys(['פריפיט שירות', 'אלן קאר']), ['allen_carr'])
  assert.deepEqual(keys(['כללית אקטיב', 'אלן קאר']), ['movement', 'allen_carr'])
  assert.deepEqual(keys([]), ['movement', 'allen_carr'])
})

test('each org only sees its own depts', () => {
  const [movement, allen] = ORGS
  assert.deepEqual(orgDepts(movement, ['כללית אקטיב', 'אלן קאר', 'פריפיט']), ['כללית אקטיב'])
  assert.deepEqual(orgDepts(allen, []), ['אלן קאר'])
})

test('create / delete / update', () => {
  assert.deepEqual(plan(['אלן קאר'], null), ['allen_carr:item.created'])
  assert.deepEqual(plan(null, ['כללי']), ['movement:item.deleted'])
  assert.deepEqual(plan(['פריפיט'], null), [])
  assert.deepEqual(plan(['מאוחדת'], ['כללי']), ['movement:item.updated'])
})

test('moving between orgs deletes from old, creates in new', () => {
  assert.deepEqual(plan(['אלן קאר'], ['כללי']), ['allen_carr:item.created', 'movement:item.deleted'])
  assert.deepEqual(plan(['פריפיט'], ['אלן קאר']), ['allen_carr:item.deleted'])
  assert.deepEqual(plan(['מובמנט'], ['פריפיט']), ['movement:item.created'])
})
