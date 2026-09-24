import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { toPlainText } from './plaintext.ts'
import { ORGS, type Event, type Org, planChange } from './routing.ts'

// Pushes knowledge_base changes to Callio (call-analysis system), which keeps
// its own copy per org and filters by dept per call. Each Callio org
// (מובמנט, אלן קאר) has its own API key and only gets its own depts — see
// routing.ts.
//
// Two callers:
//  1. The kb_notify_callio() DB trigger (via pg_net) on insert/update/delete,
//     authenticated by the x-kb-sync-secret header (same value as the Vault
//     secret 'kb_sync_secret'). Body: { op, id, old_dept }.
//  2. The super admin's "סנכרון מלא ל-Callio" button, authenticated by their
//     own session JWT. Body: { resync: true } → re-sends every article to its
//     org as item.updated.
//
// Secrets (supabase secrets set ...):
//   CALLIO_TOKEN_MOVEMENT, CALLIO_TOKEN_ALLEN_CARR   per-org Callio API keys
//   KB_SYNC_SECRET                                   shared with the DB trigger
// An org whose token is not set is skipped. Deploy with --no-verify-jwt: auth
// is checked here, per caller type.

const CALLIO_URL = Deno.env.get('CALLIO_URL') ?? 'https://callio-ai.com/api/webhooks/knowledge'
const SUPER_ADMIN_EMAIL = 'adir2112@gmail.com'
const RETRY_DELAYS_MS = [1000, 3000] // 3 attempts total

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const KB_SYNC_SECRET = Deno.env.get('KB_SYNC_SECRET') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type KbRow = {
  id: string
  title: string | null
  content: string | null
  dept: string | null
  folder_id: string | null
  expiry_date: string | null
}

const COLUMNS = 'id,title,content,dept,folder_id,expiry_date'
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function tokenFor(org: Org): string {
  return Deno.env.get(org.tokenEnv) ?? ''
}

function toItem(row: KbRow) {
  return {
    id: row.id,
    title: row.title ?? '',
    content: toPlainText(row.content),
    dept: row.dept ?? '',
    folder_id: row.folder_id,
    expiry_date: row.expiry_date,
  }
}

async function sendToCallio(org: Org, event: Event, item: Record<string, unknown>): Promise<boolean> {
  const token = tokenFor(org)
  if (!token) {
    console.warn(`callio ${org.key}: no token configured, skipped ${event} ${item.id}`)
    return false
  }
  const body = JSON.stringify({ event, item })
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(CALLIO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${token}`,
        },
        body,
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) return true
      console.error(`callio ${org.key} ${event} ${item.id}: HTTP ${res.status} (attempt ${attempt + 1})`)
    } catch (e) {
      console.error(`callio ${org.key} ${event} ${item.id}: ${e} (attempt ${attempt + 1})`)
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
    }
  }
  return false
}

// Trigger path: the trigger only sends op + id + old dept, so the current row
// is loaded here — Callio always gets the latest committed version.
async function handleChange(op: string, id: string, oldDept: string | null) {
  let row: KbRow | null = null
  if (op !== 'DELETE') {
    const { data, error } = await sb.from('knowledge_base').select(COLUMNS).eq('id', id).maybeSingle()
    if (error) {
      console.error(`load ${id}: ${error.message}`)
      return
    }
    // Row deleted between the trigger firing and now — the DELETE event covers it.
    if (!data) return
    row = data as KbRow
  }
  const sends = planChange(op, row?.dept, oldDept)
  await Promise.all(sends.map(({ org, event }) =>
    sendToCallio(org, event, event === 'item.deleted' || !row ? { id } : toItem(row))))
}

async function handleResync() {
  const { data, error } = await sb.from('knowledge_base').select(COLUMNS).order('created_at')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as KbRow[]
  const orgs = []
  for (const org of ORGS) {
    const orgRows = rows.filter((r) => org.depts.includes((r.dept ?? '').trim()))
    if (!tokenFor(org)) {
      orgs.push({ org: org.key, total: orgRows.length, sent: 0, failed: [], skipped: 'no token' })
      continue
    }
    const failed: string[] = []
    const CONCURRENCY = 5
    for (let i = 0; i < orgRows.length; i += CONCURRENCY) {
      const batch = orgRows.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map((r) => sendToCallio(org, 'item.updated', toItem(r))))
      results.forEach((ok, j) => { if (!ok) failed.push(batch[j].title ?? batch[j].id) })
    }
    orgs.push({ org: org.key, total: orgRows.length, sent: orgRows.length - failed.length, failed })
  }
  return { orgs }
}

async function isSuperAdmin(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return false
  const { data, error } = await sb.auth.getUser(jwt)
  return !error && data.user?.email === SUPER_ADMIN_EMAIL
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body: { op?: string; id?: string; old_dept?: string | null; resync?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  // 1. DB trigger
  const secret = req.headers.get('x-kb-sync-secret')
  if (secret !== null) {
    if (!KB_SYNC_SECRET || secret !== KB_SYNC_SECRET) return json({ error: 'unauthorized' }, 401)
    const { op, id } = body
    if (!id || !['INSERT', 'UPDATE', 'DELETE'].includes(op ?? '')) {
      return json({ error: 'op and id are required' }, 400)
    }
    // Answer pg_net right away; retries to Callio continue in the background.
    // @ts-ignore EdgeRuntime is provided by the Supabase Edge runtime
    EdgeRuntime.waitUntil(handleChange(op!, id, body.old_dept ?? null))
    return json({ accepted: true }, 202)
  }

  // 2. Manual full resync by the super admin
  if (body.resync === true) {
    if (!(await isSuperAdmin(req))) return json({ error: 'forbidden' }, 403)
    try {
      return json(await handleResync())
    } catch (e) {
      return json({ error: String(e) }, 500)
    }
  }

  return json({ error: 'bad request' }, 400)
})
