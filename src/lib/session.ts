import { cookies } from 'next/headers';
import { queryOne } from './db';
import { backend } from './backend';

/**
 * Identity comes from the hadith API.
 *
 * Signing in exchanges an email and password for the API's JWT, kept in an
 * httpOnly cookie. Roles and permissions are resolved by the API from its role
 * tables — the same matrix the Admin screen edits — so there is one account
 * system for the public site and the dashboard.
 *
 * `studio_users` is this dashboard's profile of each account (avatar tone,
 * presence, team membership, workload), linked by `backend_user_id`. Its `id`
 * is what every workflow table references.
 */

export const SESSION_COOKIE = 'studio_token';

export interface StudioUser {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_tone: string;
  status: string;
}

export interface StudioSession {
  user: StudioUser;
  /** Permission keys granted to this user's role: view, edit, approve, ... */
  permissions: string[];
  /** The API token, for calls that act as this user (publishing). */
  token: string;
}

export interface BackendUser { id: string; username: string; email: string; role: string; roles: string[] }
interface BackendMe { user: BackendUser; permissions: string[] }

// Asking the API "who is this" on every render would put it on every path. A
// few seconds of staleness is safe: the API re-checks permissions itself on
// every corpus write, and a matrix change clears this cache.
const TTL_MS = 10_000;
type Entry = { at: number; permissions: string[]; user: StudioUser };
const g = globalThis as unknown as { studioSessionCache?: Map<string, Entry> };
const cache = (g.studioSessionCache ??= new Map());

/** Drops cached identities, e.g. after the permission matrix changes. */
export function forgetSessions() {
  cache.clear();
}

const PROFILE = 'id, name, email, role, avatar_tone, status';

/**
 * Finds or creates the dashboard profile for an API account.
 *
 * A profile already linked to the account wins; otherwise an unlinked profile
 * with the same email is claimed (so seeded demo profiles keep their teams and
 * workload); otherwise a new one is created.
 */
export async function syncProfile(u: BackendUser, { touch = true } = {}): Promise<StudioUser> {
  const args = [u.id, u.username, u.email, u.role];
  // `touch` marks the account as seen; an admin listing accounts must not.
  const seen = touch ? ', last_seen = now()' : '';
  return (
    (await queryOne<StudioUser>(
      `UPDATE studio_users SET name = $2, email = $3, role = $4${seen}
        WHERE backend_user_id = $1 RETURNING ${PROFILE}`,
      args,
    )) ??
    (await queryOne<StudioUser>(
      `UPDATE studio_users SET backend_user_id = $1, name = $2, role = $4${seen}
        WHERE lower(email) = lower($3) AND backend_user_id IS NULL RETURNING ${PROFILE}`,
      args,
    )) ??
    (await queryOne<StudioUser>(
      `INSERT INTO studio_users (backend_user_id, name, email, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET backend_user_id = EXCLUDED.backend_user_id, name = EXCLUDED.name, role = EXCLUDED.role
       RETURNING ${PROFILE}`,
      args,
    ))!
  );
}

async function resolve(token: string): Promise<Entry | null> {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  const r = await backend<BackendMe>('/auth/me', { token });
  if (!r.ok || !r.data) {
    cache.delete(token);
    return null;
  }
  const entry = { at: Date.now(), permissions: r.data.permissions, user: await syncProfile(r.data.user) };
  cache.set(token, entry);
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
  return entry;
}

/**
 * Exchanges credentials for a session and sets the cookie.
 * Route handlers only: cookies cannot be set from a server component.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<{ session: StudioSession } | { error: string; status: number }> {
  const r = await backend<{ token: string; user: BackendUser; permissions: string[] }>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  if (!r.ok || !r.data) {
    if (r.status === 401 || r.status === 400) {
      return { error: 'ئیمەیل یان وشەی نهێنی هەڵەیە', status: 401 };
    }
    if (r.status === 429) {
      return { error: 'هەوڵی هەڵە زۆر بوو؛ ئەم هەژمارە بۆ ماوەیەک داخراوە. دواتر هەوڵ بدەرەوە.', status: 429 };
    }
    return { error: `پەیوەندی بە API نەکرا (${r.error ?? r.status})`, status: 502 };
  }

  // An account with no editorial role (e.g. a legacy registration) sees nothing here.
  if (!r.data.permissions.includes('view')) {
    return { error: 'ئەم هەژمارە هیچ ڕۆڵێکی لە دەزگاکەدا نییە', status: 403 };
  }

  const user = await syncProfile(r.data.user);
  const { token, permissions } = r.data;
  cache.set(token, { at: Date.now(), permissions, user });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    // Matches the API's default token lifetime; an expired token just fails /auth/me.
    maxAge: 60 * 60 * 24 * 7,
  });

  return { session: { user, permissions, token } };
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    cache.delete(token);
    // Revoked at the API, so a copied cookie stops working too.
    await backend('/auth/logout', { method: 'POST', token });
  }
  jar.delete(SESSION_COOKIE);
}

/** The signed-in session, or null when nobody (or an account without access) is signed in. */
export async function readSessionOrNull(): Promise<StudioSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const entry = await resolve(token);
  if (!entry || !entry.permissions.includes('view')) return null;
  return { user: entry.user, permissions: entry.permissions, token };
}

/**
 * The signed-in session, for code paths that cannot proceed without one.
 *
 * Route handlers use this and let the throw surface as a 500 only if the UI
 * has already failed to gate — pages redirect to /login instead.
 */
export async function readSession(): Promise<StudioSession> {
  const session = await readSessionOrNull();
  if (!session) throw new Error('studio: not signed in');
  return session;
}

/** Guard for mutating endpoints. Returns null when allowed, a Response when not. */
export function requirePermission(session: StudioSession, permission: string) {
  if (session.permissions.includes(permission)) return null;
  return Response.json(
    {
      success: false,
      error: `ڕۆڵی «${session.user.role}» مۆڵەتی «${permission}»ی نییە`,
      permission,
      role: session.user.role,
    },
    { status: 403 },
  );
}
