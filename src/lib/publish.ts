import { backend } from './backend';
import { READ_ONLY } from './config';
import { audit, query, queryOne } from './db';
import { ENTITIES, publishableFields, type EntityType } from './entities';
import { corpusRecord, sameValue } from './crud';
import { getHadith, orderChain } from './corpus';
import { chainKey, type EditableLink } from './isnad';
import type { StudioSession } from './session';

/**
 * Publishing: applying approved dashboard drafts to the corpus via the API.
 *
 * A draft is a `studio_entities` row holding only the fields that differ from
 * the corpus. Publishing sends the publishable ones to the API, which records
 * a revertable revision; whatever the corpus has no column for (notes, the
 * demo grade) stays behind as a dashboard-only draft.
 */

export interface PublishResult {
  ok: boolean;
  /** True when something actually reached the corpus. */
  changed: boolean;
  error?: string;
  code?: string | null;
  status?: number;
}

/**
 * Publishing is the only thing here that leaves the dashboard, so it checks the
 * deployment mode itself rather than trusting that a caller already did. Every
 * route into it is behind `approve`, which READ_ONLY refuses — this is the
 * second lock on the same door.
 */
function refuseWhenReadOnly(): PublishResult | null {
  if (!READ_ONLY) return null;
  return {
    ok: false,
    changed: false,
    status: 403,
    code: 'read_only',
    error: 'ئەم دەزگایە لە دۆخی خوێندنەوەدایە؛ هیچ شتێک بڵاو ناکرێتەوە',
  };
}

const NUMERIC = new Set(['rutba', 'tabaqah', 'number_of_parts']);

/** Form values onto the API's column types: '' is null, numbers are numbers. */
function toColumn(field: string, value: unknown): unknown {
  if (value === undefined || value === '') return null;
  if (NUMERIC.has(field)) return value === null ? null : Number(value);
  if (field === 'tadlis' || field === 'has_ikhtilat') return !!value;
  return value;
}

function explain(code: string | null, fallback: string | null): string {
  switch (code) {
    case 'branched_isnad':
      return 'ئەم حەدیسە چەند سەنەدێکی هەیە؛ دەستکاری زنجیرە تەنها بۆ حەدیسی یەک‌سەنەد بڵاو دەکرێتەوە. بۆ پەسەندکردن، زنجیرەکە بگەڕێنەرەوە بۆ ڕەسەن.';
    case 'irregular_isnad':
      return 'زنجیرەی ئەم حەدیسە لە سەرچاوەدا هێڵی نییە و ناتوانرێت لێرەوە دەستکاری بکرێت.';
    case 'no_isnad':
      return 'ئەم حەدیسە هیچ سەنەدێکی تۆمارکراوی نییە.';
    case 'stale_revision':
      return 'دوای ئەم گۆڕانکارییە دەستکاریی تر کراوە؛ سەرەتا ئەوانە بگەڕێنەرەوە.';
    case 'unreachable':
      return 'پەیوەندی بە API نەکرا.';
    default:
      return fallback ?? 'بڵاوکردنەوە سەرکەوتوو نەبوو';
  }
}

