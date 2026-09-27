import { audit, query, queryOne } from '@/lib/db';
import { readSession, requirePermission } from '@/lib/session';
import type { EditableLink } from '@/lib/isnad';

/** Short readable form of a chain for the audit trail's before/after diff. */
function summarise(links: EditableLink[] | undefined | null) {
  if (!links) return null;
  return {
    narrators: links.length,
    chain: links.map((l) => l.rawy?.Shohra || l.rawy?.Name).join(' ← ').slice(0, 240),
    flagged: links.filter((l) => l.flagged).length,
  };
}

/**
 * Saves an edited chain for one hadith. Body: { links, reason? }
 *
 * The chain is replaced whole: order is the meaning of an isnad, so a partial
 * patch ("move link 3 up") would be ambiguous against a chain someone else has
 * since edited.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await readSession();
  const denied = requirePermission(session, 'edit');
  if (denied) return denied;

  const { links, reason } = (await request.json()) as { links: EditableLink[]; reason?: string };

  if (!Array.isArray(links) || links.length === 0) {
    return Response.json({ success: false, error: 'زنجیرە نابێت بەتاڵ بێت' }, { status: 400 });
  }
  const ids = links.map((l) => String(l.rawyId));
  if (new Set(ids).size !== ids.length) {
    return Response.json(
      { success: false, error: 'هەمان ڕاوی دوو جار لە زنجیرەکەدایە' },
      { status: 400 },
    );
  }

  const before = await queryOne<{ payload: { links?: EditableLink[] } }>(
    `SELECT payload FROM studio_entities WHERE entity_type = 'isnad' AND entity_id = $1`,
    [id],
  );

  await query(
    `INSERT INTO studio_entities (entity_type, entity_id, origin, payload, created_by, updated_by)
     VALUES ('isnad', $1, 'corpus', $2, $3, $3)
     ON CONFLICT (entity_type, entity_id)
     DO UPDATE SET payload = EXCLUDED.payload, updated_by = EXCLUDED.updated_by,
                   updated_at = now(), deleted_at = NULL`,
    [id, JSON.stringify({ links }), session.user.id],
  );

  await audit({
    actorId: session.user.id,
    action: 'isnad_edit',
    entityType: 'hadith',
    entityId: id,
    before: summarise(before?.payload?.links) ?? { chain: 'ڕەسەن' },
    after: summarise(links),
    reason: reason ?? null,
  });

  return Response.json({ success: true });
}

/** Discards the edited chain, falling back to the corpus chain. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await readSession();
  const denied = requirePermission(session, 'edit');
  if (denied) return denied;

  const before = await queryOne<{ payload: { links?: EditableLink[] } }>(
    `DELETE FROM studio_entities WHERE entity_type = 'isnad' AND entity_id = $1 RETURNING payload`,
    [id],
  );

  if (before) {
    await audit({
      actorId: session.user.id,
      action: 'isnad_reset',
      entityType: 'hadith',
      entityId: id,
      before: summarise(before.payload?.links),
      after: { chain: 'ڕەسەن' },
    });
  }

  return Response.json({ success: true });
}
