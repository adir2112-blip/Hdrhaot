// Run: node --test supabase/functions/kb-to-callio/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orgsForDept, planChange } from './routing.ts'

const plan = (op: string, n: string | null, o: string | null) =>
  planChange(op, n, o).map((s) => `${s.org.key}:${s.event}`)

test('routes depts to the right org', () => {
  assert.deepEqual(orgsForDept('אלן קאר').map((o) => o.key), ['allen_carr'])
  assert.deepEqual(orgsForDept('כללי').map((o) => o.key), ['movement'])
  assert.deepEqual(orgsForDept('מאוחדת').map((o) => o.key), ['movement'])
  assert.deepEqual(orgsForDept(' כללית אקטיב ').map((o) => o.key), ['movement'])
  assert.deepEqual(orgsForDept('פריפיט שירות'), [])
  assert.deepEqual(orgsForDept(null), [])
})

test('insert / delete go only to the article org', () => {
  assert.deepEqual(plan('INSERT', 'אלן קאר', null), ['allen_carr:item.created'])
  assert.deepEqual(plan('DELETE', null, 'כללי'), ['movement:item.deleted'])
  assert.deepEqual(plan('INSERT', 'פריפיט', null), [])
})

test('update within the same org is item.updated', () => {
  assert.deepEqual(plan('UPDATE', 'מאוחדת', 'כללי'), ['movement:item.updated'])
})

test('moving an article between orgs deletes from old, creates in new', () => {
  assert.deepEqual(plan('UPDATE', 'אלן קאר', 'כללי'), ['allen_carr:item.created', 'movement:item.deleted'])
  assert.deepEqual(plan('UPDATE', 'פריפיט', 'אלן קאר'), ['allen_carr:item.deleted'])
  assert.deepEqual(plan('UPDATE', 'מובמנט', 'פריפיט'), ['movement:item.created'])
})
