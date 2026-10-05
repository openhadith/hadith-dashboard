# Hadith Dashboard

The editorial workstation for the Open Hadith corpus — a standalone **Next.js 16 +
TypeScript + Ant Design v6** app, RTL and Kurdish throughout.

It is a separate application from the public reading site (`hadith_platform`).
That split is deliberate: this is a dense, keyboard-driven workstation that owns
the viewport, while the public site is a document-oriented, SEO-driven reading
experience. They share no runtime and deploy independently.

It needs the hadith API running, because sign-in and publishing go through it.
Locally that is `hadith_platform_backend` against its own development database —
**never point a local dashboard at production**: whatever API `.env` names is
the one you sign in to and publish into.

```bash
# 1. the API, on a local copy of the corpus (see its migrations/README.md)
cd ../hadith_platform_backend
createdb hadith_corpus_dev
export DATABASE_URL=postgresql://$(whoami)@localhost:5432/hadith_corpus_dev
npm run dev:db && PORT=4005 npm run dev

# 2. the dashboard
cd ../hadith-dashboard
npm install
npm run db:setup    # workflow database + demo queue, seeded from the local API
npm run dev         # http://localhost:3006 — sign in as zana@muhaqqiq.org / hadith-dev
```

`npm run db:reset` drops and rebuilds the workflow database. Requires a local
PostgreSQL (built against 16) at `postgresql://localhost:5432`; override with
`STUDIO_DATABASE_URL` in `.env`.

---

## How the data flows

```
  hadith API (owns the corpus + accounts)      dashboard (owns the workflow)
  ───────────────────────────────────────      ─────────────────────────────
  api.openhadith.org → hadith_db               postgres …/hadith_studio
  hadiths, isnads, narrators, books            queue, assignments, issues, teams,
  users, roles, role × permission matrix       drafts, audit, activity
  corpus_revisions (every published change)
         ▲    │ reads                                     │
         │    └──────────────► dashboard ◄────────────────┘
         └── sign-in, publish, revert, accounts ──┘
                 │
                 └──► openhadith.org reads the same API, so a publish is live at once
```

The rules:

1. **Edits are drafts.** Saving a hadith, narrator, book or chain writes a
   `studio_entities` row holding only the fields that differ from the corpus.
   The dashboard shows the draft merged over the corpus; the public site does
   not see it.
2. **Approving publishes.** Approving a hadith (workstation or queue), or
   *پاشەکەوت و بڵاوکردنەوە* on a record, sends the draft to the API, which
   checks the `approve` permission itself, applies only the changed columns in
   one transaction and records a revision. The status becomes **بڵاوکراوە** when
   the public site changed, **پەسەندکراو** when there was nothing to send.
3. **Every publish is revertable.** The audit entry carries the API's revision
   id; reverting it re-applies the old values — unless the record has changed
   since, in which case the API refuses rather than overwrite that later work.
4. **The dashboard never holds corpus credentials.** It reaches the corpus only
   through the API, with the signed-in user's own token.

What publishes: a hadith's `matn`, `full_hadith` and `type`; narrator and book
columns; and a reordered chain — **only for hadiths with a single sanad**. A
hadith with several sanads is a branching structure the flat chain editor
cannot represent, so its chain edits are refused (the editor warns first).
Fields marked **تەنها لێرە** in the edit form (notes, the demo grade, citation
numbers), dashboard-only types (authors, chapters, glossary, topics), newly
created records and deletions all stay in the dashboard.

---

## CRUD

Seven record types, all through one generic screen driven by the field
definitions in `src/lib/entities.ts`:

| Type | Publishes to the corpus? |
|---|---|
| حەدیس · hadith | yes — matn, full text, type |
| ڕاویان · narrator | yes — every field |
| پەرتووکەکان · book | yes — every field but the author name |
| نووسەران · author | dashboard-only |
| بابەتەکان · chapter | dashboard-only |
| فەرهەنگ · word (glossary) | dashboard-only |
| بابەتە گشتییەکان · topic | dashboard-only |

Three storage cases, all in `studio_entities`:

- `origin='corpus'` — a **draft**: only the fields that differ from the corpus
  record of the same id, shown merged over it until published (or discarded —
  saving values equal to the corpus again removes the draft).
- `origin='local'` — a record that exists **only here**, with a `local:<n>` id
  that can never collide with a corpus id.
- `deleted_at IS NOT NULL` — a **tombstone**: hidden from listings, never
  removed from the corpus, restorable from the bin.

