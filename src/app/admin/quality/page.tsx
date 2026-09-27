import { query } from '@/lib/db';
import QualityView from '@/components/QualityView';
import SetupNotice from '@/components/SetupNotice';

export const dynamic = 'force-dynamic';

interface Loaded {
  summary: { total: number; clean: number; open: number; resolved: number };
  byType: Array<{ type: string; count: number; auto: number }>;
  flagged: unknown[];
  byBook: Array<{ book: string; count: number }>;
}

export default async function QualityPage() {
  let loaded: Loaded | null = null;
  let error: string | undefined;

  try {
    const [summary, byType, flagged, byBook] = await Promise.all([
      query<{ total: string; clean: string; open: string; resolved: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (
                  WHERE NOT EXISTS (SELECT 1 FROM studio_issues i
                                     WHERE i.review_id = r.id AND i.resolved_at IS NULL)
                )::text AS clean,
                (SELECT count(*)::text FROM studio_issues WHERE resolved_at IS NULL) AS open,
                (SELECT count(*)::text FROM studio_issues WHERE resolved_at IS NOT NULL) AS resolved
           FROM studio_review r`,
      ),
      query<{ type: string; count: string; auto: string }>(
        `SELECT type, count(*)::text AS count,
                count(*) FILTER (WHERE detector = 'auto')::text AS auto
           FROM studio_issues WHERE resolved_at IS NULL
          GROUP BY type ORDER BY count(*) DESC`,
      ),
      query(
        `SELECT r.id, r.entity_id, r.status, r.snapshot,
                i.id AS issue_id, i.type, i.severity, i.detector
           FROM studio_issues i
           JOIN studio_review r ON r.id = i.review_id
          WHERE i.resolved_at IS NULL
          ORDER BY CASE i.severity WHEN 'error' THEN 0 ELSE 1 END, r.updated_at DESC
          LIMIT 40`,
      ),
      // Which books carry the most unresolved problems — where to send effort.
      query<{ book: string; count: string }>(
        `SELECT COALESCE(r.snapshot->>'bookTitle', 'نەزانراو') AS book, count(i.id)::text AS count
           FROM studio_issues i JOIN studio_review r ON r.id = i.review_id
          WHERE i.resolved_at IS NULL
          GROUP BY 1 ORDER BY count(i.id) DESC LIMIT 8`,
      ),
    ]);

    loaded = {
      summary: {
        total: Number(summary[0]?.total ?? 0),
        clean: Number(summary[0]?.clean ?? 0),
        open: Number(summary[0]?.open ?? 0),
        resolved: Number(summary[0]?.resolved ?? 0),
      },
      byType: byType.map((t) => ({ type: t.type, count: Number(t.count), auto: Number(t.auto) })),
      flagged,
      byBook: byBook.map((b) => ({ book: b.book, count: Number(b.count) })),
    };
  } catch (err) {
    error = (err as Error).message;
  }

  if (!loaded) return <SetupNotice error={error} />;

  return (
    <QualityView
      summary={loaded.summary}
      byType={loaded.byType}
      flagged={loaded.flagged as never}
      byBook={loaded.byBook}
    />
  );
}
