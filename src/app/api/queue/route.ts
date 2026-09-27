import { query } from '@/lib/db';
import { readSession } from '@/lib/session';

/**
 * The validation queue.
 *
 * Returns one page of rows plus the counts behind every filter chip, in a
 * single round trip — the chips have to show totals for the *whole* queue, not
 * for the current page, so counting client-side would be wrong.
 *
 * Supported filters: status, issue, assignee (`me` or an id), team, q (matn
 * substring), sort (`recent` | `oldest` | `priority`).
 */
export async function GET(request: Request) {
  const session = await readSession();
  const url = new URL(request.url);
  const p = url.searchParams;

  const status = p.get('status');
  const issue = p.get('issue');
  const assigneeRaw = p.get('assignee');
  const team = p.get('team');
  const q = p.get('q')?.trim();
  const sort = p.get('sort') ?? 'recent';
  const page = Math.max(1, Number(p.get('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(p.get('limit') ?? 25)));

  const assignee =
    assigneeRaw === 'me' ? session.user.id : assigneeRaw ? Number(assigneeRaw) : null;

  // Built as a parallel array so every value stays parameterised.
  const where: string[] = [`r.entity_type = 'hadith'`];
  const args: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    args.push(value);
    where.push(clause.replace('?', `$${args.length}`));
  };

  if (status && status !== 'all') add('r.status = ?', status);
  if (assignee !== null && Number.isFinite(assignee)) add('r.assignee_id = ?', assignee);
  if (team) add('r.team_id = ?', Number(team));
  if (q) add(`r.snapshot->>'matn' ILIKE ?`, `%${q}%`);
  if (issue) {
    add(
      `EXISTS (SELECT 1 FROM studio_issues i
               WHERE i.review_id = r.id AND i.resolved_at IS NULL AND i.type = ?)`,
      issue,
    );
  }

  const whereSql = where.join(' AND ');
  const orderSql =
    sort === 'oldest'
      ? 'r.updated_at ASC'
      : sort === 'priority'
        ? 'r.priority DESC, r.updated_at DESC'
        : 'r.updated_at DESC';

  const offset = (page - 1) * limit;

  const [rows, totals, statusCounts, issueCounts] = await Promise.all([
    query(
      `SELECT r.id, r.entity_id, r.status, r.grade, r.priority, r.updated_at,
              r.snapshot,
              u.id AS assignee_id, u.name AS assignee_name, u.avatar_tone,
              t.name AS team_name, t.color AS team_color,
              COALESCE(
                (SELECT json_agg(json_build_object('type', i.type, 'severity', i.severity, 'detector', i.detector))
                 FROM studio_issues i WHERE i.review_id = r.id AND i.resolved_at IS NULL),
                '[]'::json
              ) AS issues
         FROM studio_review r
         LEFT JOIN studio_users u ON u.id = r.assignee_id
         LEFT JOIN studio_teams t ON t.id = r.team_id
        WHERE ${whereSql}
        ORDER BY ${orderSql}
        LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
    query<{ count: string }>(
      `SELECT count(*)::text AS count FROM studio_review r WHERE ${whereSql}`,
      args,
    ),
    // Chip counts ignore the status filter itself — otherwise selecting one chip
    // would zero out all the others.
    query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count FROM studio_review
        WHERE entity_type = 'hadith' GROUP BY status`,
    ),
    query<{ type: string; count: string }>(
      `SELECT i.type, count(*)::text AS count
         FROM studio_issues i
         JOIN studio_review r ON r.id = i.review_id
        WHERE i.resolved_at IS NULL
        GROUP BY i.type`,
    ),
  ]);

  const total = Number(totals[0]?.count ?? 0);

  return Response.json({
    success: true,
    data: {
      rows,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      counts: {
        status: Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.count)])),
        issue: Object.fromEntries(issueCounts.map((r) => [r.type, Number(r.count)])),
        all: statusCounts.reduce((s, r) => s + Number(r.count), 0),
      },
    },
  });
}
