import { Pool } from 'pg';

/**
 * Connection pool for the studio demo database.
 *
 * This is a *second*, deliberately separate database from the corpus that
 * `NEXT_PUBLIC_API_URL` serves. The studio only ever writes here; corpus
 * content is read over HTTP and never mutated. See studio/schema.sql.
 *
 * The pool is cached on globalThis because Next's dev server re-evaluates
 * modules on every hot reload, and a fresh Pool per reload leaks connections
 * until Postgres refuses new ones.
 */
const globalForPool = globalThis as unknown as { studioPool?: Pool };

export const pool =
  globalForPool.studioPool ??
  new Pool({
    connectionString:
      process.env.STUDIO_DATABASE_URL || 'postgresql://localhost:5432/hadith_studio',
    // One pool per running instance. A long-lived server has exactly one and
    // can afford a wide pool; serverless has one per concurrent invocation, so
    // the same number there multiplies into hundreds of connections and
    // exhausts a small managed Postgres. Override with STUDIO_DB_POOL_MAX.
    max: Number(process.env.STUDIO_DB_POOL_MAX) || (process.env.VERCEL ? 2 : 10),
    // Managed Postgres hangs up on idle clients; let the pool drop them first
    // so a reused instance never picks up a dead connection.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

// Cached so a hot reload in development, or a reused serverless instance, does
// not open a second pool and leak the first one's connections.
globalForPool.studioPool = pool;

/** Runs a parameterised query and returns the rows. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

/** Runs a query expected to yield at most one row. */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Writes an audit row.
 *
 * Every mutating endpoint calls this. The table is append-only by convention:
 * nothing in the app issues UPDATE or DELETE against it, and a revert records a
 * new row rather than erasing the old one.
 */
export async function audit(entry: {
  actorId: number | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ref?: string | null;
}) {
  await query(
    `INSERT INTO studio_audit (actor_id, action, entity_type, entity_id, before, after, reason, ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      entry.actorId,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.reason ?? null,
      entry.ref ?? null,
    ],
  );
}