Glossary and topics are the clearest win: the public `/glossary` and `/topics`
pages are placeholders with no table behind them, so those records are native to
the dashboard rather than overrides.

Adding a field to `entities.ts` adds a table column and a form input with no
further work. Marking it `publish: true` makes approved edits to it reach the
corpus — only for fields that map 1:1 onto a column the API accepts.

### Editing an isnad

On the workstation, **دەستکاری** on the chain card opens the isnad editor:
reorder narrators, remove one, insert one found by name search, or flag a link as
doubtful with a note (e.g. «عنعنة مدلس»). The whole ordered chain is saved as one
`studio_entities` row of type `isnad`; when one exists it replaces the corpus
chain on both the workstation and the sanad explorer. **ڕەسەن** discards it.
Duplicate narrators and empty chains are rejected server-side.

Approving the hadith publishes the chain: the API rewrites only the links whose
(narrator, told-by) pair changed, keeping each surviving link's row and
attributes. It refuses hadiths with more than one sanad — the editor shows how
many there are and warns before you start. The «doubtful» flags have no corpus
column; they stay in the dashboard as annotations on the published chain.

---

## What is real and what is demo

Being precise about this matters — some of it is scholarly content.

**Real, from the corpus:** every matn, every isnad chain and narrator biography,
book and author metadata, recorded `hukmText`, scholarly assessments
(`إسناد N: …`) and their grades.

**Demo, generated by `db/seed.mjs` (`npm run db:setup`):** workflow statuses,
assignees, teams, detected "issues", the audit history, and the per-row `grade`
on queue rows. Seeded rows carry `snapshot.gradeSource = 'demo'` and the UI
marks the session with a **نموونە** badge in the top bar. **Never seed a
production database** — production uses `npm run db:init`, schema only.

The one thing to keep straight when demoing: **a queue row's grade chip is demo
metadata, not a ruling.** The real ruling is the `hukmText` and the assessment
grades shown on the workstation and sanad screens, which come from the corpus.

The statistics screen deliberately has no grade chart, for the same reason.

---

## Identity and permissions

Accounts live in the hadith API, the same `users` table the public site's API
uses. `/login` takes an email and password, the API checks them and returns a
JWT, and the dashboard keeps it in an httpOnly cookie. Public registration is
closed; admins create accounts under **بەکارهێنەر و تیم → بەکارهێنەران → هەژماری
نوێ**, and the first admin is made on the server with the API's
`npm run user:grant`.

Each account gets a dashboard profile (`studio_users`, linked by
`backend_user_id`) for teams, workload and presence. A profile seeded with the
same email as an account is claimed on first sign-in, which is how the demo
cast keeps its queue.

The top bar names the corpus this dashboard is pointed at: a green
**کۆپیی تاقیکردنەوە** chip for a test copy, a red **داتای ڕاستەقینە** chip when
it is the live one and approving reaches readers immediately. It comes from
`NEXT_PUBLIC_API_URL`, so it cannot drift from where publishing actually goes.

Signing out revokes the token at the API, not just the cookie. Ten failed
sign-ins lock an account for up to 15 minutes (the API counts them per account).

Permissions resolve from the API's role × permission matrix — the one
**ڕۆڵ و مۆڵەت** edits — and are enforced twice: by the dashboard on every
mutating endpoint, and by the API on every corpus write. Changing a cell applies
on the next request:

1. Sign in as `soran@muhaqqiq.org` (editor). Approve is disabled; forcing it
   returns `403` from the dashboard, and the API would refuse too.
2. As a supervisor, tick **دەستکار → پەسەند** in the matrix.
3. Back as soran — approving now publishes.

Deletion is gated on `merge` rather than `edit`, so an editor can change records
but not remove them.

---

## Screens

| Route | What it shows |
|---|---|
| `/login` | Email and password, checked by the API; development accounts listed when not in production |
| `/` | KPIs, week chart, corpus health, resume strip, team timeline, leaderboard |
| `/queue` | Validation queue — segmented filters, bulk actions, saved views, keyboard nav |
| `/hadith/[id]` | Workstation — matn editor, isnad editor, assessments, save→next (⌘↵) |
| `/sanad` | Isnad explorer — chain top-down, madar al-isnad, narrator inspector |
| `/compare` | Duplicate detection — word-level Arabic diff, field comparison |
| `/stats` | Decisions per day, status mix, reviewer activity, progress per book and team, issues by type — every chart also viewable as a table |
| `/hadiths` · `/narrators` · `/books` · `/authors` · `/chapters` · `/glossary` · `/topics` | CRUD |
| `/admin/users` | Teams, members, book scopes, editable role × permission matrix |
| `/admin/assignments` | Workload by person and by book, auto-rebalance |
| `/admin/audit` | Append-only trail, day-grouped, before→after diffs, revert |
| `/admin/quality` | Health score, issues by type and by book, bulk resolve |

