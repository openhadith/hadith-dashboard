import { queryOne } from './db';
import { orderChain, type ChainLink } from './corpus';

/**
 * Chain drafts.
 *
 * An edited chain is stored whole, in order, as one `studio_entities` row of
 * type 'isnad' keyed by the hadith id — order is the meaning of an isnad, so a
 * partial patch would be ambiguous. Order is collector-first, as `orderChain`
 * returns corpus data, so both sources feed the same rendering code.
 *
 * The row also carries reviewer flags ("doubtful link"), which the corpus has
 * no column for. Once a draft is published its order matches the corpus
 * again; the row then survives only as those annotations and no longer counts
 * as an edit.
 */

export interface EditableLink extends ChainLink {
  /** Marked by a reviewer as a doubtful connection (e.g. a mudallis's ʿanʿana). */
  flagged?: boolean;
  note?: string | null;
}

export interface LoadedChain {
  links: EditableLink[];
  /** True when the dashboard holds an unpublished reordering of the chain. */
  edited: boolean;
  editedBy: string | null;
  editedAt: string | null;
  /** Distinct sanads in the corpus. Only single-sanad chains can be published. */
  sanadCount: number;
}

export const chainKey = (links: Array<{ rawyId: string | number }>) =>
  links.map((l) => String(l.rawyId)).join(',');

export async function loadChain(hadithId: string, corpusLinks: ChainLink[]): Promise<LoadedChain> {
  const corpus = orderChain(corpusLinks);
  const sanadCount = new Set(corpusLinks.map((l) => l.sanadId).filter(Boolean)).size;

  const stored = await queryOne<{
    payload: { links?: EditableLink[] };
    updated_at: string;
    updated_by_name: string | null;
  }>(
    `SELECT e.payload, e.updated_at, u.name AS updated_by_name
       FROM studio_entities e
       LEFT JOIN studio_users u ON u.id = e.updated_by
      WHERE e.entity_type = 'isnad' AND e.entity_id = $1 AND e.deleted_at IS NULL`,
    [hadithId],
  ).catch(() => null);

  const draft = stored?.payload?.links;
  if (!draft?.length) {
    return { links: corpus, edited: false, editedBy: null, editedAt: null, sanadCount };
  }

  if (chainKey(draft) === chainKey(corpus)) {
    const notes = new Map(draft.map((l) => [String(l.rawyId), l]));
    return {
      links: corpus.map((l) => ({
        ...l,
        flagged: notes.get(String(l.rawyId))?.flagged,
        note: notes.get(String(l.rawyId))?.note ?? null,
      })),
      edited: false,
      editedBy: stored!.updated_by_name,
      editedAt: stored!.updated_at,
      sanadCount,
    };
  }

  return {
    links: draft,
    edited: true,
    editedBy: stored!.updated_by_name,
    editedAt: stored!.updated_at,
    sanadCount,
  };
}
