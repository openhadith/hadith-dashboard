import { query } from '@/lib/db';
import AssignmentsView from '@/components/AssignmentsView';
import SetupNotice from '@/components/SetupNotice';

export const dynamic = 'force-dynamic';

interface Loaded {
  people: Array<{ id: number; name: string; avatar_tone: string; role: string; open: number; done: number }>;
  byBook: Array<{ book: string; total: number; open: number }>;
  teams: unknown[];
  unassigned: number;
}

export default async function AssignmentsPage() {
  let loaded: Loaded | null = null;
  let error: string | undefined;

  try {
    const [people, byBook, teams, unassigned] = await Promise.all([
      // Workload per person, split by state so "open" is distinguishable from "done".
      query<{ id: string; name: string; avatar_tone: string; role: string; open: string; done: string }>(
        `SELECT u.id::text, u.name, u.avatar_tone, u.role,
                count(r.id) FILTER (WHERE r.status NOT IN ('approved','published','rejected'))::text AS open,
                count(r.id) FILTER (WHERE r.status IN ('approved','published'))::text AS done
           FROM studio_users u
           LEFT JOIN studio_review r ON r.assignee_id = u.id
          WHERE u.status = 'on'
          GROUP BY u.id, u.name, u.avatar_tone, u.role
          ORDER BY count(r.id) FILTER (WHERE r.status NOT IN ('approved','published','rejected')) DESC`,
      ),
      query<{ book: string; total: string; open: string }>(
        `SELECT COALESCE(snapshot->>'bookTitle','نەزانراو') AS book,
                count(*)::text AS total,
                count(*) FILTER (WHERE status NOT IN ('approved','published','rejected'))::text AS open
           FROM studio_review GROUP BY 1 ORDER BY count(*) DESC`,
      ),
      query(`SELECT id, name, color FROM studio_teams ORDER BY id`),
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM studio_review
          WHERE assignee_id IS NULL AND status NOT IN ('approved','published','rejected')`,
      ),
    ]);

    loaded = {
      people: people.map((p) => ({
        id: Number(p.id), name: p.name, avatar_tone: p.avatar_tone, role: p.role,
        open: Number(p.open), done: Number(p.done),
      })),
      byBook: byBook.map((b) => ({ book: b.book, total: Number(b.total), open: Number(b.open) })),
      teams,
      unassigned: Number(unassigned[0]?.count ?? 0),
    };
  } catch (err) {
    error = (err as Error).message;
  }

  if (!loaded) return <SetupNotice error={error} />;

  return (
    <AssignmentsView
      people={loaded.people}
      byBook={loaded.byBook}
      teams={loaded.teams as never}
      unassigned={loaded.unassigned}
    />
  );
}
