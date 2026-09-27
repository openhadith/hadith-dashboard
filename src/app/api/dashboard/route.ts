import { query } from '@/lib/db';
import { readSession } from '@/lib/session';

/**
 * Everything the dashboard paints, in one request.
 *
 * The comp shows six regions (KPIs, week chart, corpus health, resume strip,
 * pinned, team activity + leaderboard). Fetching those separately would make
 * the first paint stagger visibly, so they are gathered here and the page stays
 * a single await.
 */
export async function GET() {
  const session = await readSession();
  const me = session.user.id;

  const [
    kpis,
    week,
    health,
    resume,
    pinned,
    activity,
    leaders,
  ] = await Promise.all([
    query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count FROM studio_review GROUP BY status`,
    ),

    // Approvals per day for the last 7 days, for the bar chart.
    query<{ day: string; count: string }>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              count(a.id)::text AS count
         FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') AS d(day)
         LEFT JOIN studio_audit a
                ON a.created_at::date = d.day
               AND a.action IN ('approve', 'status:approved', 'publish', 'status:published')
        GROUP BY d.day ORDER BY d.day`,
    ),

    // Corpus health: share of records with no open issue.
    query<{ total: string; clean: string; open_issues: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (
                WHERE NOT EXISTS (
                  SELECT 1 FROM studio_issues i
                   WHERE i.review_id = r.id AND i.resolved_at IS NULL)
              )::text AS clean,
              (SELECT count(*)::text FROM studio_issues WHERE resolved_at IS NULL) AS open_issues
         FROM studio_review r`,
    ),

    // "Pick up where you left off" — the comp's note #1.
    query(
      `SELECT entity_id, label, detail, at
         FROM studio_activity
        WHERE user_id = $1 AND NOT pinned
        ORDER BY at DESC LIMIT 6`,
      [me],
    ),

    query(
      `SELECT entity_id, label, detail, at
         FROM studio_activity
        WHERE user_id = $1 AND pinned
        ORDER BY at DESC LIMIT 6`,
      [me],
    ),

    // Team activity rail.
    query(
      `SELECT a.id, a.action, a.entity_id, a.created_at,
              u.name AS actor_name, u.avatar_tone
         FROM studio_audit a
         LEFT JOIN studio_users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 10`,
    ),

    // Weekly leaderboard — decisions made, not records touched.
    // Actions arrive in two shapes: `status:approved` from the transition
    // endpoint, and bare verbs (`approve`, `merge`, …) from the seeded history.
    // Counting both keeps the board honest across a freshly seeded demo.
    query(
      `SELECT u.name, u.avatar_tone, count(a.id)::text AS count
         FROM studio_users u
         LEFT JOIN studio_audit a
                ON a.actor_id = u.id
               AND a.created_at > now() - interval '7 days'
               AND (a.action LIKE 'status:%'
                    OR a.action IN ('approve', 'reject', 'merge', 'publish'))
        GROUP BY u.id, u.name, u.avatar_tone
        ORDER BY count(a.id) DESC LIMIT 5`,
    ),
  ]);

  const byStatus = Object.fromEntries(kpis.map((r) => [r.status, Number(r.count)]));
  const mine = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM studio_review WHERE assignee_id = $1 AND status = 'pending'`,
    [me],
  );

  return Response.json({
    success: true,
    data: {
      user: session.user,
      permissions: session.permissions,
      kpis: {
        pending: byStatus.pending ?? 0,
        mine: Number(mine[0]?.count ?? 0),
        conflict: byStatus.conflict ?? 0,
        duplicate: byStatus.duplicate ?? 0,
        approved: byStatus.approved ?? 0,
        published: byStatus.published ?? 0,
      },
      week: week.map((w) => ({ day: w.day, count: Number(w.count) })),
      health: {
        total: Number(health[0]?.total ?? 0),
        clean: Number(health[0]?.clean ?? 0),
        openIssues: Number(health[0]?.open_issues ?? 0),
      },
      resume,
      pinned,
      activity,
      leaders: leaders.map((l) => ({ ...l, count: Number(l.count) })),
    },
  });
}
