import { query } from '@/lib/db';
import { getHadith } from '@/lib/corpus';
import CompareView from '@/components/CompareView';

export const dynamic = 'force-dynamic';

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;

  // With nothing chosen, open on the closest *actual* pair rather than two
  // arbitrary flagged rows — a comparison screen showing 0% similarity teaches
  // nothing. Trigram similarity over the cached matn finds it in one query.
  let idA = a;
  let idB = b;
  if (!idA || !idB) {
    try {
      const rows = await query<{ a: string; b: string }>(
        `SELECT x.entity_id AS a, y.entity_id AS b
           FROM studio_review x
           JOIN studio_review y ON x.id < y.id
          WHERE length(x.snapshot->>'matn') > 40
            AND length(y.snapshot->>'matn') > 40
            -- A perfect 1.00 is the same text twice, which makes a dull diff;
            -- the interesting case is near-identical with real variation.
            AND similarity(left(x.snapshot->>'matn', 200), left(y.snapshot->>'matn', 200))
                BETWEEN 0.75 AND 0.99
          ORDER BY similarity(left(x.snapshot->>'matn', 200), left(y.snapshot->>'matn', 200)) DESC
          LIMIT 1`,
      );
      idA ??= rows[0]?.a;
      idB ??= rows[0]?.b;
    } catch {
      // pg_trgm missing or demo DB down — falls through to the empty state.
    }
  }

  const [ha, hb] = await Promise.all([
    idA ? getHadith(idA) : null,
    idB ? getHadith(idB) : null,
  ]);

  return <CompareView idA={idA ?? null} idB={idB ?? null} a={ha} b={hb} />;
}
