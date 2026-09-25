// Which Callio account (org) receives which dept. Each org has its own Callio
// webhook URL and token, so an item must only reach the org(s) its depts belong to, and each
// org only sees its own depts on the item. Depts not listed here (e.g.
// פריפיט) are not sent anywhere.
export type Org = { key: string; urlEnv: string; tokenEnv: string; depts: string[] }

export const ORGS: Org[] = [
  {
    key: 'movement',
    urlEnv: 'CALLIO_URL_MOVEMENT',
    tokenEnv: 'CALLIO_TOKEN_MOVEMENT',
    depts: [
      'מובמנט', 'כללי', 'כללית אקטיב', 'עובדים בריא', 'לאומית FIT',
      'מעוף לעמית', 'מעוף לעמית מכירות', 'מאוחדת',
    ],
  },
  {
    key: 'allen_carr',
    urlEnv: 'CALLIO_URL_ALLEN_CARR',
    tokenEnv: 'CALLIO_TOKEN_ALLEN_CARR',
    depts: ['אלן קאר'],
  },
]

// null = item not present in Callio (new row, deleted, or inactive).
// [] = targeted at all depts (tests with no targetDepts).
export type Depts = string[] | null

// The depts of an item that a given org should see; empty when none.
export function orgDepts(org: Org, depts: string[]): string[] {
  return depts.length === 0 ? [...org.depts] : depts.filter((d) => org.depts.includes(d))
}

export function orgsFor(depts: Depts): Org[] {
  if (depts === null) return []
  return ORGS.filter((o) => orgDepts(o, depts).length > 0)
}

export type Event = 'item.created' | 'item.updated' | 'item.deleted'
export type Send = { org: Org; event: Event }

// What each org should receive when an item goes from oldDepts to newDepts.
// An org that loses the item gets item.deleted, one that gains it
// item.created, one that keeps it item.updated.
export function planChange(newDepts: Depts, oldDepts: Depts): Send[] {
  const before = orgsFor(oldDepts)
  const after = orgsFor(newDepts)
  return [
    ...after.map((org) => ({ org, event: (before.includes(org) ? 'item.updated' : 'item.created') as Event })),
    ...before.filter((org) => !after.includes(org)).map((org) => ({ org, event: 'item.deleted' as Event })),
  ]
}
