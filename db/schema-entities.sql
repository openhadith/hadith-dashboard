-- CRUD storage for the studio.
--
-- Applied on top of schema.sql. Kept in its own file so it can be re-applied
-- without wiping the workflow tables.
--
-- The studio never writes to the corpus. Every create, edit and delete lands
-- here instead, and the browse screens render the corpus *merged with* this
-- table. Three cases:
--
--   origin='corpus', payload={...}        an override: these fields win over
--                                         the corpus record of the same id
--   origin='local',  payload={...}        a record that exists only here
--   deleted_at IS NOT NULL                a tombstone: hidden from listings,
--                                         never removed from the corpus
--
-- Nothing in here reaches api.openhadith.org, which is why a demo can delete
-- freely: `DELETE FROM studio_entities` restores the untouched corpus view.

BEGIN;

CREATE TABLE IF NOT EXISTS studio_entities (
  id          serial PRIMARY KEY,
  -- hadith | narrator | book | author | chapter | section | word | topic
  entity_type text NOT NULL,
  -- corpus id as text, or 'local:<n>' for records created here
  entity_id   text NOT NULL,
  origin      text NOT NULL DEFAULT 'corpus' CHECK (origin IN ('corpus', 'local')),
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at  timestamptz,
  created_by  int REFERENCES studio_users(id) ON DELETE SET NULL,
  updated_by  int REFERENCES studio_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS studio_entities_type_idx
  ON studio_entities (entity_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS studio_entities_live_idx
  ON studio_entities (entity_type) WHERE deleted_at IS NULL;

-- Counter for 'local:<n>' ids, so a new record gets a stable handle that can
-- never collide with a corpus id.
CREATE SEQUENCE IF NOT EXISTS studio_local_id_seq;

COMMIT;
