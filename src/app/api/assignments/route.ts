import { audit, query } from '@/lib/db';
import { readSession, requirePermission } from '@/lib/session';

/**
 * Auto-balances the open queue across a team's members.
 *
 * Deliberately simple and explainable: take everything still open, deal it out
 * round-robin to the least-loaded members first. A reviewer has to be able to
 * look at the result and understand why they got what they got — an opaque
 * scoring function would make the "why is this mine?" question unanswerable.
 *
 * Body: { teamId?: number }
 */
export async function POST(request: Request) {
  const session = await readSession();
  const denied = requirePermission(session, 'admin');
  if (denied) return denied;

  const { teamId } = await request.json().catch(() => ({ teamId: null }));

  const members = await query<{ id: number; name: string; load: string }>(
    `SELECT u.id, u.name,
            (SELECT count(*)::text FROM studio_review r
              WHERE r.assignee_id = u.id AND r.status NOT IN ('approved','published','rejected')) AS load
       FROM studio_users u
      WHERE u.status = 'on'
        AND u.role <> 'viewer'
        ${teamId ? `AND EXISTS (SELECT 1 FROM studio_team_members tm
                                  WHERE tm.user_id = u.id AND tm.team_id = $1)` : ''}
      ORDER BY 3`,
    teamId ? [teamId] : [],
  );

  if (!members.length) {
    return Response.json({ success: false, error: 'هیچ ئەندامێکی بەردەست نییە' }, { status: 400 });
  }

  const open = await query<{ id: number; assignee_id: number | null }>(
    `SELECT id, assignee_id FROM studio_review
      WHERE status NOT IN ('approved','published','rejected')
        ${teamId ? 'AND team_id = $1' : ''}
      ORDER BY priority DESC, updated_at ASC`,
    teamId ? [teamId] : [],
  );

  const target = Math.ceil(open.length / members.length);
  const loads = new Map(members.map((m) => [m.id, 0]));
  let moved = 0;

  for (const row of open) {
    // Whoever currently has the least work takes the next record.
    let best = members[0].id;
    for (const m of members) if ((loads.get(m.id) ?? 0) < (loads.get(best) ?? 0)) best = m.id;

    loads.set(best, (loads.get(best) ?? 0) + 1);
    if (row.assignee_id !== best) {
      await query(`UPDATE studio_review SET assignee_id = $1, updated_at = now() WHERE id = $2`, [
        best, row.id,
      ]);
      moved++;
    }
  }

  await audit({
    actorId: session.user.id,
    action: 'rebalance',
    entityType: 'team',
    entityId: teamId ? String(teamId) : null,
    before: null,
    after: { moved, members: members.length, target },
    reason: 'هاوسەنگکردنی خۆکار',
  });

  return Response.json({ success: true, data: { moved, members: members.length, target } });
}
