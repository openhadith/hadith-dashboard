-- Dashboard workflow schema.
--
-- This lives in its own database (`hadith_studio`), apart from the corpus. The
-- dashboard never writes the corpus directly: approved drafts are published
-- through the hadith API, which owns the corpus, the accounts and the role x
-- permission matrix. Every table here describes *governance* (who works on
-- what) or *workflow* (what state a record is in, what is drafted), and refers
-- to corpus rows only by the id the API exposes.

-- Trigram similarity backs the duplicate-detection screens: it is how the
-- Compare view finds the closest pair without a precomputed cluster table.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

BEGIN;

DROP TABLE IF EXISTS studio_activity, studio_saved_views, studio_audit,
  studio_revisions, studio_issues, studio_review, studio_permissions,
  studio_team_books, studio_team_members, studio_teams, studio_users CASCADE;

-- ---------------------------------------------------------------- governance

-- The dashboard's profile of an API account. Identity, password and role live
-- in the API (users / user_has_roles); `role` here is a copy for list screens,
-- refreshed on every sign-in.
CREATE TABLE studio_users (
  id          serial PRIMARY KEY,
  -- users.id in the hadith API; NULL until the account first signs in
  backend_user_id bigint UNIQUE,
  name        text NOT NULL,
  email       text UNIQUE NOT NULL,
  -- supervisor | muhaqqiq | editor | reviewer | viewer
  role        text NOT NULL DEFAULT 'viewer',
  -- palette key for the avatar chip: g(reen) a(mber) b(lue) p(lum) r(ust)
  avatar_tone text NOT NULL DEFAULT 'g',
  status      text NOT NULL DEFAULT 'on',
  last_seen   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE studio_teams (
  id      serial PRIMARY KEY,
  name    text NOT NULL,
  color   text NOT NULL DEFAULT '#2f6f5b',
  scope   text,
  lead_id int REFERENCES studio_users(id) ON DELETE SET NULL
);

CREATE TABLE studio_team_members (
  team_id int NOT NULL REFERENCES studio_teams(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES studio_users(id) ON DELETE CASCADE,
  role    text NOT NULL DEFAULT 'viewer',
  PRIMARY KEY (team_id, user_id)
);

-- Teams are scoped to books, mirroring `book_teams` in the production schema.
-- book_id points at the corpus; book_title is denormalised so list screens
-- render without a second round trip to the live API.
CREATE TABLE studio_team_books (
  team_id    int NOT NULL REFERENCES studio_teams(id) ON DELETE CASCADE,
  book_id    text NOT NULL,
  book_title text NOT NULL,
  PRIMARY KEY (team_id, book_id)
);

-- The role x permission matrix is not stored here: it lives in the API's
-- roles / permissions / role_has_permissions tables, which the API also
-- enforces on every corpus write. (studio_permissions stays in the DROP list
-- above only so older databases are cleaned up.)

-- ------------------------------------------------------------------ workflow

CREATE TABLE studio_review (
  id          serial PRIMARY KEY,
  -- hadith | narrator | book | sanad | word
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  -- pending | discuss | research | conflict | duplicate | approved | rejected | published
  status      text NOT NULL DEFAULT 'pending',
  grade       text,
  assignee_id int REFERENCES studio_users(id) ON DELETE SET NULL,
  team_id     int REFERENCES studio_teams(id) ON DELETE SET NULL,
  priority    int NOT NULL DEFAULT 0,
  -- Cached corpus fields (matn, source label, ...) so the queue paints in one
  -- query instead of 50 fetches against the live API.
  snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX studio_review_status_idx   ON studio_review (status);
CREATE INDEX studio_review_assignee_idx ON studio_review (assignee_id);
CREATE INDEX studio_review_updated_idx  ON studio_review (updated_at DESC);

-- Backs both the queue's issue badges and the Data Quality screen: one source,
-- two readings.
CREATE TABLE studio_issues (
  id          serial PRIMARY KEY,
  review_id   int NOT NULL REFERENCES studio_review(id) ON DELETE CASCADE,
  -- sanad | dup | ref | unknown | conflict
  type        text NOT NULL,
  severity    text NOT NULL DEFAULT 'warn',
  -- auto (a detector found it) | human (a reviewer flagged it)
  detector    text NOT NULL DEFAULT 'auto',
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz
);

CREATE INDEX studio_issues_review_idx ON studio_issues (review_id);
CREATE INDEX studio_issues_open_idx   ON studio_issues (type) WHERE resolved_at IS NULL;

-- Save history from the workstation (what changed, with the reviewer's note).
-- The live draft itself is the studio_entities row; this is its trail.
CREATE TABLE studio_revisions (
  id          serial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  author_id   int REFERENCES studio_users(id) ON DELETE SET NULL,
  payload     jsonb NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX studio_revisions_entity_idx ON studio_revisions (entity_type, entity_id, created_at DESC);

-- Append-only. Nothing in the app issues an UPDATE or DELETE against this table;
-- a revert writes a *new* row, which is what the Audit Log comp's note #4 asks for.
CREATE TABLE studio_audit (
  id          serial PRIMARY KEY,
  actor_id    int REFERENCES studio_users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  -- external reference; for 'publish' rows, the API's corpus_revisions id,
  -- which is what reverting a publish undoes
  ref         text,
  -- marks that a *later* row undid this one, for the UI's "reverted" ribbon
  reverted    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX studio_audit_created_idx ON studio_audit (created_at DESC);

CREATE TABLE studio_saved_views (
  id      serial PRIMARY KEY,
  user_id int REFERENCES studio_users(id) ON DELETE CASCADE,
  label   text NOT NULL,
  icon    text,
  query   jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Feeds the dashboard's "pick up where you left off" strip and the pinned rail.
CREATE TABLE studio_activity (
  id          serial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES studio_users(id) ON DELETE CASCADE,
  entity_type text,
  entity_id   text,
  label       text,
  detail      text,
  pinned      boolean NOT NULL DEFAULT false,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX studio_activity_user_idx ON studio_activity (user_id, at DESC);

COMMIT;
