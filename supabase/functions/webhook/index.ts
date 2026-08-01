import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Secret moved to an encrypted Supabase secret (CRM_WEBHOOK_TOKEN) instead
// of sitting in plaintext in the function source. Value is unchanged, so
// whatever currently calls this endpoint keeps working exactly as before —
// only where the function reads the expected token from changed.
const WEBHOOK_SECRET = Deno.env.get('CRM_WEBHOOK_TOKEN') ?? '';

Deno.serve(async (req) => {
  // ─── CORS ───
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token'
      }
    });
  }

  // ─── Auth ───
  const token = req.headers.get('x-webhook-token');
  if (!WEBHOOK_SECRET || token !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ─── Parse body ───
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { phone, briefing_id, score, signed_at, answers } = body;
  if (!phone || !briefing_id || score === undefined) {
    return new Response(JSON.stringify({ error: 'Missing required fields: phone, briefing_id, score' }), {
      status: 400
    });
  }

  // ─── Init Supabase with service_role ───
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // ─── Find agent by phone ───
  const { data: agent, error: agentErr } = await supabase.from('agents').select('id, name').eq('phone', phone).single();
  if (agentErr || !agent) {
    return new Response(JSON.stringify({ error: 'Agent not found for phone: ' + phone }), { status: 404 });
  }

  // ─── Fetch fresh completions (race-safe) ───
  const { data: briefingRow, error: briefingErr } = await supabase
    .from('briefing_docs')
    .select('completions, title, questions')
    .eq('id', briefing_id)
    .single();
  if (briefingErr || !briefingRow) {
    return new Response(JSON.stringify({ error: 'Briefing not found: ' + briefing_id }), { status: 404 });
  }

  let completions: Record<string, any> = {};
  try {
    completions = typeof briefingRow.completions === 'string' ? JSON.parse(briefingRow.completions) : briefingRow.completions || {};
  } catch {
    completions = {};
  }

  // ─── Idempotency: skip if already signed ───
  const agentId = String(agent.id);
  if (completions[agentId]?.signed_at) {
    return new Response(JSON.stringify({
      ok: true,
      message: 'Already signed',
      agent: agent.name,
      signed_at: completions[agentId].signed_at
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ─── Write completion ───
  completions[agentId] = {
    name: agent.name,
    score,
    signed_at: signed_at || new Date().toISOString(),
    answers: answers || [],
    source: 'crm'
  };

  const { error: updateErr } = await supabase
    .from('briefing_docs')
    .update({ completions: JSON.stringify(completions) })
    .eq('id', briefing_id);
  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  // ─── Log ───
  await supabase.from('manager_logs').insert({
    manager_email: 'crm-webhook',
    action: 'התאמת נתונים מ-CRM',
    details: `נציג: ${agent.name} | תדריך id=${briefing_id} | ציון: ${score}`
  });

  return new Response(JSON.stringify({ ok: true, agent: agent.name, briefing: briefingRow.title, score }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
