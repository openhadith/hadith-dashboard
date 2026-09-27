import { audit, query } from '@/lib/db';
import { readSession, requirePermission } from '@/lib/session';

/**
 * Resolves flagged issues.
 *
 * Resolution is a timestamp, not a delete: the issue stays on the record so the
 * history of what was once wrong survives, which is what makes the quality
 * trend line meaningful over time.
 *
 * Body: { issueIds: number[] }
 */
export async function POST(request: Request) {
  const session = await readSession();
  const denied = requirePermission(session, 'edit');
  if (denied) return denied;

  const { issueIds } = await request.json();
  const ids: number[] = (issueIds ?? []).map(Number).filter(Number.isFinite);
  if (!ids.length) {
    return Response.json({ success: false, error: 'هیچ کێشەیەک هەڵنەبژێردراوە' }, { status: 400 });
  }

  const resolved = await query<{ id: number; type: string; review_id: number }>(
    `UPDATE studio_issues SET resolved_at = now()
      WHERE id = ANY($1::int[]) AND resolved_at IS NULL
      RETURNING id, type, review_id`,
    [ids],
  );

  for (const r of resolved) {
    await audit({
      actorId: session.user.id,
      action: 'issue_resolved',
      entityType: 'issue',
      entityId: String(r.id),
      before: { type: r.type, resolved: false },
      after: { type: r.type, resolved: true },
    });
  }

  return Response.json({ success: true, data: { count: resolved.length } });
}
