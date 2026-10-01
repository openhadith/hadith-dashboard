/**
 * End-to-end check of the whole loop: dashboard → hadith API → corpus.
 *
 *   npm run e2e            (dashboard on :3006, API on :4005 with `npm run dev:db` data)
 *
 * Drafts, approves, publishes and reverts real records, so it refuses to run
 * unless both the dashboard and the API it is connected to are on localhost.
 * Every publish it makes is reverted before it finishes. Leaves behind one
 * throwaway account (e2e-<time>@example.test) and a few changed queue statuses.
 */
const DASH = process.env.DASH_URL || 'http://localhost:3006';
const LOCAL = new Set(['localhost', '127.0.0.1']);

let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra && !cond ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(DASH + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      if (pair.startsWith('studio_token=')) cookie = pair.endsWith('=') ? '' : pair;
    }
    let json = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, json };
  };
  call.token = () => cookie.split('=')[1];
  return call;
}

async function signedIn(email) {
  const c = client();
  const r = await c('POST', '/api/session', { email, password: 'hadith-dev' });
  if (r.status !== 200) throw new Error(`cannot sign in as ${email}: ${r.json?.error}`);
  return c;
}

// ------------------------------------------------------------ safety first
if (!LOCAL.has(new URL(DASH).hostname)) {
  console.error(`Refusing: DASH_URL ${DASH} is not local.`);
  process.exit(2);
}
const probe = await (await fetch(`${DASH}/api/session`)).json();
const API = probe?.data?.corpusSource?.url;
if (!API || !LOCAL.has(new URL(API).hostname)) {
  console.error(`Refusing: the dashboard publishes to ${API ?? 'an unknown API'}, not a local one.`);
  process.exit(2);
}
console.log(`dashboard ${DASH} → API ${API}\n`);

const pub = async (path) => (await (await fetch(API + path)).json()).data;
const chainOf = (h) => {
  const links = h.hadith_has_rawy ?? [];
  const cited = new Set(links.map((l) => l.toldById).filter(Boolean));
  const by = new Map(links.map((l) => [l.rawyId, l]));
  const out = [];
  let cur = links.find((l) => !cited.has(l.rawyId));
  while (cur) { out.push(cur); cur = cur.toldById ? by.get(cur.toldById) : undefined; }
  return out;
};
const sanads = (h) => new Set((h.hadith_has_rawy ?? []).map((l) => l.sanadId).filter(Boolean)).size;

const sup = await signedIn('zana@muhaqqiq.org');
const editor = await signedIn('soran@muhaqqiq.org');
const viewer = await signedIn('rebin@muhaqqiq.org');
const reviewer = await signedIn('sara@muhaqqiq.org');

// Pick fixtures from the queue: two single-sanad hadiths with room to trim a
// chain, and one branched hadith.
const queue = (await sup('GET', '/api/queue?limit=100')).json.data.rows;
const single = [];
let multi = null;
for (const row of queue) {
  if (single.length >= 2 && multi) break;
  const h = await pub(`/hadiths/${row.entity_id}`);
  if (!h) continue;
  if (sanads(h) === 1 && chainOf(h).length >= 3 && single.length < 2) single.push({ row, h });
  else if (sanads(h) > 1 && !multi) multi = { row, h };
}
if (single.length < 2 || !multi) {
  console.error('Could not find fixtures in the queue; run `npm run db:setup` against the local API.');
  process.exit(2);
}
const [A, B] = single;
const reviewStatus = async (id) => (await sup('GET', `/api/review/${id}`)).json.data.review?.status;
const lastPublish = async (type, id) =>
  (await sup('GET', '/api/audit?action=publish&limit=10')).json.data.rows
    .find((r) => r.entity_type === type && r.entity_id === id);

// ---------------------------------------------------------------- sign-in
const anon = client();
check('wrong password refused', (await anon('POST', '/api/session', { email: 'zana@muhaqqiq.org', password: 'nope-nope' })).status === 401);
const edPerms = (await editor('GET', '/api/session')).json.data.permissions.sort().join();
check('editor permissions come from the API', edPerms === 'edit,view', edPerms);

