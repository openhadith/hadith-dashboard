import { query, audit } from '@/lib/db';
import { publishHadith } from '@/lib/publish';
import { readSession, requirePermission } from '@/lib/session';

/** Which permission each transition needs. Mirrors the role x permission matrix. */
const PERMISSION_FOR: Record<string, string> = {
  approved: 'approve',
  published: 'approve',
  rejected: 'reject',
  duplicate: 'merge',
  pending: 'edit',
  discuss: 'edit',
  research: 'edit',
  conflict: 'edit',
};

/**
 * Moves one or many records to a new status, or reassigns them.
 *
 * Bulk is the default shape rather than an add-on: the queue's selection bar
 * acts on a set, and issuing N requests for N rows would make the audit trail
 * unorderable and the UI slow.
 *
 * Body: { ids: number[], status?: string, assigneeId?: number, reason?: string }
 */
export async function POST(request: Request) {
  const session = await readSession();
  const body = await request.json();

  // Callers that hold review-row ids (the queue) pass `ids`; callers that only
  // know a corpus id (compare, workstation deep links) pass `entityIds`.
  let ids: number[] = (body.ids ?? []).map(Number).filter(Number.isFinite);

  if (!ids.length && Array.isArray(body.entityIds) && body.entityIds.length) {
    const resolved = await query<{ id: number }>(
      `SELECT id FROM studio_review
        WHERE entity_type = 'hadith' AND entity_id = ANY($1::text[])`,
      [body.entityIds.map(String)],
    );
    ids = resolved.map((r) => r.id);
  }

  if (!ids.length) {
    return Response.json({ success: false, error: 'هیچ ڕەکۆردێک هەڵنەبژێردراوە' }, { status: 400 });
  }

  const { status, assigneeId, reason } = body;

  const needed = status ? (PERMISSION_FOR[status] ?? 'edit') : 'edit';
  const denied = requirePermission(session, needed);
  if (denied) return denied;

  // Read the "before" state first so the audit rows record an actual diff
  // rather than just the new value.
  const before = await query<{
    id: number; entity_id: string; status: string; assignee_id: number | null;
  }>(
    `SELECT id, entity_id, status, assignee_id FROM studio_review WHERE id = ANY($1::int[])`,
    [ids],
  );

  // Approving publishes each record's drafts. Records the API refuses keep
  // their status and are reported back; the rest move to `published` when the
  // public site changed, `approved` when there was nothing to send.
  const statusOf = new Map<number, string>();
  const failed: Array<{ id: number; entityId: string; error: string }> = [];
  for (const row of before) {
    if (status !== 'approved' && status !== 'published') {
      if (status) statusOf.set(row.id, status);
      continue;
    }
    const result = await publishHadith(session, row.entity_id, reason ?? null);
    if (result.ok) statusOf.set(row.id, result.changed ? 'published' : 'approved');
    else failed.push({ id: row.id, entityId: row.entity_id, error: result.error ?? '' });
  }

  const moving = before.filter((r) => !failed.some((f) => f.id === r.id));
  const updated: unknown[] = [];

  for (const target of status ? [...new Set(statusOf.values())] : [null]) {
    const group = moving.filter((r) => target === null || statusOf.get(r.id) === target);
    if (!group.length) continue;

    const sets: string[] = ['updated_at = now()'];
    const args: unknown[] = [];
    if (target) {
      args.push(target);
      sets.push(`status = $${args.length}`);
    }
    if (assigneeId !== undefined) {
      args.push(assigneeId === null ? null : Number(assigneeId));
      sets.push(`assignee_id = $${args.length}`);
    }
    args.push(group.map((r) => r.id));
    updated.push(...await query(
      `UPDATE studio_review SET ${sets.join(', ')}
        WHERE id = ANY($${args.length}::int[])
        RETURNING id, entity_id, status, assignee_id`,
      args,
    ));

    for (const row of group) {
      await audit({
        actorId: session.user.id,
        action: target ? `status:${target}` : 'assign',
        entityType: 'hadith',
        entityId: row.entity_id,
        before: { status: row.status, assignee: row.assignee_id },
        after: {
          status: target ?? row.status,
          assignee: assigneeId !== undefined ? assigneeId : row.assignee_id,
        },
        reason: reason ?? null,
      });
    }
  }

  if (failed.length && !updated.length) {
    return Response.json(
      { success: false, error: failed[0].error, data: { failed } },
      { status: 409 },
    );
  }
  return Response.json({ success: true, data: { updated, count: updated.length, failed } });
}
