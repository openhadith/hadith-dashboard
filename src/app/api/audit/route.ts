import { audit, query, queryOne } from '@/lib/db';
import { backend } from '@/lib/backend';
import { accountError } from '@/lib/accounts';
import { isEntityType } from '@/lib/entities';
import { forgetSessions, readSession, requirePermission } from '@/lib/session';

/** Audit trail, newest first, optionally filtered by actor or action. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const actor = p.get('actor');
  const action = p.get('action');
  const limit = Math.min(200, Number(p.get('limit') ?? 60));

  const where: string[] = ['TRUE'];
  const args: unknown[] = [];
  if (actor) { args.push(Number(actor)); where.push(`a.actor_id = $${args.length}`); }
  if (action) { args.push(action); where.push(`a.action LIKE $${args.length}`); }

  args.push(limit);
  const rows = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.before, a.after,
            a.reason, a.reverted, a.created_at,
            u.id AS actor_id, u.name AS actor_name, u.avatar_tone
       FROM studio_audit a LEFT JOIN studio_users u ON u.id = a.actor_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC LIMIT $${args.length}`,
    args,
  );

  const actors = await query(
    `SELECT DISTINCT u.id, u.name FROM studio_audit a
       JOIN studio_users u ON u.id = a.actor_id ORDER BY u.name`,
  );

  return Response.json({ success: true, data: { rows, actors } });
}

/**
 * Reverts one audited change.
 *
 * The log stays append-only: reverting does not erase or rewrite the original
 * row, it flags it and writes a *new* entry recording the undo. That is the
 * comp's note #4 — "even a revert is logged" — and the only way an audit trail
 * is worth trusting.
 *
 * Body: { id }
 */
export async function POST(request: Request) {
  const session = await readSession();
  const denied = requirePermission(session, 'admin');
  if (denied) return denied;

  const { id } = await request.json();

  const entry = await queryOne<{
    id: number; action: string; entity_type: string | null; entity_id: string | null;
    before: Record<string, unknown> | null; after: Record<string, unknown> | null;
    reverted: boolean; ref: string | null;
  }>(`SELECT * FROM studio_audit WHERE id = $1`, [id]);

  if (!entry) {
    return Response.json({ success: false, error: 'تۆمارەکە نەدۆزرایەوە' }, { status: 404 });
  }
  if (entry.reverted) {
    return Response.json({ success: false, error: 'پێشتر گەڕێندراوەتەوە' }, { status: 400 });
  }
  // Only state changes are reversible; a login is a fact, not a setting.
  const reversible = /^status:|^assign$|^edit$|^role_change$/.test(entry.action) && !!entry.before
    || (entry.action === 'edit' && isEntityType(entry.entity_type ?? ''))
    || (entry.action === 'publish' && !!entry.ref);
  if (!reversible) {
    return Response.json(
      { success: false, error: 'ئەم جۆرە کردارە ناگەڕێنرێتەوە' },
      { status: 400 },
    );
  }

  const before = (entry.before ?? {}) as { status?: string; assignee?: number | null; role?: string };

  if (entry.action === 'publish') {
    // Undo on the public site: the API re-applies the revision's `before`, and
    // refuses if the record has changed since rather than overwrite that work.
    const r = await backend(`/revisions/${entry.ref}/revert`, {
      method: 'POST',
      token: session.token,
      body: { reason: `گەڕاندنەوەی تۆماری #${id}` },
    });
    if (!r.ok) {
      const error = r.code === 'stale_revision'
        ? 'دوای ئەم بڵاوکردنەوەیە گۆڕانکاری تر کراوە؛ سەرەتا ئەوانە بگەڕێنەرەوە'
        : r.code === 'already_reverted' ? 'پێشتر گەڕێندراوەتەوە'
        : r.error ?? 'گەڕاندنەوە سەرکەوتوو نەبوو';
      return Response.json({ success: false, error }, { status: r.status || 502 });
    }
  } else if (entry.action === 'edit' && isEntityType(entry.entity_type ?? '')) {
    // Restores the draft as it was before this save (none, if there was none).
    if (entry.before) {
      await query(
        `UPDATE studio_entities SET payload = $3, updated_by = $4, updated_at = now(), deleted_at = NULL
          WHERE entity_type = $1 AND entity_id = $2`,
        [entry.entity_type, entry.entity_id, JSON.stringify(entry.before), session.user.id],
      );
    } else {
      await query(
        `DELETE FROM studio_entities WHERE entity_type = $1 AND entity_id = $2 AND origin = 'corpus'`,
        [entry.entity_type, entry.entity_id],
      );
    }
  } else if (entry.action === 'role_change' && before.role) {
    const profile = await queryOne<{ backend_user_id: string | null }>(
      `SELECT backend_user_id FROM studio_users WHERE id = $1`,
      [entry.entity_id],
    );
    if (profile?.backend_user_id) {
      const r = await backend(`/admin/users/${profile.backend_user_id}`, {
        method: 'PATCH',
        token: session.token,
        body: { role: before.role },
      });
      if (!r.ok) {
        return Response.json({ success: false, error: accountError(r.code, r.error) }, { status: r.status || 502 });
      }
      forgetSessions();
    }
    await query(`UPDATE studio_users SET role = $1 WHERE id = $2`, [before.role, entry.entity_id]);
  } else if (entry.entity_id) {
    const sets: string[] = ['updated_at = now()'];
    const args: unknown[] = [];
    if (before.status) { args.push(before.status); sets.push(`status = $${args.length}`); }
    if (before.assignee !== undefined) {
      args.push(before.assignee); sets.push(`assignee_id = $${args.length}`);
    }
    if (args.length) {
      args.push(entry.entity_id);
      await query(
        `UPDATE studio_review SET ${sets.join(', ')}
          WHERE entity_type = 'hadith' AND entity_id = $${args.length}`,
        args,
      );
    }
  }

  // Flag, don't delete. The original row remains readable forever.
  await query(`UPDATE studio_audit SET reverted = TRUE WHERE id = $1`, [id]);

  await audit({
    actorId: session.user.id,
    action: 'revert',
    entityType: entry.entity_type,
    entityId: entry.entity_id,
    before: entry.after,
    after: entry.before,
    reason: `گەڕاندنەوەی تۆماری #${id}`,
  });

  return Response.json({ success: true });
}