// ---------------------------------------------------------------- text: draft → approve → publish → revert
const draftText = `${A.h.matn} — مسودة`;
check('editor saves a draft', (await editor('PUT', `/api/review/${A.row.entity_id}`, { payload: { matn: draftText } })).status === 200);
check('draft is not public', (await pub(`/hadiths/${A.row.entity_id}`)).matn === A.h.matn);
check('editor cannot approve', (await editor('PUT', `/api/review/${A.row.entity_id}`, { payload: {}, status: 'approved' })).status === 403);
check('viewer cannot draft', (await viewer('PUT', `/api/review/${A.row.entity_id}`, { payload: { matn: 'x' } })).status === 403);
const approved = await sup('PUT', `/api/review/${A.row.entity_id}`, { payload: {}, status: 'approved' });
check('approval publishes', approved.json?.data?.status === 'published', JSON.stringify(approved.json));
check('public text changed', (await pub(`/hadiths/${A.row.entity_id}`)).matn === draftText);
check('reviewer can approve an untouched record', (await reviewer('PUT', `/api/review/${A.row.entity_id}`, { payload: {}, status: 'approved' })).json?.data?.status === 'approved');
const textEntry = await lastPublish('hadith', A.row.entity_id);
check('audit revert undoes the publish', (await sup('POST', '/api/audit', { id: textEntry?.id })).status === 200);
check('public text restored', (await pub(`/hadiths/${A.row.entity_id}`)).matn === A.h.matn);

// ---------------------------------------------------------------- narrator via CRUD
const nid = String(chainOf(A.h)[0].rawyId);
const narr0 = await pub(`/narrators/${nid}`);
const current = (await editor('GET', `/api/entities/narrator/${nid}`)).json.data.data;
await editor('PUT', `/api/entities/narrator/${nid}`, { data: { ...current, laqab: 'لقب تجريبي' } });
check('editor cannot publish a record', (await editor('POST', `/api/entities/narrator/${nid}/publish`, {})).status === 403);
check('supervisor publishes a record', (await sup('POST', `/api/entities/narrator/${nid}/publish`, {})).json?.data?.published === true);
const narr1 = await pub(`/narrators/${nid}`);
check('only the edited field changed', narr1.laqab === 'لقب تجريبي' && narr1.kunya === narr0.kunya);
await sup('POST', '/api/audit', { id: (await lastPublish('narrator', nid))?.id });
check('narrator restored', (await pub(`/narrators/${nid}`)).laqab === narr0.laqab);

// ---------------------------------------------------------------- isnad
const chainB = chainOf(B.h);
const trimmed = chainB.filter((_, i) => i !== 1);
await editor('PUT', `/api/isnad/${B.row.entity_id}`, { links: trimmed });
check('chain draft not public', chainOf(await pub(`/hadiths/${B.row.entity_id}`)).length === chainB.length);
check('approval publishes the chain', (await sup('PUT', `/api/review/${B.row.entity_id}`, { payload: {}, status: 'approved' })).json?.data?.published === true);
check('public chain matches', chainOf(await pub(`/hadiths/${B.row.entity_id}`)).length === trimmed.length);
await sup('POST', '/api/audit', { id: (await lastPublish('isnad', B.row.entity_id))?.id });
check('chain restored', chainOf(await pub(`/hadiths/${B.row.entity_id}`)).length === chainB.length);

// branched: refused with a reason, status kept; bulk reports it
const statusBefore = await reviewStatus(multi.row.entity_id);
await editor('PUT', `/api/isnad/${multi.row.entity_id}`, { links: chainOf(multi.h).slice(1) });
const refusedApproval = await sup('PUT', `/api/review/${multi.row.entity_id}`, { payload: {}, status: 'approved' });
check('branched chain blocks approval', refusedApproval.status === 409 && refusedApproval.json.code === 'branched_isnad');
check('status unchanged', (await reviewStatus(multi.row.entity_id)) === statusBefore);
const bulk = await sup('POST', '/api/queue/transition', { ids: [A.row.id, multi.row.id], status: 'approved' });
check('bulk approval reports the refused row', bulk.json?.data?.failed?.map((f) => f.entityId).join() === multi.row.entity_id);
await editor('DELETE', `/api/isnad/${multi.row.entity_id}`);

// ---------------------------------------------------------------- accounts
const email = `e2e-${Date.now()}@example.test`;
const created = await sup('POST', '/api/admin/users', { name: 'E2E', email, password: 'long-enough', role: 'viewer' });
check('admin creates an account in the API', created.status === 201);
const fresh = client();
check('new account signs in', (await fresh('POST', '/api/session', { email, password: 'long-enough' })).json?.data?.user?.role === 'viewer');
await sup('PATCH', '/api/admin/users', { userId: created.json.data.id, role: 'editor' });
check('role change applies at once', (await fresh('GET', '/api/session')).json.data.permissions.includes('edit'));

// ---------------------------------------------------------------- sign-out
const token = fresh.token();
await fresh('DELETE', '/api/session');
const me = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
check('sign-out revokes the token at the API', me.status === 401);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