/** Publishes a hadith, narrator or book draft. No draft, or nothing publishable, is a no-op. */
export async function publishRecord(
  session: StudioSession,
  type: EntityType,
  id: string,
  reason?: string | null,
): Promise<PublishResult> {
  const refused = refuseWhenReadOnly();
  if (refused) return refused;

  const fields = publishableFields(type);
  const plural = ENTITIES[type].corpusList;
  if (!fields.length || !plural || id.startsWith('local:')) {
    return { ok: false, changed: false, status: 400, error: 'ئەم جۆرە تەنها لە دەزگاکەدایە و بڵاو ناکرێتەوە' };
  }

  const draft = await queryOne<{ payload: Record<string, unknown>; deleted_at: string | null }>(
    `SELECT payload, deleted_at FROM studio_entities
      WHERE entity_type = $1 AND entity_id = $2 AND origin = 'corpus'`,
    [type, id],
  );
  if (!draft || draft.deleted_at) return { ok: true, changed: false };

  const corpus = await corpusRecord(type, id);
  if (!corpus) return { ok: false, changed: false, status: 502, error: explain('unreachable', null) };

  const changes: Record<string, unknown> = {};
  const remaining: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(draft.payload)) {
    if (sameValue(value, corpus[field])) continue;
    if (fields.includes(field)) changes[field] = toColumn(field, value);
    else remaining[field] = value;
  }

  type Revision = { id: string; before: unknown; after: unknown };
  let revision: Revision | null = null;
  if (Object.keys(changes).length) {
    const r = await backend<{ changed: boolean; revision: Revision | null }>(`/${plural}/${id}`, {
      method: 'PATCH',
      token: session.token,
      body: { changes, reason: reason ?? null },
    });
    if (!r.ok) return { ok: false, changed: false, status: r.status, code: r.code, error: explain(r.code, r.error) };
    revision = r.data?.revision ?? null;
  }

  // What is now in the corpus leaves the draft; dashboard-only fields stay.
  if (Object.keys(remaining).length) {
    await query(
      `UPDATE studio_entities SET payload = $3, updated_at = now()
        WHERE entity_type = $1 AND entity_id = $2`,
      [type, id, JSON.stringify(remaining)],
    );
  } else {
    await query(`DELETE FROM studio_entities WHERE entity_type = $1 AND entity_id = $2`, [type, id]);
  }

  if (revision) {
    await audit({
      actorId: session.user.id,
      action: 'publish',
      entityType: type,
      entityId: id,
      before: revision.before,
      after: revision.after,
      reason: reason ?? null,
      ref: String(revision.id),
    });
  }
  return { ok: true, changed: !!revision };
}

/** Publishes an edited chain. The API refuses hadiths with more than one sanad. */
export async function publishIsnad(
  session: StudioSession,
  hadithId: string,
  reason?: string | null,
): Promise<PublishResult> {
  const refused = refuseWhenReadOnly();
  if (refused) return refused;

  const draft = await queryOne<{ payload: { links?: EditableLink[] } }>(
    `SELECT payload FROM studio_entities
      WHERE entity_type = 'isnad' AND entity_id = $1 AND deleted_at IS NULL`,
    [hadithId],
  );
  const links = draft?.payload?.links ?? [];
  if (!links.length) return { ok: true, changed: false };

  // A draft whose order already matches the corpus holds only reviewer flags;
  // there is nothing to send, and sending it would be refused for a branched
  // isnad even though nothing about the chain changed.
  const current = await getHadith(hadithId);
  if (!current) return { ok: false, changed: false, status: 502, error: explain('unreachable', null) };
  if (chainKey(links) === chainKey(orderChain(current.hadith_has_rawy ?? []))) {
    return { ok: true, changed: false };
  }

  const r = await backend<{ changed: boolean; revision: { id: string } | null }>(
    `/hadiths/${hadithId}/isnad`,
    {
      method: 'PUT',
      token: session.token,
      body: { narratorIds: links.map((l) => String(l.rawyId)), reason: reason ?? null },
    },
  );
  if (!r.ok) return { ok: false, changed: false, status: r.status, code: r.code, error: explain(r.code, r.error) };

  // Reviewer flags ("doubtful link") have no corpus column. A flagged chain is
  // kept as an annotation; its order now matches the corpus, so it no longer
  // counts as an edit.
  if (!links.some((l) => l.flagged)) {
    await query(`DELETE FROM studio_entities WHERE entity_type = 'isnad' AND entity_id = $1`, [hadithId]);
  }

  const revision = r.data?.revision;
  if (revision) {
    const chain = links.map((l) => l.rawy?.Shohra || l.rawy?.Name).join(' ← ').slice(0, 240);
    await audit({
      actorId: session.user.id,
      action: 'publish',
      entityType: 'isnad',
      entityId: hadithId,
      before: null,
      after: { narrators: links.length, chain },
      reason: reason ?? null,
      ref: String(revision.id),
    });
  }
  return { ok: true, changed: !!revision };
}

/**
 * Publishes everything pending for one hadith: its chain, then its text.
 *
 * The chain goes first because it is the part the API may refuse (branched
 * isnads); failing there leaves nothing half-published.
 */
export async function publishHadith(
  session: StudioSession,
  hadithId: string,
  reason?: string | null,
): Promise<PublishResult> {
  const isnad = await publishIsnad(session, hadithId, reason);
  if (!isnad.ok) return isnad;
  const record = await publishRecord(session, 'hadith', hadithId, reason);
  if (!record.ok) return record;
  return { ok: true, changed: isnad.changed || record.changed };
}