Keyboard: `Ctrl+K` / `⌘K` opens the command palette anywhere (screens, a hadith
by id such as `HDT-4508`, and live corpus search); `↑↓` move, `Space` select,
`Enter` open, `Esc` clear selection, `⌘↵` / `Ctrl+↵` save and advance.

---

## Ant Design setup

- `src/lib/theme.ts` maps AntD's tokens onto the design palette, so a Table or
  Modal lands in the warm paper/emerald world rather than AntD blue. Status
  surfaces (`colorSuccessBg`, `colorInfoBg`, …) are pinned explicitly — AntD's
  derived defaults come out slate-blue and grey-green, visibly off-palette.
- `AntdProvider` wires `AntdRegistry` (SSR style extraction — without it the
  first paint is unstyled), `direction="rtl"`, and AntD's Kurdish `ku_IQ` locale
  so built-in strings match the chrome.
- Toasts go through `App.useApp()`, never the static `message.*` export, which
  renders outside the theme context.
- **Type:** three families, stacked so the browser picks per glyph. **Outfit**
  sets the interface — labels, numbers, buttons — but carries no Arabic script,
  so Kurdish falls through to **Vazirmatn**. Vazirmatn is drawn for Persian,
  which means Sorani's extra letters (ڕ ڵ ێ ۆ ە) are real glyphs in the family
  rather than additions bolted onto an Arabic-only face — they sit on the
  baseline and keep their counters open at 13px. Arabic matn is **Amiri**. The
  base is 16px on a 1.65 line-height, matching the reading site rather than
  shrinking for density.

  **Do not remove the `fallback` array on Outfit in `layout.tsx`.** Without it
  next/font appends a generated fallback and `--font-outfit` resolves to
  `"Outfit", "Outfit Fallback"`, where that fallback is `src: local(Arial)`.
  Arial covers Arabic script, so it answers for every Kurdish glyph and the
  browser never reaches Vazirmatn — the whole UI silently renders in Arial.
  `adjustFontFallback: false` looks like the fix but the Turbopack font loader
  in Next 16 ignores it; naming a fallback is what actually suppresses it.

- **Spacing:** one scale, `--sp-1` … `--sp-8` on `:root` in `globals.css`, and
  every gutter, gap and pad in the shell comes from it. The working surface is a
  `container-type: inline-size` context, so cards size against the room they
  actually have — the dashboard keeps a 348px side rail the viewport knows
  nothing about, and its stat tiles drop to 2×2 there while wider screens keep
  four across.

---

## Known gaps

- **Two-person approval** (BRD §7.2) is not enforced — publishing checks a
  single permission.
- **Branched isnads** (more than one sanad) cannot be edited as a chain.
- **Creating and deleting corpus records** is dashboard-only; so are authors,
  chapters, glossary and topics, and citation numbers (hadith number, page).
- **Queue population:** the demo seed fills the queue; in production a hadith
  enters it when first saved or decided on. Importing a book into the queue is
  not built.
- **Bulk reindex / bulk delete** on the quality screen are intentionally inert.

---

## Tests

```bash
npm test        # unit tests: what publishing sends, keeps and refuses (API and DB mocked)
npm run e2e     # the whole loop against the local stack: draft → approve → public → revert
```

`npm run e2e` needs the dashboard on :3006 and the API on :4005 with
`npm run dev:db` data. It publishes and reverts real records, so it first asks
the dashboard which API it is connected to and refuses unless that is local.
Sign-in lockout, token revocation and the API's write rules are covered by the
API's own integration tests (`npm run test:integration` there).

---

## Deploying

Nothing here deploys itself; each step is deliberate.

1. **API** (`hadith_platform_backend`): make sure `JWT_SECRET` is in the
   server's environment (the API now refuses to start without it), take a
   `pg_dump`, run `npm run migrate:editorial`, deploy the code, then
   `npm run user:grant -- <you> supervisor`.
2. **Dashboard**: a Postgres database for the workflow (`createdb hadith_studio`
   and `npm run db:init` — not `db:setup`), then `npm run build && npm start`
   (port 3006) under pm2 with `NEXT_PUBLIC_API_URL=https://api.openhadith.org/api`,
   `STUDIO_DATABASE_URL`, `NEXT_PUBLIC_SITE_URL=https://openhadith.org` and
   `NODE_ENV=production` (secure cookies, no development accounts on the login
   page), behind nginx with TLS on its own host name.
