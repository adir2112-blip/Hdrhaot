import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// The real OpenAI key lives only here (Edge Function secret) — it is never
// sent to, or readable by, the client. Set it with:
//   supabase secrets set OPENAI_API_KEY=sk-...
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Hardening (the proxy is reachable by anonymous agents, so it can't require a
// login — instead it constrains what a request may cost):
//   - only the model the app actually uses is allowed (no expensive models)
//   - max_tokens is clamped and oversized inputs are rejected
//   - a generous global daily ceiling caps runaway abuse. It's set well above
//     real usage (~1500/day) and fails OPEN on any error, so it never blocks
//     legitimate call-center traffic that shares one office IP.
const ALLOWED_MODELS = new Set(['gpt-4o-mini'])
const MAX_TOKENS_CAP = 4000
const MAX_MESSAGES_BYTES = 200_000
// 15.11.2026: two separate daily caps instead of one global 5000. Real usage over the last
// 3 months peaked at 86/day. Managers (logged in, checked with is_manager()) and agents
// (anonymous) each get their own bucket, so an outsider who burns the agent bucket can no
// longer switch off the managers' tools. The owner gets a WhatsApp alert when a bucket fills.
const CAP_MANAGERS = 300
const CAP_AGENTS = 300
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const ALERT_PHONE = '972509143496'
const WA_BOT_SEND = 'https://whatsapp-bot-production-120a.up.railway.app/api/send'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let body: { model?: string; messages?: unknown; temperature?: number; max_tokens?: number; response_format?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: { message: 'invalid JSON body' } }, 400)
  }

  const { model, messages, temperature, max_tokens, response_format } = body
  if (!model || !messages) {
    return json({ error: { message: 'model and messages are required' } }, 400)
  }

  // Constrain cost-bearing inputs.
  if (!ALLOWED_MODELS.has(model)) {
    return json({ error: { message: `model not allowed: ${model}` } }, 400)
  }
  if (JSON.stringify(messages).length > MAX_MESSAGES_BYTES) {
    return json({ error: { message: 'request too large' } }, 413)
  }
  const safeMaxTokens = Math.min(typeof max_tokens === 'number' && max_tokens > 0 ? max_tokens : MAX_TOKENS_CAP, MAX_TOKENS_CAP)

  // Service-role client, reused for the daily ceiling check and the counter.
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const today = new Date().toISOString().slice(0, 10)
  const usageKey = `ai_usage_${today}`

  // Who is calling: a logged-in manager (supabase-js sends the session JWT) or an agent (anon).
  let isManager = false
  try {
    const asCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    })
    const { data } = await asCaller.rpc('is_manager')
    isManager = data === true
  } catch { /* treat as agent */ }

  // Per-bucket daily cap with an atomic counter. Fails OPEN on any DB error.
  const bucket = isManager ? 'mgr' : 'agent'
  const cap = isManager ? CAP_MANAGERS : CAP_AGENTS
  try {
    const { data: n } = await sb.rpc('ai_usage_bump', { p_key: `ai_usage_${bucket}_${today}` })
    if (typeof n === 'number') {
      if (n === cap) {
        const who = isManager ? "כלי המנהלים" : "כלי הנציגים (צ'אט ידע / תדריך הפוך)"
        fetch(WA_BOT_SEND, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: ALERT_PHONE,
            source: 'מערכת הדרכות',
            message: `🤖 מערכת הדרכות: ${who} הגיעו היום לתקרת ה-AI (${cap} בקשות).
עד חצות ה-AI ב${isManager ? 'כלי המנהלים' : 'כלי הנציגים'} לא יענה.
אם זה שימוש רגיל, אפשר להעלות את התקרה ב-ai-proxy.`,
          }),
        }).catch(() => {})
      }
      if (n > cap) {
        return json({ error: { message: 'daily AI limit reached, try again tomorrow' } }, 429)
      }
    }
  } catch {
    // ignore — never block the response on the ceiling check
  }

  let openaiRes: Response
  try {
    openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      // response_format is optional — undefined keys are dropped by
      // JSON.stringify, so this is a no-op for every existing caller that
      // doesn't pass it, and forces syntactically-valid JSON output (via
      // OpenAI's own JSON mode) for callers that ask for {type:"json_object"}.
      body: JSON.stringify({ model, messages, temperature, max_tokens: safeMaxTokens, response_format }),
    })
  } catch (e) {
    return json({ error: { message: 'upstream request failed: ' + String(e) } }, 502)
  }

  const data = await openaiRes.json()

  // Total daily counter (same key the admin settings panel shows), now atomic.
  try {
    await sb.rpc('ai_usage_bump', { p_key: usageKey })
  } catch {
    // usage tracking must never break the actual AI response
  }

  return new Response(JSON.stringify(data), {
    status: openaiRes.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
