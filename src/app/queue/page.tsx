import { query } from '@/lib/db';
import { readSession } from '@/lib/session';
import QueueView from '@/components/QueueView';
import SetupNotice from '@/components/SetupNotice';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  let loaded: { users: unknown[]; views: unknown[]; teams: unknown[] } | null = null;
  let error: string | undefined;

  try {
    const session = await readSession();
    const [users, views, teams] = await Promise.all([
      query(`SELECT id, name, avatar_tone, role FROM studio_users ORDER BY id`),
      query(`SELECT label, icon, query FROM studio_saved_views WHERE user_id = $1 ORDER BY id`, [
        session.user.id,
      ]),
      query(`SELECT id, name, color FROM studio_teams ORDER BY id`),
    ]);
    loaded = { users, views, teams };
  } catch (err) {
    error = (err as Error).message;
  }

  if (!loaded) return <SetupNotice error={error} />;

  return (
    <QueueView
      users={loaded.users as never}
      savedViews={loaded.views as never}
      teams={loaded.teams as never}
    />
  );
}
