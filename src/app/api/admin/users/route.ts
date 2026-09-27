import { audit, query, queryOne } from '@/lib/db';
import { backend } from '@/lib/backend';
import { accountError, refreshAccounts } from '@/lib/accounts';
import { forgetSessions, readSession, requirePermission, syncProfile, type BackendUser } from '@/lib/session';

/** Users, teams, memberships and team-book scopes — everything Admin Users paints. */
export async function GET() {
  const session = await readSession();
  await refreshAccounts(session);

  const [users, teams, members, books] = await Promise.all([
    query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_tone, u.status, u.last_seen,
              (SELECT count(*)::int FROM studio_review r WHERE r.assignee_id = u.id) AS workload
         FROM studio_users u WHERE u.backend_user_id IS NOT NULL ORDER BY u.id`,
    ),
    query(
      `SELECT t.id, t.name, t.color, t.scope, t.lead_id, u.name AS lead_name,
              (SELECT count(*)::int FROM studio_review r WHERE r.team_id = t.id) AS total,
              (SELECT count(*)::int FROM studio_review r
                WHERE r.team_id = t.id AND r.status IN ('approved','published')) AS done
         FROM studio_teams t LEFT JOIN studio_users u ON u.id = t.lead_id
        ORDER BY t.id`,
    ),
    query(
      `SELECT tm.team_id, tm.user_id, tm.role, u.name, u.avatar_tone
         FROM studio_team_members tm JOIN studio_users u ON u.id = tm.user_id
        ORDER BY tm.team_id, u.id`,
    ),
    query(`SELECT team_id, book_id, book_title FROM studio_team_books ORDER BY team_id`),
  ]);

  return Response.json({ success: true, data: { users, teams, members, books } });
}

/** Creates an account in the API. Body: { name, email, password, role } */
export async function POST(request: Request) {
  const session = await readSession();
  const denied = requirePermission(session, 'admin');
  if (denied) return denied;

  const { name, email, password, role } = await request.json();
  const r = await backend<BackendUser & { id: string | number }>('/admin/users', {
    method: 'POST',
    token: session.token,
    body: { username: name, email, password, role },
  });
  if (!r.ok || !r.data) {
    const error = r.status === 409 ? 'ئەم ئیمەیلە پێشتر هەیە'
      : r.status === 400 ? 'زانیارییەکان دروست نین (وشەی نهێنی لانیکەم ٨ پیت)'
      : accountError(r.code, r.error);
    return Response.json({ success: false, error }, { status: r.status || 502 });
  }

  const profile = await syncProfile({ ...r.data, id: String(r.data.id) }, { touch: false });
  await audit({
    actorId: session.user.id,
    action: 'user_create',
    entityType: 'user',
    entityId: String(profile.id),
    before: null,
    after: { name, email, role },
  });
  return Response.json({ success: true, data: profile }, { status: 201 });
}

/** Changes a user's role in the API. Body: { userId (profile id), role } */
export async function PATCH(request: Request) {
  const session = await readSession();
  const denied = requirePermission(session, 'admin');
  if (denied) return denied;

  const { userId, role } = await request.json();

  const profile = await queryOne<{ backend_user_id: string | null; role: string }>(
    `SELECT backend_user_id, role FROM studio_users WHERE id = $1`,
    [userId],
  );
  if (!profile?.backend_user_id) {
    return Response.json({ success: false, error: 'ئەم پرۆفایلە بە هەژمارێکەوە نەبەستراوە' }, { status: 400 });
  }

  const r = await backend(`/admin/users/${profile.backend_user_id}`, {
    method: 'PATCH',
    token: session.token,
    body: { role },
  });
  if (!r.ok) {
    return Response.json({ success: false, error: accountError(r.code, r.error) }, { status: r.status || 502 });
  }

  await query(`UPDATE studio_users SET role = $1 WHERE id = $2`, [role, userId]);
  // The changed user's cached permissions must not outlive the change.
  forgetSessions();

  await audit({
    actorId: session.user.id,
    action: 'role_change',
    entityType: 'user',
    entityId: String(userId),
    before: { role: profile.role },
    after: { role },
  });

  return Response.json({ success: true });
}
