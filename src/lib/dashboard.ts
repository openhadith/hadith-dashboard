import { query } from './db';
import { API } from './backend';
import { readSession } from './session';
import { DECISION } from './stats';

export interface Activity {
  entity_id: string;
  label: string | null;
  detail: string | null;
  at: string;
}

export interface ActivityRow {
  id: number;
  action: string;
  entity_id: string | null;
  created_at: string;
  actor_name: string | null;
  avatar_tone: string | null;
}

/**
 * Gathers everything the dashboard paints in one pass.
 *
 * The comp shows six regions at once; loading them behind separate client
 * fetches would make the first paint visibly assemble itself, so they are
 * issued together here and the page stays a single await.
 */
export async function loadDashboard() {
  const session = await readSession();
  const me = session.user.id;

  const [statuses, week, health, resume, pinned, activity, leaders, mine] = await Promise.all([
    query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count FROM studio_review GROUP BY status`,
    ),
    query<{ day: string; count: string }>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(a.id)::text AS count
         FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') AS d(day)
         LEFT JOIN studio_audit a
                ON a.created_at::date = d.day
               AND (a.action LIKE 'status:%' OR a.action IN ('approve','reject','merge','publish'))
        GROUP BY d.day ORDER BY d.day`,
    ),
    query<{ total: string; clean: string; open_issues: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (
                WHERE NOT EXISTS (SELECT 1 FROM studio_issues i
                                   WHERE i.review_id = r.id AND i.resolved_at IS NULL)
              )::text AS clean,
              (SELECT count(*)::text FROM studio_issues WHERE resolved_at IS NULL) AS open_issues
         FROM studio_review r`,
    ),
    query<Activity>(
      `SELECT entity_id, label, detail, at FROM studio_activity
        WHERE user_id = $1 AND NOT pinned ORDER BY at DESC LIMIT 5`,
      [me],
    ),
    query<Activity>(
      `SELECT entity_id, label, detail, at FROM studio_activity
        WHERE user_id = $1 AND pinned ORDER BY at DESC LIMIT 5`,
      [me],
    ),
    query<ActivityRow>(
      `SELECT a.id, a.action, a.entity_id, a.created_at, u.name AS actor_name, u.avatar_tone
         FROM studio_audit a LEFT JOIN studio_users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 9`,
    ),
    query<{ name: string; avatar_tone: string; count: string }>(
      `SELECT u.name, u.avatar_tone, count(a.id)::text AS count
         FROM studio_users u
         LEFT JOIN studio_audit a
                ON a.actor_id = u.id
               AND a.created_at > now() - interval '7 days'
               AND (a.action LIKE 'status:%' OR a.action IN ('approve','reject','merge','publish'))
        GROUP BY u.id, u.name, u.avatar_tone
        ORDER BY count(a.id) DESC LIMIT 4`,
    ),
    query<{ count: string }>(
      `SELECT count(*)::text AS count FROM studio_review
        WHERE assignee_id = $1 AND status = 'pending'`,
      [me],
    ),
  ]);

  const byStatus = Object.fromEntries(statuses.map((r) => [r.status, Number(r.count)]));

  // The comp's KPI deltas and the hero's "x of y done today". Measured from the
  // audit trail over real windows rather than invented: `todayDone` is today's
  // decisions, `target` the daily average of the last seven days, and each
  // delta counts transitions into that state during the last seven days.
  const [pulse, corpusTotals, recentEdits] = await Promise.all([
    query<{
      today: string; week_now: string; week_prev: string;
      conflicts7: string; duplicates7: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE a.created_at::date = current_date AND ${DECISION})::text AS today,
         count(*) FILTER (WHERE a.created_at > now() - interval '7 days' AND ${DECISION})::text AS week_now,
         count(*) FILTER (WHERE a.created_at BETWEEN now() - interval '14 days'
                                              AND now() - interval '7 days' AND ${DECISION})::text AS week_prev,
         count(*) FILTER (WHERE a.created_at > now() - interval '7 days'
                            AND a.action = 'status:conflict')::text AS conflicts7,
         count(*) FILTER (WHERE a.created_at > now() - interval '7 days'
                            AND a.action = 'status:duplicate')::text AS duplicates7
       FROM studio_audit a`,
    ),
    fetch(`${API}/stats`, {
      next: { revalidate: 300 },
    })
      .then((r) => r.json())
      .then((b) => b?.data as { hadiths?: number; books?: number; narrators?: number } | undefined)
      .catch(() => undefined),
    query<ActivityRow & { entity_type: string | null }>(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at,
              u.name AS actor_name, u.avatar_tone
         FROM studio_audit a LEFT JOIN studio_users u ON u.id = a.actor_id
        WHERE a.action IN ('edit', 'create', 'isnad_edit')
        ORDER BY a.created_at DESC LIMIT 5`,
    ),
  ]);

  const n = (v: string | undefined) => Number(v ?? 0);
  const weekNow = n(pulse[0]?.week_now);
  const weekPrev = n(pulse[0]?.week_prev);
  const todayDone = n(pulse[0]?.today);
  // Target is the recent daily rate, floored at 1 so the hero never divides by
  // zero on a quiet week.
  const target = Math.max(1, Math.round(weekNow / 7));

  return {
    user: session.user,
    today: {
      done: todayDone,
      target,
      remaining: Math.max(0, target - todayDone),
    },
    corpus: {
      hadiths: corpusTotals?.hadiths ?? null,
      books: corpusTotals?.books ?? null,
      narrators: corpusTotals?.narrators ?? null,
    },
    trend: {
      // Percentage change in decisions, this week against the one before.
      weekPct: weekPrev ? Math.round(((weekNow - weekPrev) / weekPrev) * 100) : null,
      conflicts7: n(pulse[0]?.conflicts7),
      duplicates7: n(pulse[0]?.duplicates7),
    },
    recentEdits,
    kpis: {
      pending: byStatus.pending ?? 0,
      mine: Number(mine[0]?.count ?? 0),
      conflict: byStatus.conflict ?? 0,
      duplicate: byStatus.duplicate ?? 0,
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
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
