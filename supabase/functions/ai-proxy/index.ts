import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// The real OpenAI key lives only here (Edge Function secret) — it is never
// sent to, or readable by, the client. Set it with:
//   supabase secrets set OPENAI_API_KEY=sk-...
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let body: { model?: string; messages?: unknown; temperature?: number; max_tokens?: number }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: { message: 'invalid JSON body' } }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { model, messages, temperature, max_tokens } = body
  if (!model || !messages) {
    return new Response(JSON.stringify({ error: { message: 'model and messages are required' } }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let openaiRes: Response
  try {
    openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: 'upstream request failed: ' + String(e) } }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const data = await openaiRes.json()

  // Best-effort daily usage counter (same key/shape the app already showed
  // in the admin settings panel) — uses the service role so it works even
  // though anon can no longer write to app_settings.
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const today = new Date().toISOString().slice(0, 10)
    const usageKey = `ai_usage_${today}`
    const { data: existing } = await sb.from('app_settings').select('value').eq('key', usageKey).single()
    const count = existing ? (parseInt(existing.value, 10) || 0) + 1 : 1
    await sb.from('app_settings').upsert({ key: usageKey, value: String(count) }, { onConflict: 'key' })
  } catch {
    // usage tracking must never break the actual AI response
  }

  return new Response(JSON.stringify(data), {
    status: openaiRes.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
