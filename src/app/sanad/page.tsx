import { queryOne } from '@/lib/db';
import { getHadith } from '@/lib/corpus';
import { loadChain } from '@/lib/isnad';
import SanadView from '@/components/SanadView';

export const dynamic = 'force-dynamic';

export default async function SanadPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  // With no target chosen, open on something from the queue so the screen is
  // never empty on arrival.
  let targetId = id;
  if (!targetId) {
    try {
      const row = await queryOne<{ entity_id: string }>(
        `SELECT entity_id FROM studio_review WHERE entity_type = 'hadith'
          ORDER BY updated_at DESC LIMIT 1`,
      );
      targetId = row?.entity_id;
    } catch {
      targetId = undefined;
    }
  }

  const hadith = targetId ? await getHadith(targetId) : null;
  const chain = targetId
    ? await loadChain(targetId, hadith?.hadith_has_rawy ?? [])
    : { links: [], edited: false };

  return (
    <SanadView id={targetId ?? null} hadith={hadith} chain={chain.links} chainEdited={chain.edited} />
  );
}
