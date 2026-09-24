// Which Callio account (org) receives which knowledge_base dept. Each org has
// its own Callio API key, so an article must only reach the org(s) its dept
// belongs to. Depts not listed here (e.g. פריפיט) are not sent anywhere.
export type Org = { key: string; tokenEnv: string; depts: string[] }

export const ORGS: Org[] = [
  {
    key: 'movement',
    tokenEnv: 'CALLIO_TOKEN_MOVEMENT',
    depts: [
      'מובמנט', 'כללי', 'כללית אקטיב', 'עובדים בריא', 'לאומית FIT',
      'מעוף לעמית', 'מעוף לעמית מכירות', 'מאוחדת',
    ],
  },
  {
    key: 'allen_carr',
    tokenEnv: 'CALLIO_TOKEN_ALLEN_CARR',
    depts: ['אלן קאר'],
  },
]

export function orgsForDept(dept: string | null | undefined): Org[] {
  const d = (dept ?? '').trim()
  return ORGS.filter((o) => o.depts.includes(d))
}

export type Event = 'item.created' | 'item.updated' | 'item.deleted'
export type Send = { org: Org; event: Event }

// Plans what each org should receive for one DB change. On a dept change that
// moves an article between orgs, the org that lost it gets item.deleted and
// the org that gained it gets item.created.
export function planChange(op: string, newDept: string | null | undefined, oldDept: string | null | undefined): Send[] {
  if (op === 'INSERT') return orgsForDept(newDept).map((org) => ({ org, event: 'item.created' as Event }))
  if (op === 'DELETE') return orgsForDept(oldDept).map((org) => ({ org, event: 'item.deleted' as Event }))
  const before = orgsForDept(oldDept)
  const after = orgsForDept(newDept)
  return [
    ...after.map((org) => ({ org, event: (before.includes(org) ? 'item.updated' : 'item.created') as Event })),
    ...before.filter((org) => !after.includes(org)).map((org) => ({ org, event: 'item.deleted' as Event })),
  ]
}
