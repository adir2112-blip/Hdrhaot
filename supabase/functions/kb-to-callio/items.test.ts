// Run: node --test supabase/functions/kb-to-callio/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deptsOf, itemId, toItem } from './items.ts'

test('item ids: articles keep uuid, briefings/tests are prefixed', () => {
  assert.equal(itemId('knowledge_base', 'db8b-1'), 'db8b-1')
  assert.equal(itemId('briefing_docs', 3), 'briefing-3')
  assert.equal(itemId('briefings', 59), 'test-59')
})

test('depts per table', () => {
  assert.deepEqual(deptsOf('knowledge_base', { dept: 'מאוחדת' }), ['מאוחדת'])
  assert.deepEqual(deptsOf('briefing_docs', { dept: 'כללית אקטיב,עובדים בריא, לאומית FIT', is_active: true }),
    ['כללית אקטיב', 'עובדים בריא', 'לאומית FIT'])
  assert.deepEqual(deptsOf('briefings', { targetDepts: '["פריפיט שירות"]', is_active: true }), ['פריפיט שירות'])
  assert.deepEqual(deptsOf('briefings', { targetDepts: '[]', is_active: true }), [])
  assert.deepEqual(deptsOf('briefings', { targetDepts: 'not json', is_active: true }), [])
})

test('inactive or missing rows are not in Callio', () => {
  assert.equal(deptsOf('briefing_docs', { dept: 'כללית אקטיב', is_active: false }), null)
  assert.equal(deptsOf('briefings', { targetDepts: '[]', is_active: false }), null)
  assert.equal(deptsOf('knowledge_base', null), null)
})

test('briefing item: content + Q&A with correct answer, never completions', () => {
  const row = {
    id: 3, title: 'צעדים', content: '**30** מטבעות ביום', is_active: true,
    questions: JSON.stringify([
      { q: 'כמה מטבעות ביום?', options: ['30 מטבעות', '250'], correct: 0 },
      { q: '', options: ['', ''], correct: 0 },
    ]),
    completions: '{"72":{"name":"נציג","score":100}}',
  }
  const item = toItem('briefing_docs', row, ['כללית אקטיב'])
  assert.deepEqual(item, {
    id: 'briefing-3', type: 'briefing', title: 'צעדים',
    content: '30 מטבעות ביום\n\nשאלות ותשובות:\n1. כמה מטבעות ביום?\n   תשובה נכונה: 30 מטבעות',
    depts: ['כללית אקטיב'], folder_id: null, expiry_date: null,
  })
  assert.ok(!JSON.stringify(item).includes('נציג'))
})

test('article item keeps folder and expiry', () => {
  const item = toItem('knowledge_base', { id: 'u1', title: 't', content: 'c', dept: 'כללי', folder_id: 'f', expiry_date: '2026-12-31' }, ['כללי'])
  assert.deepEqual(item, { id: 'u1', type: 'article', title: 't', content: 'c', depts: ['כללי'], folder_id: 'f', expiry_date: '2026-12-31' })
})
