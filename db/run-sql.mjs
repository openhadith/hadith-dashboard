/**
 * Applies .sql files to STUDIO_DATABASE_URL.
 *
 *   STUDIO_DATABASE_URL=... node db/run-sql.mjs db/schema.sql db/schema-entities.sql
 *
 * Not psql: a pooled connection string from a hosted Postgres carries query
 * parameters libpq does not know, and psql refuses the whole URL rather than
 * ignoring them — `?pgbouncer=true` gives "invalid URI query parameter", the
 * same way `?schema=` once broke a backend deploy. `pg` is already a dependency
 * here, takes those strings as given, and needs nothing installed.
 *
 * It is stricter about one thing: `sslmode=require` is treated as verify-full,
 * so the host must present a valid certificate. Hosted Postgres does; a local
 * server has no sslmode on its URL at all.
 */
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node db/run-sql.mjs <file.sql> [...]');
  process.exit(2);
}

const connectionString =
  process.env.STUDIO_DATABASE_URL || 'postgresql://localhost:5432/hadith_studio';

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  for (const file of files) {
    // One call per file, simple query protocol: each keeps its own
    // BEGIN/COMMIT and runs as written, statement order included.
    await client.query(await readFile(file, 'utf8'));
    console.log(`applied ${file}`);
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
