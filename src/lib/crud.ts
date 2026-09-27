import { audit, query, queryOne } from './db';
import { API } from './backend';
import { ENTITIES, fromCorpus, publishableFields, type EntityType } from './entities';

export interface EntityRow {
  id: string;
  origin: 'corpus' | 'local';
  /** True when a corpus record has an unpublished draft layered on top. */
  edited: boolean;
  /** True when that draft changes a field publishing would send to the corpus. */
  publishable?: boolean;
  data: Record<string, unknown>;
  updated_at?: string;
  updated_by_name?: string | null;
}

/** Form and corpus values compared loosely: '' and null are the same, 2 and '2' are the same. */
export function sameValue(a: unknown, b: unknown): boolean {
  const n = (v: unknown) => (v === undefined || v === '' ? null : v);
  const x = n(a);
  const y = n(b);
  if (x === null || y === null) return x === y;
  return String(x) === String(y);
}

const hasPublishable = (type: EntityType, payload: Record<string, unknown>) =>
  publishableFields(type).some((f) => f in payload);

const SINGLE_PATH: Partial<Record<EntityType, (id: string) => string>> = {
  hadith: (id) => `/hadiths/${id}`,
  narrator: (id) => `/narrators/${id}`,
  book: (id) => `/books/${id}`,
};

/**
 * The corpus record as it is right now, in dashboard field names.
 *
 * Never cached: drafts are diffed against it and publishing removes fields
 * from the draft, so a stale copy would show an old value as current.
 */
