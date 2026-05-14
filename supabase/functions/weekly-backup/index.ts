import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = 're_JqPa9R3P_MtuZHmfM5cYYjuEAjz1A4yQZ'
const TO_EMAIL = 'adir2112@gmail.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Fetch all tables
  const tables = [
    'agents', 'briefings', 'controls', 'knowledge_base',
    'kb_folders', 'discipline', 'ai_feedback', 'kb_comments', 'app_settings'
  ]
  const backup: Record<string, any[]> = {}

  for (const table of tables) {
    const { data } = await sb.from(table).select('*')
    backup[table] = data || []
  }

  const now = new Date().toLocaleDateString('he-IL')
  const json = JSON.stringify(backup, null, 2)
  const base64 = btoa(unescape(encodeURIComponent(json)))

  const summary = Object.entries(backup)
    .map(([t, rows]) => `<tr><td style="padding:4px 12px;border:1px solid #eee"><b>${t}</b></td><td style="padding:4px 12px;border:1px solid #eee;text-align:center">${rows.length}</td></tr>`)
    .join('')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'backup@resend.dev',
      to: TO_EMAIL,
      subject: `גיבוי שבועי — מערכת תדריכים ${now}`,
      html: `
        <div dir="rtl" style="font-family:Arial;padding:24px;max-width:600px">
          <h2 style="color:#1A3A5C;border-bottom:3px solid #C9A84C;padding-bottom:8px">
            גיבוי שבועי — מערכת תדריכים
          </h2>
          <p>תאריך: <strong>${now}</strong></p>
          <h3 style="color:#1A3A5C">סיכום נתונים:</h3>
          <table style="border-collapse:collapse;width:100%">
            <tr style="background:#1A3A5C;color:#fff">
              <th style="padding:6px 12px;text-align:right">טבלה</th>
              <th style="padding:6px 12px">רשומות</th>
            </tr>
            ${summary}
          </table>
          <p style="margin-top:20px">הקובץ המלא מצורף להודעה זו בפורמט JSON.</p>
          <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
            A.L שירותי ייעוץ ותכנון
          </p>
        </div>
      `,
      attachments: [{
        filename: `backup-${new Date().toISOString().slice(0, 10)}.json`,
        content: base64
      }]
    })
  })

  const result = await res.json()
  return new Response(JSON.stringify({ ok: res.ok, result }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
