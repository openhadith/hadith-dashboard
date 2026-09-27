import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioSession } from './session';

// What reaches the public site is decided here, so the database and the API
// are replaced with recorders and every call is asserted.
const db = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), audit: vi.fn() }));
const api = vi.hoisted(() => ({ backend: vi.fn() }));
const source = vi.hoisted(() => ({ corpusRecord: vi.fn(), getHadith: vi.fn() }));

vi.mock('./db', () => db);
vi.mock('./backend', () => ({ ...api, API: 'http://api.test' }));
vi.mock('./crud', async (original) => ({
  ...(await original<typeof import('./crud')>()),
  corpusRecord: source.corpusRecord,
}));
vi.mock('./corpus', async (original) => ({
  ...(await original<typeof import('./corpus')>()),
  getHadith: source.getHadith,
}));

const { publishHadith, publishIsnad, publishRecord } = await import('./publish');

const session = {
  user: { id: 7, name: 'Tester', email: 't@x.org', role: 'supervisor', avatar_tone: 'g', status: 'on' },
  permissions: ['view', 'edit', 'approve'],
  token: 'tok',
} satisfies StudioSession;

const link = (id: string, extra: Record<string, unknown> = {}) => ({
  id: `l${id}`, rawyId: id, toldById: null, sanadId: '1', rawy: { Name: `n${id}` }, ...extra,
});
/** Corpus links for a collector-first chain, told_by pointing to the next narrator. */
const corpusLinks = (ids: string[]) =>
  ids.map((id, i) => ({ ...link(id), toldById: ids[i + 1] ?? null }));

const ok = (data: unknown) => ({ ok: true, status: 200, data, error: null, code: null });
const refused = (status: number, code: string) => ({ ok: false, status, data: null, error: 'refused', code });
const sql = () => db.query.mock.calls.map(([text]) => String(text).trim().split(/\s+/)[0]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('publishRecord', () => {
  it('sends only publishable fields that differ, and keeps dashboard-only ones as a draft', async () => {
    db.queryOne.mockResolvedValueOnce({
      payload: { matn: 'new text', type: 'مرفوع', notes: 'a note', grade: 'sahih' },
      deleted_at: null,
    });
    source.corpusRecord.mockResolvedValueOnce({ matn: 'old text', type: 'مرفوع', full_hadith: 'full' });
    api.backend.mockResolvedValueOnce(ok({
      changed: true,
      revision: { id: '42', before: { matn: 'old text' }, after: { matn: 'new text' } },
    }));

    const result = await publishRecord(session, 'hadith', '1', 'checked');

    expect(result).toEqual({ ok: true, changed: true });
    expect(api.backend).toHaveBeenCalledWith('/hadiths/1', {
      method: 'PATCH',
      token: 'tok',
      body: { changes: { matn: 'new text' }, reason: 'checked' },
    });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE studio_entities'), [
      'hadith', '1', JSON.stringify({ notes: 'a note', grade: 'sahih' }),
    ]);
    expect(db.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'publish', ref: '42', actorId: 7 }));
  });

  it('converts form values to column types', async () => {
    db.queryOne.mockResolvedValueOnce({ payload: { rutba: '3', kunya: '', tadlis: 1 }, deleted_at: null });
    source.corpusRecord.mockResolvedValueOnce({ rutba: 2, kunya: 'أبو فلان', tadlis: false });
    api.backend.mockResolvedValueOnce(ok({ changed: true, revision: { id: '1', before: {}, after: {} } }));

    await publishRecord(session, 'narrator', '5', null);

    expect(api.backend.mock.calls[0][1].body.changes).toEqual({ rutba: 3, kunya: null, tadlis: true });
  });

  it('drops a draft that already matches the corpus without calling the API', async () => {
    db.queryOne.mockResolvedValueOnce({ payload: { title: 'Same' }, deleted_at: null });
    source.corpusRecord.mockResolvedValueOnce({ title: 'Same' });

    expect(await publishRecord(session, 'book', '3')).toEqual({ ok: true, changed: false });
    expect(api.backend).not.toHaveBeenCalled();
    expect(sql()).toEqual(['DELETE']);
    expect(db.audit).not.toHaveBeenCalled();
  });

  it('leaves the draft untouched when the API refuses', async () => {
    db.queryOne.mockResolvedValueOnce({ payload: { matn: 'x' }, deleted_at: null });
    source.corpusRecord.mockResolvedValueOnce({ matn: 'y' });
    api.backend.mockResolvedValueOnce(refused(409, 'stale_revision'));

    const result = await publishRecord(session, 'hadith', '1');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/گۆڕانکاری/);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses dashboard-only types and locally created records', async () => {
    expect((await publishRecord(session, 'author', '1')).status).toBe(400);
    expect((await publishRecord(session, 'hadith', 'local:4')).status).toBe(400);
    expect(db.queryOne).not.toHaveBeenCalled();
  });
});

describe('publishIsnad', () => {
  it('sends nothing when the draft only carries flags on the published order', async () => {
    db.queryOne.mockResolvedValueOnce({ payload: { links: [link('1', { flagged: true }), link('2')] } });
    source.getHadith.mockResolvedValueOnce({ id: '9', hadith_has_rawy: corpusLinks(['1', '2']) });

    expect(await publishIsnad(session, '9')).toEqual({ ok: true, changed: false });
    expect(api.backend).not.toHaveBeenCalled();
  });

  it('publishes a reordered chain collector first and clears the draft', async () => {
    db.queryOne.mockResolvedValueOnce({ payload: { links: [link('1'), link('3')] } });
    source.getHadith.mockResolvedValueOnce({ id: '9', hadith_has_rawy: corpusLinks(['1', '2', '3']) });
    api.backend.mockResolvedValueOnce(ok({ changed: true, revision: { id: '77' } }));

    expect(await publishIsnad(session, '9')).toEqual({ ok: true, changed: true });
    expect(api.backend).toHaveBeenCalledWith('/hadiths/9/isnad', {
      method: 'PUT', token: 'tok', body: { narratorIds: ['1', '3'], reason: null },
    });
    expect(sql()).toEqual(['DELETE']);
    expect(db.audit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'isnad', ref: '77' }));
  });

  it('keeps a flagged draft as annotations after publishing', async () => {
    db.queryOne.mockResolvedValueOnce({ payload: { links: [link('1', { flagged: true }), link('3')] } });
    source.getHadith.mockResolvedValueOnce({ id: '9', hadith_has_rawy: corpusLinks(['1', '2', '3']) });
    api.backend.mockResolvedValueOnce(ok({ changed: true, revision: { id: '78' } }));

    await publishIsnad(session, '9');
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('publishHadith', () => {
  it('stops before the text when the chain is refused, so nothing is half-published', async () => {
    db.queryOne.mockResolvedValueOnce({ payload: { links: [link('1')] } });
    source.getHadith.mockResolvedValueOnce({ id: '9', hadith_has_rawy: corpusLinks(['1', '2']) });
    api.backend.mockResolvedValueOnce(refused(409, 'branched_isnad'));

    const result = await publishHadith(session, '9');

    expect(result).toMatchObject({ ok: false, code: 'branched_isnad' });
    expect(result.error).toMatch(/سەنەد/);
    expect(api.backend).toHaveBeenCalledTimes(1);
  });
});
