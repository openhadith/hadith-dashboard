import { query, queryOne } from '@/lib/db';
import { readSession } from '@/lib/session';
import { getHadith } from '@/lib/corpus';
import { loadChain } from '@/lib/isnad';
import WorkstationView from '@/components/WorkstationView';
import SetupNotice from '@/components/SetupNotice';

export const dynamic = 'force-dynamic';

export default async function HadithWorkstation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let loaded: Awaited<ReturnType<typeof load>> | null = null;
  let error: string | undefined;

  try {
    loaded = await load(id);
  } catch (err) {
    error = (err as Error).message;
  }

  if (!loaded) return <SetupNotice error={error} />;

  return (
    <WorkstationView
      id={id}
      hadith={loaded.hadith}
      chain={loaded.chain.links}
      chainEdited={loaded.chain.edited}
      chainEditedBy={loaded.chain.editedBy}
      sanadCount={loaded.chain.sanadCount}
      draftMatn={loaded.draftMatn}
      review={loaded.review as never}
      issues={loaded.issues as never}
      revisions={loaded.revisions as never}
      users={loaded.users as never}
      nextId={loaded.next?.entity_id ?? null}
    />
  );
}

/** Everything the workstation paints, gathered in one pass. */
async function load(id: string) {
  {
    const session = await readSession();

    const [hadith, review, revisions, users, next, draft] = await Promise.all([
      getHadith(id),
      queryOne(
        `SELECT r.*, u.name AS assignee_name, u.avatar_tone, t.name AS team_name
           FROM studio_review r
           LEFT JOIN studio_users u ON u.id = r.assignee_id
           LEFT JOIN studio_teams t ON t.id = r.team_id
          WHERE r.entity_type = 'hadith' AND r.entity_id = $1`,
        [id],
      ),
      query(
        `SELECT rv.id, rv.payload, rv.note, rv.created_at, u.name AS author_name
           FROM studio_revisions rv
           LEFT JOIN studio_users u ON u.id = rv.author_id
          WHERE rv.entity_type = 'hadith' AND rv.entity_id = $1
          ORDER BY rv.created_at DESC LIMIT 8`,
        [id],
      ),
      query(`SELECT id, name, avatar_tone, role FROM studio_users ORDER BY id`),
      // "Save and next" needs its successor resolved server-side, so the button
      // never has to round-trip the list to know where it is going.
      queryOne<{ entity_id: string }>(
        `SELECT entity_id FROM studio_review
          WHERE entity_type = 'hadith' AND status = 'pending' AND entity_id <> $1
            AND assignee_id = $2
          ORDER BY updated_at ASC LIMIT 1`,
        [id, session.user.id],
      ),
      // The unpublished text, when someone has saved one.
      queryOne<{ payload: { matn?: string } }>(
        `SELECT payload FROM studio_entities
          WHERE entity_type = 'hadith' AND entity_id = $1 AND deleted_at IS NULL`,
        [id],
      ),
    ]);

    const issues = review
      ? await query(
          `SELECT type, severity, detector FROM studio_issues
            WHERE review_id = $1 AND resolved_at IS NULL`,
          [(review as { id: number }).id],
        )
      : [];

    // An unpublished chain draft, when there is one, replaces the corpus chain.
    const chain = await loadChain(id, hadith?.hadith_has_rawy ?? []);

    return { hadith, chain, review, issues, revisions, users, next, draftMatn: draft?.payload?.matn ?? null };
  }
}
