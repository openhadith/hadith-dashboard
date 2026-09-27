import { audit } from '@/lib/db';
import { backend } from '@/lib/backend';
import { accountError, permissionMatrix } from '@/lib/accounts';
import { forgetSessions, readSession, requirePermission } from '@/lib/session';

/** The full role x permission matrix, as the API holds it. */
export async function GET() {
  const session = await readSession();
  return Response.json({ success: true, data: await permissionMatrix(session) });
}

/**
 * Toggles one cell of the matrix.
 *
 * The matrix lives in the API's role tables, which both the dashboard and the
 * API's own write endpoints resolve permissions from — so flipping a cell
 * changes what that role can do on the very next request, including whether
 * the API accepts a publish.
 *
 * Body: { role, permission, allowed }
 */
export async function PATCH(request: Request) {
  const session = await readSession();
  const denied = requirePermission(session, 'admin');
  if (denied) return denied;

  const { role, permission, allowed } = await request.json();

  const r = await backend('/admin/permissions', {
    method: 'PUT',
    token: session.token,
    body: { role, permission, allowed: !!allowed },
  });
  if (!r.ok) {
    return Response.json({ success: false, error: accountError(r.code, r.error) }, { status: r.status || 502 });
  }

  forgetSessions();

  await audit({
    actorId: session.user.id,
    action: 'permission_change',
    entityType: 'role',
    entityId: role,
    before: { [permission]: !allowed },
    after: { [permission]: !!allowed },
  });

  return Response.json({ success: true });
}
