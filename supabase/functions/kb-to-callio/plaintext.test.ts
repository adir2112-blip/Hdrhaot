// Run: node --test supabase/functions/kb-to-callio/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toPlainText } from './plaintext.ts'

test('removes base64 images, URL images and embeds', () => {
  const raw = 'לפני\n![צילום](data:image/png;base64,iVBORw0KGgoAAA==){width:50%}\n![x](https://a.com/b.png)\n[EMBED]<iframe src="x"></iframe>[/EMBED]\nאחרי'
  assert.equal(toPlainText(raw), 'לפני\n\nאחרי')
})

test('removes stray base64 data URIs', () => {
  assert.equal(toPlainText('a data:image/jpeg;base64,/9j/4AAQ+= b'), 'a  b')
})

test('strips bold, italic, size and html tags', () => {
  assert.equal(
    toPlainText('***חשוב*** **מודגש** _נטוי_ [size:large]גדול[/size] <u>קו</u>&nbsp;&amp;'),
    'חשוב מודגש נטוי גדול קו &',
  )
})

test('drops unpaired ** left by authoring typos', () => {
  assert.equal(toPlainText('סטטוס. **\nמצבים'), 'סטטוס.\nמצבים')
})

test('keeps link text and url', () => {
  assert.equal(toPlainText('[טופס](https://x.co/f)'), 'טופס (https://x.co/f)')
  assert.equal(toPlainText('[https://x.co](https://x.co)'), 'https://x.co')
})

test('does not touch underscores inside urls', () => {
  assert.equal(toPlainText('https://x.co/a_b_c'), 'https://x.co/a_b_c')
})

test('normalizes headings, bullets and separators', () => {
  const raw = '### כותרת\n▸ נושא\n• א\n- ב\n  * ג\n─────────────\nסוף'
  assert.equal(toPlainText(raw), 'כותרת\nנושא\n- א\n- ב\n  - ג\n\nסוף')
})

test('collapses blank lines and handles null', () => {
  assert.equal(toPlainText('a\n\n\n\n\nb'), 'a\n\nb')
  assert.equal(toPlainText(null), '')
})