3. **Public site** (`hadith_platform`): build with `DASHBOARD_URL` set to that
   host name; `/login` and `/verification` redirect there. Ship after step 2.

### A shared read-only deployment, on the real corpus

The least setup that still gives people the actual dashboard: point it at the
corpus that already exists and refuse every write.

```
NEXT_PUBLIC_API_URL    = https://api.openhadith.org/api
STUDIO_DATABASE_URL    = postgresql://…      (the dashboard's own, still required)
DASHBOARD_LOCAL_SIGNIN = true
```

- **Nothing can be changed.** Every endpoint that writes passes through one
  guard, so the refusal is server-side, not a matter of which buttons were
  drawn. Drafts, approvals, publishing, account and permission changes all
  answer 403.
- **Sign-in is picking a name from a list.** No password, because nobody holds
  credentials for the corpus's accounts. That is why it forces read-only on by
  itself: a session anyone can start must not be able to write.
- Everyone signs in with `view` only, whatever role their profile carries, so
  the interface offers exactly what the server will allow. The admin screens
  need `admin` and redirect away.
- A **خوێندنەوە** chip sits in the top bar and a banner on the sign-in screen,
  so nobody mistakes it for the real thing.

It still needs its own database — the queue, drafts and audit trail live there,
and without one the main screens have nothing to show. Seed it with
`npm run db:seed`, which builds the demo queue from whatever corpus
`NEXT_PUBLIC_API_URL` points at.

Set `DASHBOARD_READ_ONLY=true` on its own to keep real password sign-in while
still refusing writes — the shape to use once accounts exist.

---

### A test deployment (e.g. Vercel), on a copy of the corpus

This needs the same two things any deployment does — a reachable API and a
reachable `STUDIO_DATABASE_URL` — it is just that both point at copies instead
of the real corpus. Nothing here is optional: without them the login page
loads, but every sign-in fails.

1. Host a copy of the corpus and a copy of the dashboard's workflow database
   somewhere reachable from the internet (Neon or Supabase both work; see the
   backend's own README for building the corpus copy).
2. Deploy the API (`hadith_platform_backend`) somewhere that runs a Node
   server — Vercel's functions cannot host it, since it is not this project.
3. On the dashboard's host, set:
   - `NEXT_PUBLIC_API_URL` → that API's URL
   - `STUDIO_DATABASE_URL` → the workflow database copy
   - `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=true` → lists the seeded test accounts
     (`zana@muhaqqiq.org` etc., password `hadith-dev`) on `/login`, so testers
     don't need credentials emailed to them. Leave it unset for the real
     deployment.

**`NEXT_PUBLIC_*` values are compiled into the build, not read at runtime.**
Setting or changing one and redeploying from already-built output does
nothing — the host has to run a fresh `npm run build` after the change (on
Vercel: redeploy; don't just edit the variable and expect it to apply).

If sign-in fails, `/login` itself explains why: it pings the API before
rendering and shows a banner with the exact URL and error when it cannot
reach it. The chrome's corpus chip (`کۆپیی تاقیکردنەوە` / `داتای ڕاستەقینە`)
is the same check surfaced after sign-in.

---

## Files

```
db/schema.sql                  workflow schema (10 tables, pg_trgm)
db/schema-entities.sql         drafts (studio_entities)
db/seed.mjs                    demo workflow, seeded from the API, fixed-seed PRNG
src/lib/db.ts                  pool + audit() helper
src/lib/backend.ts             authenticated calls to the hadith API
src/lib/session.ts             sign-in through the API, profiles, permission checks
src/lib/accounts.ts            accounts and the permission matrix, via the API
src/lib/publish.ts             drafts → API: records, chains, approval
src/lib/corpus.ts              read-only corpus client, chain ordering, grade mapping
src/lib/entities.ts            field definitions driving every CRUD screen
src/lib/crud.ts                corpus/draft merge, create/update/delete/restore
src/lib/isnad.ts               chain drafts and reviewer flags
src/lib/stats.ts               statistics queries
src/lib/theme.ts               AntD token mapping
src/lib/tokens.ts              palette, status/issue/grade maps, Arabic numerals
src/lib/diff.ts                normalised Arabic word diff
src/app/api/*                  route handlers
src/app/*                      pages
src/components/*               views, chrome, chart kit
```