export async function corpusRecord(type: EntityType, id: string): Promise<Record<string, unknown> | null> {
  const path = SINGLE_PATH[type];
  if (!path || id.startsWith('local:')) return null;
  try {
    const res = await fetch(`${API}${path(id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    const raw = (body?.data?.narrator ?? body?.data) as Record<string, unknown> | undefined;
    return raw ? fromCorpus(type, raw) : null;
  } catch {
    return null;
  }
}

interface StoredRow {
  entity_id: string;
  origin: 'corpus' | 'local';
  payload: Record<string, unknown>;
  deleted_at: string | null;
  updated_at: string;
  updated_by_name: string | null;
}

async function storedFor(type: EntityType): Promise<Map<string, StoredRow>> {
  const rows = await query<StoredRow>(
    `SELECT e.entity_id, e.origin, e.payload, e.deleted_at, e.updated_at,
            u.name AS updated_by_name
       FROM studio_entities e
       LEFT JOIN studio_users u ON u.id = e.updated_by
      WHERE e.entity_type = $1`,
    [type],
  );
  return new Map(rows.map((r) => [r.entity_id, r]));
}

/**
 * Lists a type, merging corpus records with studio edits.
 *
 * Order of assembly matters: locally created records come first (they are the
 * newest work and would otherwise be buried on page 40), then the corpus page
 * with overrides applied and tombstoned rows dropped.
 */
export async function listEntities(
  type: EntityType,
  opts: { page?: number; limit?: number; q?: string; deletedOnly?: boolean } = {},
): Promise<{ rows: EntityRow[]; total: number; corpusTotal: number }> {
  const def = ENTITIES[type];
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, opts.limit ?? 25);
  const q = opts.q?.trim();

  const stored = await storedFor(type);

  // The bin: tombstoned corpus records, so a mistaken delete is recoverable.
  // Listed on its own rather than mixed into the main view, because a hidden
  // record is not part of the working set.
  if (opts.deletedOnly) {
    const gone = [...stored.values()]
      .filter((r) => r.deleted_at)
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .map((r) => ({
        id: r.entity_id,
        origin: r.origin,
        edited: true,
        data: r.payload,
        updated_at: r.updated_at,
        updated_by_name: r.updated_by_name,
      }));
    return { rows: gone, total: gone.length, corpusTotal: 0 };
  }

  // Locally created, newest first.
  const locals: EntityRow[] = [...stored.values()]
    .filter((r) => r.origin === 'local' && !r.deleted_at)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map((r) => ({
      id: r.entity_id,
      origin: 'local' as const,
      edited: false,
      data: r.payload,
      updated_at: r.updated_at,
      updated_by_name: r.updated_by_name,
    }))
    .filter((r) =>
      !q || String(r.data[def.titleField] ?? '').toLowerCase().includes(q.toLowerCase()),
    );

  // Types with no corpus counterpart are entirely local.
  if (!def.corpusList) {
    const start = (page - 1) * limit;
    return {
      rows: locals.slice(start, start + limit),
      total: locals.length,
      corpusTotal: 0,
    };
  }

  // Corpus page. Locals occupy the first slots, so the corpus offset shifts
  // by however many locals precede this page.
  const localCount = locals.length;
  const offset = Math.max(0, (page - 1) * limit - localCount);
  const need = limit - Math.max(0, Math.min(limit, localCount - (page - 1) * limit));

  let corpusRows: Array<Record<string, unknown>> = [];
  let corpusTotal = 0;

  if (need > 0) {
    try {
      const url = q
        ? `${API}/search?q=${encodeURIComponent(q)}&limit=${need}&page=${Math.floor(offset / limit) + 1}`
        : `${API}/${def.corpusList}?page=${Math.floor(offset / need) + 1}&limit=${need}`;
      const res = await fetch(url, { cache: 'no-store' });
      const body = await res.json();
      corpusRows = body?.data?.[def.corpusList] ?? [];
      corpusTotal = body?.data?.pagination?.totalCount ?? corpusRows.length;
    } catch {
      // The corpus being unreachable must not hide local work.
      corpusRows = [];
    }
  }

  const merged: EntityRow[] = corpusRows
    .map((row): EntityRow | null => {
      const id = String(row.id);
      const override = stored.get(id);
      if (override?.deleted_at) return null;
      return {
        id,
        origin: 'corpus',
        edited: !!override,
        publishable: !!override && hasPublishable(type, override.payload),
        data: { ...fromCorpus(type, row), ...(override?.payload ?? {}) },
        updated_at: override?.updated_at,
        updated_by_name: override?.updated_by_name ?? null,
      };
    })
    .filter((r): r is EntityRow => r !== null);

  const localSlice = locals.slice((page - 1) * limit, page * limit);

  return {
    rows: [...localSlice, ...merged].slice(0, limit),
    total: corpusTotal + localCount,
    corpusTotal,
  };
}

/** One record, corpus merged with any studio edit. */
export async function getEntity(type: EntityType, id: string): Promise<EntityRow | null> {
  const def = ENTITIES[type];
  const stored = await queryOne<StoredRow>(
    `SELECT e.entity_id, e.origin, e.payload, e.deleted_at, e.updated_at,
            u.name AS updated_by_name
       FROM studio_entities e
       LEFT JOIN studio_users u ON u.id = e.updated_by
      WHERE e.entity_type = $1 AND e.entity_id = $2`,
    [type, id],
  );

  if (stored?.deleted_at) return null;
  if (stored?.origin === 'local') {
    return {
      id, origin: 'local', edited: false, data: stored.payload,
      updated_at: stored.updated_at, updated_by_name: stored.updated_by_name,
    };
  }

  if (!def.corpusList) return null;

  const corpus = await corpusRecord(type, id);
  if (!corpus) {
    return stored
      ? { id, origin: 'corpus', edited: true, data: stored.payload, updated_at: stored.updated_at }
      : null;
  }
  return {
    id,
    origin: 'corpus',
    edited: !!stored,
    publishable: !!stored && hasPublishable(type, stored.payload),
    data: { ...corpus, ...(stored?.payload ?? {}) },
    updated_at: stored?.updated_at,
    updated_by_name: stored?.updated_by_name ?? null,
  };
}

/** Creates a studio-local record and returns its `local:<n>` id. */
export async function createEntity(
  type: EntityType,
  data: Record<string, unknown>,
  actorId: number,
): Promise<string> {
  const seq = await queryOne<{ n: string }>(`SELECT nextval('studio_local_id_seq')::text AS n`);
  const id = `local:${seq?.n ?? Date.now()}`;

  await query(
    `INSERT INTO studio_entities (entity_type, entity_id, origin, payload, created_by, updated_by)
     VALUES ($1, $2, 'local', $3, $4, $4)`,
    [type, id, JSON.stringify(data), actorId],
  );

  await audit({
    actorId, action: 'create', entityType: type, entityId: id,
    before: null, after: data,
  });

  return id;
}

/**
 * Saves an edit as a draft.
 *
 * For a corpus record the draft holds only the fields that differ from the
 * corpus right now — never a full copy, which would silently undo any later
 * change to the untouched fields when published. An edit that matches the
 * corpus again removes the draft. Nothing reaches the public site until the
 * draft is published.
 *
 * `data` may be partial; it is merged over the existing draft.
 */
export async function updateEntity(
  type: EntityType,
  id: string,
  data: Record<string, unknown>,
  actorId: number,
  reason?: string | null,
): Promise<void> {
  const before = await queryOne<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM studio_entities WHERE entity_type = $1 AND entity_id = $2`,
    [type, id],
  );

  const origin = id.startsWith('local:') ? 'local' : 'corpus';
  let payload = { ...(before?.payload ?? {}), ...data };

  if (origin === 'corpus') {
    const corpus = await corpusRecord(type, id);
    if (!corpus) throw new Error('نەتوانرا ڕەکۆردی سەرچاوە لە API بخوێنرێتەوە');
    // Dashboard-only fields (notes, …) have no corpus value; they count when non-empty.
    payload = Object.fromEntries(
      Object.entries(payload).filter(([k, v]) => !sameValue(v, k in corpus ? corpus[k] : null)),
    );
  }

  if (origin === 'corpus' && !Object.keys(payload).length) {
    await query(
      `DELETE FROM studio_entities WHERE entity_type = $1 AND entity_id = $2 AND deleted_at IS NULL`,
      [type, id],
    );
  } else {
    await query(
      `INSERT INTO studio_entities (entity_type, entity_id, origin, payload, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (entity_type, entity_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_by = EXCLUDED.updated_by,
                     updated_at = now(), deleted_at = NULL`,
      [type, id, origin, JSON.stringify(payload), actorId],
    );
  }

  await audit({
    actorId, action: 'edit', entityType: type, entityId: id,
    before: before?.payload ?? null, after: payload, reason: reason ?? null,
  });
}

/**
 * Removes a record.
 *
 * A locally created record is deleted outright; a corpus record gets a
 * tombstone, because there is nothing to delete upstream and the row must
 * reappear if the tombstone is ever lifted.
 */
export async function deleteEntity(
  type: EntityType,
  id: string,
  actorId: number,
  reason?: string | null,
): Promise<void> {
  const before = await queryOne<{ payload: Record<string, unknown>; origin: string }>(
    `SELECT payload, origin FROM studio_entities WHERE entity_type = $1 AND entity_id = $2`,
    [type, id],
  );

  if (id.startsWith('local:')) {
    await query(`DELETE FROM studio_entities WHERE entity_type = $1 AND entity_id = $2`, [type, id]);
  } else {
    await query(
      `INSERT INTO studio_entities (entity_type, entity_id, origin, payload, deleted_at, created_by, updated_by)
       VALUES ($1, $2, 'corpus', '{}'::jsonb, now(), $3, $3)
       ON CONFLICT (entity_type, entity_id)
       DO UPDATE SET deleted_at = now(), updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [type, id, actorId],
    );
  }

  await audit({
    actorId, action: 'delete', entityType: type, entityId: id,
    before: before?.payload ?? { id }, after: null, reason: reason ?? null,
  });
}

/** Lifts a tombstone, restoring a corpus record to listings. */
export async function restoreEntity(type: EntityType, id: string, actorId: number): Promise<void> {
  await query(
    `UPDATE studio_entities SET deleted_at = NULL, updated_by = $3, updated_at = now()
      WHERE entity_type = $1 AND entity_id = $2`,
    [type, id, actorId],
  );
  await audit({
    actorId, action: 'restore', entityType: type, entityId: id,
    before: { deleted: true }, after: { deleted: false },
  });
}

/** Counts of local additions, edits and tombstones — shown as a banner per type. */
export async function changeSummary(type: EntityType) {
  const rows = await query<{ created: string; edited: string; deleted: string }>(
    `SELECT
       count(*) FILTER (WHERE origin = 'local' AND deleted_at IS NULL)::text AS created,
       count(*) FILTER (WHERE origin = 'corpus' AND deleted_at IS NULL)::text AS edited,
       count(*) FILTER (WHERE deleted_at IS NOT NULL)::text AS deleted
     FROM studio_entities WHERE entity_type = $1`,
    [type],
  );
  return {
    created: Number(rows[0]?.created ?? 0),
    edited: Number(rows[0]?.edited ?? 0),
    deleted: Number(rows[0]?.deleted ?? 0),
  };
}
