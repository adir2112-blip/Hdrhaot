import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // הגבלה (15.11.2026): הפונקציה נקראת מה-pg_cron השבועי עם ה-anon key, כך שכל מי שמחזיק
  // את ה-anon key יכול לקרוא לה. הגיבוי תמיד נשלח רק לכתובת הקבועה, אבל קריאות חוזרות
  // היו שולחות גיבוי מלא שוב ושוב. מעכשיו: לכל היותר פעם ב-6 ימים.
  const LAST_KEY = 'weekly_backup_last_sent'
  const { data: last } = await sb.from('app_settings').select('value').eq('key', LAST_KEY).maybeSingle()
  const lastTs = last?.value ? Date.parse(last.value) : 0
  if (lastTs && Date.now() - lastTs < 6 * 24 * 3600 * 1000) {
    return new Response(JSON.stringify({ ok: true, skipped: true, last: last.value }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // משוך נתונים מכל טבלה
  const tables = ['agents','briefings','controls','knowledge_base','kb_folders','discipline','ai_feedback','kb_comments']
  const backup: Record<string, any[]> = {}

  for (const table of tables) {
    const { data } = await sb.from(table).select('*')
    backup[table] = data || []
  }

  const now = new Date().toLocaleDateString('he-IL')
  const json = JSON.stringify(backup, null, 2)
  const base64 = btoa(unescape(encodeURIComponent(json)))

  const summary = Object.entries(backup)
    .map(([t, rows]) => `<tr><td style="padding:4px 12px;border:1px solid #eee">${t}</td><td style="padding:4px 12px;border:1px solid #eee;text-align:center">${rows.length}</td></tr>`)
    .join('')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: 'adir2112@gmail.com',
      subject: `גיבוי שבועי — מערכת תדריכים ${now}`,
      html: `<div dir="rtl" style="font-family:Arial;padding:20px">
        <h2 style="color:#1A3A5C">גיבוי שבועי — מערכת תדריכים</h2>
        <p>תאריך: <strong>${now}</strong></p>
        <table style="border-collapse:collapse">
          <tr style="background:#1A3A5C;color:#fff">
            <th style="padding:6px 12px">טבלה</th>
            <th style="padding:6px 12px">רשומות</th>
          </tr>${summary}
        </table>
        <p>הקובץ המלא מצורף.</p>
      </div>`,
      attachments: [{
        filename: `backup-${new Date().toISOString().slice(0,10)}.json`,
        content: base64
      }]
    })
  })

  const data = await res.json()
  if (res.ok) {
    await sb.from('app_settings').upsert({ key: LAST_KEY, value: new Date().toISOString() }, { onConflict: 'key' })
  }
  return new Response(JSON.stringify({ ok: res.ok, data }), {
    status: res.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' }
  })
})