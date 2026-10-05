import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The read-only deployment mode, which is the only thing standing between a
 * shared link and the corpus. Each case loads the modules fresh so the flags —
 * read once at module load — reflect that case's environment.
 */

const db = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), audit: vi.fn() }));
const api = vi.hoisted(() => ({ backend: vi.fn() }));
const source = vi.hoisted(() => ({ corpusRecord: vi.fn(), getHadith: vi.fn() }));

vi.mock('./db', () => db);
vi.mock('./backend', () => ({ ...api, API: 'http://api.test' }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('./crud', async (original) => ({
  ...(await original<typeof import('./crud')>()),
  corpusRecord: source.corpusRecord,
}));
vi.mock('./corpus', async (original) => ({
  ...(await original<typeof import('./corpus')>()),
  getHadith: source.getHadith,
}));

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return {
    config: await import('./config'),
    session: await import('./session'),
    publish: await import('./publish'),
  };
}

const WRITABLE = { DASHBOARD_READ_ONLY: undefined, DASHBOARD_LOCAL_SIGNIN: undefined };
const READONLY = { DASHBOARD_READ_ONLY: 'true', DASHBOARD_LOCAL_SIGNIN: undefined };
const LOCAL = { DASHBOARD_READ_ONLY: undefined, DASHBOARD_LOCAL_SIGNIN: 'true' };

const sessionWith = (permissions: string[]) => ({
  user: { id: 1, name: 'T', email: 't@x.org', role: 'supervisor', avatar_tone: 'g', status: 'on' },
  permissions,
  token: 'tok',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mode flags', () => {
  it('is writable by default', async () => {
    const { config } = await load(WRITABLE);
    expect(config.READ_ONLY).toBe(false);
    expect(config.LOCAL_SIGNIN).toBe(false);
  });

  it('treats only the exact string "true" as on', async () => {
    const { config } = await load({ DASHBOARD_READ_ONLY: 'TRUE', DASHBOARD_LOCAL_SIGNIN: '1' });
    expect(config.READ_ONLY).toBe(false);
    expect(config.LOCAL_SIGNIN).toBe(false);
  });

  it('forces read-only on whenever local sign-in is on', async () => {
    const { config } = await load(LOCAL);
    expect(config.LOCAL_SIGNIN).toBe(true);
    // The interlock: a passwordless session must never be able to write.
    expect(config.READ_ONLY).toBe(true);
  });
});

describe('requirePermission', () => {
  it('allows writes a role is granted when the deployment is writable', async () => {
    const { session } = await load(WRITABLE);
    expect(session.requirePermission(sessionWith(['view', 'edit']), 'edit')).toBeNull();
  });

  it('still refuses a permission the role lacks', async () => {
    const { session } = await load(WRITABLE);
    const denied = session.requirePermission(sessionWith(['view']), 'edit');
    expect(denied?.status).toBe(403);
  });

  for (const permission of ['edit', 'approve', 'reject', 'merge', 'admin']) {
    it(`refuses "${permission}" in read-only even for a role that holds it`, async () => {
      const { session } = await load(READONLY);
      const denied = session.requirePermission(
        sessionWith(['view', 'edit', 'approve', 'reject', 'merge', 'admin']),
        permission,
      );
      expect(denied?.status).toBe(403);
      await expect(denied!.json()).resolves.toMatchObject({ code: 'read_only' });
    });
  }

  it('still allows reading in read-only', async () => {
    const { session } = await load(READONLY);
    expect(session.requirePermission(sessionWith(['view']), 'view')).toBeNull();
  });
});

describe('publishing', () => {
  const corpusDraft = { payload: { matn: 'new' }, deleted_at: null };

  it('refuses a record publish in read-only without calling the API', async () => {
    const { publish } = await load(READONLY);
    const result = await publish.publishRecord(sessionWith(['view', 'approve']), 'hadith', '1');
    expect(result).toMatchObject({ ok: false, changed: false, code: 'read_only', status: 403 });
    expect(api.backend).not.toHaveBeenCalled();
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it('refuses an isnad publish in read-only without calling the API', async () => {
    const { publish } = await load(READONLY);
    const result = await publish.publishIsnad(sessionWith(['view', 'approve']), '1');
    expect(result).toMatchObject({ ok: false, code: 'read_only' });
    expect(api.backend).not.toHaveBeenCalled();
  });

  it('refuses when local sign-in is what turned read-only on', async () => {
    const { publish } = await load(LOCAL);
    const result = await publish.publishHadith(sessionWith(['view', 'approve']), '1');
    expect(result).toMatchObject({ ok: false, code: 'read_only' });
    expect(api.backend).not.toHaveBeenCalled();
  });

  it('publishes normally when the deployment is writable', async () => {
    const { publish } = await load(WRITABLE);
    db.queryOne.mockResolvedValueOnce(corpusDraft);
    source.corpusRecord.mockResolvedValueOnce({ matn: 'old' });
    api.backend.mockResolvedValueOnce({
      ok: true, status: 200, error: null, code: null,
      data: { changed: true, revision: { id: '9', before: {}, after: {} } },
    });

    const result = await publish.publishRecord(sessionWith(['view', 'approve']), 'hadith', '1');
    expect(result).toEqual({ ok: true, changed: true });
    expect(api.backend).toHaveBeenCalledOnce();
  });
});

describe('local sign-in', () => {
  it('refuses a password sign-in, so the two modes cannot be mixed', async () => {
    const { session } = await load(LOCAL);
    const result = await session.signIn('zana@muhaqqiq.org', 'hadith-dev');
    expect(result).toMatchObject({ status: 403 });
    expect(api.backend).not.toHaveBeenCalled();
  });

  it('refuses a passwordless sign-in when the mode is off', async () => {
    const { session } = await load(WRITABLE);
    const result = await session.signInLocal(1);
    expect(result).toMatchObject({ status: 403 });
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it('rejects ids that are not a positive integer', async () => {
    const { session } = await load(LOCAL);
    for (const bad of ['abc', '', null, undefined, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const result = await session.signInLocal(bad);
      expect(result).toMatchObject({ status: 400 });
    }
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it('reports an id with no profile behind it', async () => {
    const { session } = await load(LOCAL);
    db.queryOne.mockResolvedValueOnce(null);
    expect(await session.signInLocal(42)).toMatchObject({ status: 404 });
  });

  it('lists no accounts when the mode is off', async () => {
    const { session } = await load(WRITABLE);
    expect(await session.listLocalAccounts()).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});
