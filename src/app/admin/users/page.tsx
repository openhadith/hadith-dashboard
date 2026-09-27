import { query } from '@/lib/db';
import { permissionMatrix, refreshAccounts } from '@/lib/accounts';
import { readSession } from '@/lib/session';
import AdminUsersView from '@/components/AdminUsersView';
import SetupNotice from '@/components/SetupNotice';

export const dynamic = 'force-dynamic';

interface Loaded {
  users: unknown[]; teams: unknown[]; members: unknown[]; books: unknown[]; matrix: unknown[];
}

export default async function AdminUsersPage() {
  let loaded: Loaded | null = null;
  let error: string | undefined;

  try {
    const session = await readSession();
    // Accounts live in the API; bring any created or changed elsewhere into view.
    await refreshAccounts(session);

    const [users, teams, members, books, matrix] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.email, u.role, u.avatar_tone, u.status, u.last_seen,
                (SELECT count(*)::int FROM studio_review r WHERE r.assignee_id = u.id) AS workload
           FROM studio_users u WHERE u.backend_user_id IS NOT NULL ORDER BY u.id`,
      ),
      query(
        `SELECT t.id, t.name, t.color, t.scope, u.name AS lead_name,
                (SELECT count(*)::int FROM studio_review r WHERE r.team_id = t.id) AS total,
                (SELECT count(*)::int FROM studio_review r
                  WHERE r.team_id = t.id AND r.status IN ('approved','published')) AS done
           FROM studio_teams t LEFT JOIN studio_users u ON u.id = t.lead_id ORDER BY t.id`,
      ),
      query(
        `SELECT tm.team_id, tm.user_id, tm.role, u.name, u.avatar_tone
           FROM studio_team_members tm JOIN studio_users u ON u.id = tm.user_id
          ORDER BY tm.team_id, u.id`,
      ),
      query(`SELECT team_id, book_id, book_title FROM studio_team_books ORDER BY team_id`),
      permissionMatrix(session),
    ]);
    loaded = { users, teams, members, books, matrix };
  } catch (err) {
    error = (err as Error).message;
  }

  if (!loaded) return <SetupNotice error={error} />;

  return (
    <AdminUsersView
      users={loaded.users as never}
      teams={loaded.teams as never}
      members={loaded.members as never}
      books={loaded.books as never}
      matrix={loaded.matrix as never}
    />
  );
}
