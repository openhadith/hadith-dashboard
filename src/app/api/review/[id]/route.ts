import { audit, query, queryOne } from '@/lib/db';
import { getEntity, sameValue, updateEntity } from '@/lib/crud';
import { publishHadith } from '@/lib/publish';
import { readSession, requirePermission } from '@/lib/session';

/** Workflow state and draft history for one corpus record. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const review = await queryOne(
    `SELECT r.*, u.name AS assignee_name FROM studio_review r
       LEFT JOIN studio_users u ON u.id = r.assignee_id
      WHERE r.entity_type = 'hadith' AND r.entity_id = $1`,
    [id],
  );
  const revisions = await query(
    `SELECT rv.id, rv.payload, rv.note, rv.created_at, u.name AS author_name
       FROM studio_revisions rv LEFT JOIN studio_users u ON u.id = rv.author_id
      WHERE rv.entity_type = 'hadith' AND rv.entity_id = $1
      ORDER BY rv.created_at DESC LIMIT 20`,
    [id],
  );
  return Response.json({ success: true, data: { review, revisions } });
}

const PERMISSION_FOR_STATUS = (status: string) =>
  status === 'approved' || status === 'published' ? 'approve'
    : status === 'rejected' ? 'reject'
    : status === 'duplicate' ? 'merge'
    : 'edit';

/**
 * Saves the workstation: the matn draft, a status change, or both.
 *
 * Approving publishes: pending drafts for this hadith (text and chain) are
 * sent to the API first, and only if that succeeds does the status move — to
 * `published` when the public site changed, `approved` when there was nothing
 * to send. A refused publish (e.g. a branched isnad) leaves the status as it
 * was and reports why.
 *
 * Body: { payload: { matn? }, note?, status? }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await readSession();
  const { payload, note, status } = await request.json();

  // Decide what this request actually changes before checking permissions, so
  // a reviewer (approve without edit) can approve an untouched record.
  const current = await getEntity('hadith', id);
  const matnChanged = typeof payload?.matn === 'string' && !sameValue(payload.matn, current?.data.matn);

  if (matnChanged || !status) {
    const denied = requirePermission(session, 'edit');
    if (denied) return denied;
  }
  if (status) {
    const denied = requirePermission(session, PERMISSION_FOR_STATUS(status));
    if (denied) return denied;
  }

  if (matnChanged) {
    await updateEntity('hadith', id, { matn: payload.matn }, session.user.id, note ?? null);
  }
  if (matnChanged || note) {
    await query(
      `INSERT INTO studio_revisions (entity_type, entity_id, author_id, payload, note)
       VALUES ('hadith', $1, $2, $3, $4)`,
      [id, session.user.id, JSON.stringify(matnChanged ? { matn: payload.matn } : {}), note ?? null],
    );
  }

  let finalStatus: string | null = status ?? null;
  let published = false;

  if (status === 'approved' || status === 'published') {
    const result = await publishHadith(session, id, note ?? null);
    if (!result.ok) {
      return Response.json(
        { success: false, error: result.error, code: result.code },
        { status: result.status && result.status < 500 ? 409 : 502 },
      );
    }
    published = result.changed;
    finalStatus = published ? 'published' : 'approved';
  }

  // Any hadith can be opened by id, so the first save or decision on one that
  // has never been queued puts it in the queue.
  const snapshot = {
    matn: String(current?.data.matn ?? '').slice(0, 400),
    type: current?.data.type ?? null,
    bookTitle: current?.data.bookTitle ?? null,
  };

  if (finalStatus) {
    const before = await queryOne<{ status: string }>(
      `SELECT status FROM studio_review WHERE entity_type = 'hadith' AND entity_id = $1`,
      [id],
    );
    await query(
      `INSERT INTO studio_review (entity_type, entity_id, status, snapshot)
       VALUES ('hadith', $2, $1, $3)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [finalStatus, id, JSON.stringify(snapshot)],
    );
    await audit({
      actorId: session.user.id,
      action: `status:${finalStatus}`,
      entityType: 'hadith',
      entityId: id,
      before: { status: before?.status ?? null },
      after: { status: finalStatus },
      reason: note ?? null,
    });
  } else if (matnChanged) {
    await query(
      `INSERT INTO studio_review (entity_type, entity_id, status, snapshot)
       VALUES ('hadith', $1, 'pending', $2)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET updated_at = now()`,
      [id, JSON.stringify(snapshot)],
    );
  }

  // Keeps the dashboard's "pick up where you left off" strip honest.
  await query(
    `INSERT INTO studio_activity (user_id, entity_type, entity_id, label, detail)
     VALUES ($1, 'hadith', $2, $3, $4)`,
    [session.user.id, id, String(payload?.matn ?? current?.data.matn ?? '').slice(0, 70), payload?.bookTitle ?? null],
  );

  return Response.json({ success: true, data: { status: finalStatus, published } });
}
