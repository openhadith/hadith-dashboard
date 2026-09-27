import { query } from './db';

import { API } from './backend';

/**
 * Figures for the statistics screen.
 *
 * Two sources, kept visibly apart on the page: the corpus totals come from the
 * public API (the same numbers the homepage shows), everything else is
 * editorial activity from the studio database — which the public site has no
 * view of at all.
 *
 * Deliberately absent: a grade distribution. Queue-row grades are seeded demo
 * metadata, and charting them would present invented rulings as a finding.
 */

/** Actions that count as an editorial decision, in both audit vocabularies. */
/**
 * What counts as an editorial decision, in both audit vocabularies: the
 * transition endpoint writes `status:approved`, while the seeded history uses
 * bare verbs. Exported so the dashboard and the statistics screen can never
 * drift into counting different things.
 *
 * Written against the alias `a` for studio_audit.
 */
export const DECISION = `(a.action LIKE 'status:%' OR a.action IN ('approve','reject','merge','publish'))`;

export async function loadStats() {
  const corpusPromise = fetch(`${API}/stats`, { next: { revalidate: 300 } })
    .then((r) => r.json())
    .then((b) => b?.data as { hadiths?: number; books?: number; narrators?: number } | undefined)
    .catch(() => undefined);

  const [
    corpus, statuses, issues, issueTotals, daily, reviewers, books, teams, edits, auditTotal,
  ] = await Promise.all([
    corpusPromise,

    query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count FROM studio_review GROUP BY status`,
    ),

    query<{ type: string; open: string; resolved: string }>(
      `SELECT type,
              count(*) FILTER (WHERE resolved_at IS NULL)::text AS open,
              count(*) FILTER (WHERE resolved_at IS NOT NULL)::text AS resolved
         FROM studio_issues GROUP BY type ORDER BY count(*) FILTER (WHERE resolved_at IS NULL) DESC`,
    ),

    query<{ open: string; resolved: string }>(
      `SELECT count(*) FILTER (WHERE resolved_at IS NULL)::text AS open,
              count(*) FILTER (WHERE resolved_at IS NOT NULL)::text AS resolved
         FROM studio_issues`,
    ),

    // Every day in the window, including silent ones — a gap in the series
    // is information and must not be closed up by skipping empty days.
    query<{ day: string; count: string }>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(a.id)::text AS count
         FROM generate_series(current_date - interval '29 days', current_date, interval '1 day') AS d(day)
         LEFT JOIN studio_audit a ON a.created_at::date = d.day AND ${DECISION}
        GROUP BY d.day ORDER BY d.day`,
    ),

    query<{ name: string; avatar_tone: string; decisions: string; edits: string }>(
      `SELECT u.name, u.avatar_tone,
              count(a.id) FILTER (WHERE ${DECISION})::text AS decisions,
              count(a.id) FILTER (WHERE a.action IN ('edit','create','isnad_edit'))::text AS edits
         FROM studio_users u
         LEFT JOIN studio_audit a ON a.actor_id = u.id AND a.created_at > now() - interval '30 days'
        GROUP BY u.id, u.name, u.avatar_tone
        ORDER BY count(a.id) FILTER (WHERE ${DECISION}) DESC`,
    ),

    query<{ book: string; total: string; done: string }>(
      `SELECT COALESCE(snapshot->>'bookTitle', 'نەزانراو') AS book,
              count(*)::text AS total,
              count(*) FILTER (WHERE status IN ('approved','published'))::text AS done
         FROM studio_review GROUP BY 1 ORDER BY count(*) DESC`,
    ),

    query<{ name: string; color: string; total: string; done: string }>(
      `SELECT t.name, t.color,
              count(r.id)::text AS total,
              count(r.id) FILTER (WHERE r.status IN ('approved','published'))::text AS done
         FROM studio_teams t LEFT JOIN studio_review r ON r.team_id = t.id
        GROUP BY t.id, t.name, t.color ORDER BY t.id`,
    ),

    query<{ entity_type: string; created: string; edited: string; deleted: string }>(
      `SELECT entity_type,
              count(*) FILTER (WHERE origin = 'local' AND deleted_at IS NULL)::text AS created,
              count(*) FILTER (WHERE origin = 'corpus' AND deleted_at IS NULL)::text AS edited,
              count(*) FILTER (WHERE deleted_at IS NOT NULL)::text AS deleted
         FROM studio_entities GROUP BY entity_type ORDER BY entity_type`,
    ),

    query<{ count: string }>(`SELECT count(*)::text AS count FROM studio_audit`),
  ]);

  const n = (v: string | undefined) => Number(v ?? 0);
  const byStatus = Object.fromEntries(statuses.map((s) => [s.status, n(s.count)]));
  const reviewed = Object.values(byStatus).reduce((s, v) => s + v, 0);
  const done = (byStatus.approved ?? 0) + (byStatus.published ?? 0);

  return {
    corpus: {
      hadiths: corpus?.hadiths ?? null,
      books: corpus?.books ?? null,
      narrators: corpus?.narrators ?? null,
    },
    totals: {
      reviewed,
      done,
      donePct: reviewed ? Math.round((done / reviewed) * 100) : 0,
      openIssues: n(issueTotals[0]?.open),
      resolvedIssues: n(issueTotals[0]?.resolved),
      auditEvents: n(auditTotal[0]?.count),
      decisions30: daily.reduce((s, d) => s + n(d.count), 0),
    },
    statuses: byStatus,
    issues: issues.map((i) => ({ type: i.type, open: n(i.open), resolved: n(i.resolved) })),
    daily: daily.map((d) => ({ day: d.day, count: n(d.count) })),
    reviewers: reviewers.map((r) => ({
      name: r.name, avatar_tone: r.avatar_tone, decisions: n(r.decisions), edits: n(r.edits),
    })),
    books: books.map((b) => ({ book: b.book, total: n(b.total), done: n(b.done) })),
    teams: teams.map((t) => ({ name: t.name, color: t.color, total: n(t.total), done: n(t.done) })),
    edits: edits.map((e) => ({
      type: e.entity_type, created: n(e.created), edited: n(e.edited), deleted: n(e.deleted),
    })),
  };
}

export type StatsData = Awaited<ReturnType<typeof loadStats>>;
