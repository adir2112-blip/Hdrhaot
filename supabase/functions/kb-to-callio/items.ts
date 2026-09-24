import { toPlainText } from './plaintext.ts'
import type { Depts } from './routing.ts'

// The three synced tables and how each maps to a Callio item. Only content
// fields are ever sent — never completions (agent names, scores, answers).
export type Table = 'knowledge_base' | 'briefing_docs' | 'briefings'
export type ItemType = 'article' | 'briefing' | 'test'

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

export const TABLES: Record<Table, { type: ItemType; columns: string; order: string }> = {
  knowledge_base: { type: 'article', columns: 'id,title,content,dept,folder_id,expiry_date', order: 'created_at' },
  briefing_docs: { type: 'briefing', columns: 'id,title,content,questions,dept,is_active', order: 'id' },
  briefings: { type: 'test', columns: 'id,title,content,questions,targetDepts,is_active', order: 'id' },
}

export function isTable(t: unknown): t is Table {
  return typeof t === 'string' && t in TABLES
}

export function itemId(table: Table, id: string | number): string {
  return table === 'knowledge_base' ? String(id) : `${TABLES[table].type}-${id}`
}

function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const clean = (list: unknown[]) =>
  [...new Set(list.map((d) => String(d ?? '').trim()).filter(Boolean))]

// Which depts a row is for, or null when it should not exist in Callio
// (missing / inactive). Works on full rows and on the trigger's old-row
// snapshot, which carries the same dept/active columns.
export function deptsOf(table: Table, row: Row | null | undefined): Depts {
  if (!row) return null
  if (table === 'knowledge_base') return clean([row.dept ?? 'כללי'])
  if (row.is_active === false) return null
  if (table === 'briefing_docs') return clean(String(row.dept ?? '').split(','))
  return clean(parseJsonArray(row.targetDepts)) // [] = all depts
}

type Question = { q?: string; options?: string[]; correct?: number }

function questionsText(raw: unknown): string {
  const lines: string[] = []
  for (const q of parseJsonArray(raw) as Question[]) {
    const question = (q?.q ?? '').trim()
    const answer = (q?.options?.[q.correct ?? -1] ?? '').trim()
    if (!question || !answer) continue
    lines.push(`${lines.length + 1}. ${question}\n   תשובה נכונה: ${answer}`)
  }
  return lines.length ? 'שאלות ותשובות:\n' + lines.join('\n') : ''
}

export function toItem(table: Table, row: Row, depts: string[]) {
  const content = [toPlainText(row.content), table === 'knowledge_base' ? '' : questionsText(row.questions)]
    .filter(Boolean)
    .join('\n\n')
  return {
    id: itemId(table, row.id),
    type: TABLES[table].type,
    title: row.title ?? '',
    content,
    depts,
    folder_id: row.folder_id ?? null,
    expiry_date: row.expiry_date ?? null,
  }
}
