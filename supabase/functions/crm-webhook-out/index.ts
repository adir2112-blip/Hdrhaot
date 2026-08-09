// supabase/functions/crm-webhook-out/index.ts

const CRM_URL = 'https://crm.azriasolutions.com/api/webhooks/briefing-signed';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
const { phone, briefing_id, briefing_title, score, signed_at, org } = body;
    if (!phone || !briefing_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'missing phone or briefing_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = Deno.env.get('CRM_WEBHOOK_TOKEN'); // נשמר כ-Secret, לא בקוד

    const crmRes = await fetch(CRM_URL, {
      method: 'POST',
 headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-webhook-token': token ?? '',
      },
     body: JSON.stringify({
        phone,
        briefing_id,
        briefing_title: briefing_title || '',
        score,
        signed_at: signed_at || new Date().toISOString(),
        org: org || '',
      }),
    });

    const statusCode = crmRes.status;
    let bodyText = '';
    try { bodyText = await crmRes.text(); } catch (_e) { /* ignore */ }

    return new Response(
      JSON.stringify({
        success: crmRes.ok,
        status_code: statusCode,
        error_message: crmRes.ok ? null : `HTTP ${statusCode} — ${bodyText.slice(0, 300)}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, status_code: null, error_message: 'Edge function error: ' + e.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});